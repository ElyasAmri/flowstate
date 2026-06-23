// Editor state for the flow authoring tool.
//
// Holds the flow being edited and the current selection as Svelte 5 runes
// ($state), and exposes pure mutation helpers. Persistence is intentionally a
// seam: `serialize()` returns the plain `FlowDefinition` so a later Tauri save
// command can write it to the Flow Configuration without touching the views.

import type {
  ChannelRegistry,
  FlowDefinition,
  FlowEdge,
  FlowNode,
  NodeKind,
  Position,
  VarDecl,
} from "./types";
import { isEntryChannel } from "./types";
import { FlowHistory } from "./history";
import { compileFlow } from "./compile";
import { tryInvoke } from "./tauri";

/** Outcome of compiling the flow to a runnable maestro flow. */
export interface CompileOutcome {
  ok: boolean;
  /** Blocking compile/validation problems (empty when `ok`). */
  errors: string[];
  /** Where the compiled YAML was written (present when `ok` under Tauri). */
  path?: string;
}

/** Persistence status, surfaced in the editor header as a save indicator. */
export type SaveState = "idle" | "saving" | "saved" | "error";

/** Monotonic id helper so added nodes/edges get unique, readable ids. */
function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Default label for a freshly-added node of a given kind. */
function defaultLabel(kind: NodeKind): string {
  switch (kind) {
    case "channel":
      return "New channel";
    case "agent":
      return "New agent step";
    case "action":
      return "New action";
    case "decision":
      return "New decision";
  }
}

export class FlowEditor {
  flow = $state<FlowDefinition>(undefined as unknown as FlowDefinition);
  selectedNodeId = $state<string | null>(null);
  /**
   * The channel registry (id -> definition) used to derive node colors/icons.
   * Set by the view once channels are loaded; defaults to empty so the canvas
   * renders (gray fallback) before it arrives.
   */
  channels = $state<ChannelRegistry>({});
  /** Last-known persistence status (drives the header save indicator). */
  saveState = $state<SaveState>("idle");
  /** Reactive history flags driving the undo/redo affordances. */
  canUndo = $state(false);
  canRedo = $state(false);

  // Whole-flow snapshot history. The initial flow is the baseline; undo never
  // goes past it. Plain (non-rune) object: it stores defensive clones.
  private history: FlowHistory<FlowDefinition>;

  // Serialized form of the last flow successfully written to disk (or loaded
  // from it). `null` means nothing has been persisted yet, so the first save
  // always proceeds. Drives `isDirty()` so autosave can skip no-op writes.
  private lastSaved: string | null = null;

  constructor(initial: FlowDefinition) {
    this.flow = initial;
    this.history = new FlowHistory<FlowDefinition>($state.snapshot(initial));
  }

  /**
   * Record the current flow as a history entry, then refresh the reactive
   * undo/redo flags. `coalesceKey` folds a burst (one drag, one field's typing)
   * into a single undo step -- see FlowHistory.
   */
  private commit(coalesceKey?: string): void {
    this.history.commit($state.snapshot(this.flow), coalesceKey);
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
  }

  /** Replace the flow from a restored snapshot and revalidate selection. */
  private restore(snapshot: FlowDefinition): void {
    this.flow = snapshot;
    // The inspector must never point at a node that no longer exists.
    if (
      this.selectedNodeId !== null &&
      !this.flow.nodes.some((n) => n.id === this.selectedNodeId)
    ) {
      this.selectedNodeId = null;
    }
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
  }

  /**
   * Bare file name this flow persists as (`flows/<name>.json`). Derived from the
   * flow id, which the fixture already keeps to a safe slug.
   */
  get name(): string {
    return this.flow.id;
  }

  /** The currently selected node, or null. */
  get selectedNode(): FlowNode | null {
    if (this.selectedNodeId === null) return null;
    return this.flow.nodes.find((n) => n.id === this.selectedNodeId) ?? null;
  }

  /**
   * The flow's entry "doors": channel nodes bound to an inbound channel. A
   * consumer submits a payload to one of these to trigger a run -- there is no
   * global start. Derived from the loaded channel registry.
   */
  get entryNodes(): FlowNode[] {
    return this.flow.nodes.filter((n) =>
      isEntryChannel(n, this.channels, this.flow.edges),
    );
  }

  /** Edges leaving the given node. */
  outgoingEdges(nodeId: string): FlowEdge[] {
    return this.flow.edges.filter((e) => e.from === nodeId);
  }

  select(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
  }

  /** Replace the channel registry used for color/icon derivation. */
  setChannels(registry: ChannelRegistry): void {
    this.channels = registry;
  }

  /** Add a node at a position; returns its new id and selects it. */
  addNode(kind: NodeKind, position: Position): string {
    const id = makeId("n");
    const node: FlowNode = { id, kind, label: defaultLabel(kind), position };
    this.flow.nodes.push(node);
    this.selectedNodeId = id;
    this.commit();
    return id;
  }

  /** Patch fields on a node by id. */
  updateNode(id: string, patch: Partial<Omit<FlowNode, "id">>): void {
    const node = this.flow.nodes.find((n) => n.id === id);
    if (!node) return;
    Object.assign(node, patch);
    // Coalesce a typing burst into one field of one node into a single step.
    const field = Object.keys(patch)[0] ?? "?";
    this.commit(`node:${id}:${field}`);
  }

  moveNode(id: string, position: Position): void {
    const node = this.flow.nodes.find((n) => n.id === id);
    if (!node) return;
    node.position = position;
    // Coalesce all moves during one drag of this node into a single step.
    this.commit(`drag:${id}`);
  }

  /** End an in-progress drag so the next drag is its own undo step. */
  endDrag(): void {
    this.history.breakCoalescing();
  }

  /** Delete a node and any edges touching it. */
  deleteNode(id: string): void {
    this.flow.nodes = this.flow.nodes.filter((n) => n.id !== id);
    this.flow.edges = this.flow.edges.filter(
      (e) => e.from !== id && e.to !== id,
    );
    if (this.selectedNodeId === id) this.selectedNodeId = null;
    this.commit();
  }

  /** Connect two nodes; ignores self-loops and exact duplicates. */
  addEdge(from: string, to: string): string | null {
    if (from === to) return null;
    const exists = this.flow.edges.some((e) => e.from === from && e.to === to);
    if (exists) return null;
    const id = makeId("e");
    this.flow.edges.push({ id, from, to });
    this.commit();
    return id;
  }

  updateEdge(
    id: string,
    patch: Partial<Omit<FlowEdge, "id" | "from" | "to">>,
  ): void {
    const edge = this.flow.edges.find((e) => e.id === id);
    if (!edge) return;
    Object.assign(edge, patch);
    // Coalesce a typing burst into one field of one edge into a single step.
    const field = Object.keys(patch)[0] ?? "?";
    this.commit(`edge:${id}:${field}`);
  }

  deleteEdge(id: string): void {
    this.flow.edges = this.flow.edges.filter((e) => e.id !== id);
    this.commit();
  }

  /** Flow-level variables (lazily initialized to an empty list). */
  get vars(): VarDecl[] {
    return this.flow.vars ?? [];
  }

  /** Append a new flow variable with a placeholder name. */
  addVar(): void {
    if (!this.flow.vars) this.flow.vars = [];
    this.flow.vars.push({
      name: `var_${this.flow.vars.length + 1}`,
      value: "",
    });
    this.commit();
  }

  /** Patch a flow variable by index. */
  updateVar(index: number, patch: Partial<VarDecl>): void {
    const v = this.flow.vars?.[index];
    if (!v) return;
    Object.assign(v, patch);
    const field = Object.keys(patch)[0] ?? "?";
    this.commit(`var:${index}:${field}`);
  }

  /** Remove a flow variable by index. */
  removeVar(index: number): void {
    if (!this.flow.vars) return;
    this.flow.vars.splice(index, 1);
    this.commit();
  }

  /** Undo the last edit. Returns false when already at the baseline. */
  undo(): boolean {
    const snapshot = this.history.undo();
    if (snapshot === null) return false;
    this.restore(snapshot);
    return true;
  }

  /** Redo the last undone edit. Returns false when at the tip. */
  redo(): boolean {
    const snapshot = this.history.redo();
    if (snapshot === null) return false;
    this.restore(snapshot);
    return true;
  }

  /** Plain, serializable snapshot for persistence. */
  serialize(): FlowDefinition {
    return $state.snapshot(this.flow);
  }

  /**
   * Compile this flow to a runnable maestro flow and write it to
   * `<project>/.maestro/flows/<name>.yaml` (the harness loads it with
   * `/flow <name>`). Returns the compile errors without writing if the flow is
   * not yet runnable. Off-Tauri the compile still runs but there's nowhere to
   * write, so it reports that.
   */
  async compileToMaestro(): Promise<CompileOutcome> {
    const { yaml, errors } = compileFlow(this.serialize(), this.channels);
    if (errors.length) return { ok: false, errors };
    const dir = await tryInvoke<string>("project_dir");
    if (dir === null) {
      return {
        ok: false,
        errors: ["Not running under Tauri -- cannot write the compiled flow."],
      };
    }
    try {
      const path = await tryInvoke<string>("write_maestro_flow", {
        dir,
        name: this.name,
        yaml,
      });
      return { ok: true, errors: [], path: path ?? undefined };
    } catch (e) {
      return { ok: false, errors: [String(e)] };
    }
  }

  /**
   * True when the current flow differs from the last persisted copy. A fresh
   * editor (nothing saved yet) is dirty so the first save always runs.
   */
  isDirty(): boolean {
    return JSON.stringify(this.serialize()) !== this.lastSaved;
  }

  /**
   * Persist this flow to the backend flow library
   * (`<project_dir>/.flowstate/flows/<name>.json`). No-op outside Tauri or when
   * the flow is unchanged since the last successful save.
   */
  async save(): Promise<void> {
    // Skip redundant writes (and the "Saving…" flicker) when nothing changed.
    if (!this.isDirty()) return;
    this.saveState = "saving";
    try {
      const dir = await tryInvoke<string>("project_dir");
      if (dir === null) {
        // Not running under Tauri (dev/build): nothing to persist against.
        // Leave `lastSaved` untouched so we don't mark a never-written flow clean.
        this.saveState = "idle";
        return;
      }
      const flow = this.serialize();
      await tryInvoke<void>("write_flow", {
        dir,
        name: this.name,
        flow,
      });
      this.lastSaved = JSON.stringify(flow);
      this.saveState = "saved";
    } catch {
      this.saveState = "error";
    }
  }

  /**
   * Load a flow by name from the backend library, replacing the current flow.
   * Returns false (and leaves state untouched) outside Tauri or on error.
   */
  async load(name: string): Promise<boolean> {
    const dir = await tryInvoke<string>("project_dir");
    if (dir === null) return false;
    try {
      const loaded = await tryInvoke<FlowDefinition>("read_flow", {
        dir,
        name,
      });
      if (!loaded) return false;
      this.flow = loaded;
      this.selectedNodeId = null;
      // A fresh load is a new baseline: undo must not cross back into the
      // previously-edited flow.
      this.history.reset($state.snapshot(this.flow));
      this.canUndo = false;
      this.canRedo = false;
      // The loaded copy is exactly what's on disk: mark clean so autosave waits
      // for an actual edit before writing again.
      this.lastSaved = JSON.stringify(this.serialize());
      this.saveState = "saved";
      return true;
    } catch {
      return false;
    }
  }
}
