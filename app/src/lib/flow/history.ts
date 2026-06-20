// Undo/redo history for the visual flow editor. Pure TypeScript (no Svelte, no
// runes) so it can be unit-tested directly.
//
// The model is a snapshot list with a cursor: every committed edit appends the
// full flow definition; undo/redo just move the cursor and hand back a
// defensive clone. Snapshots are cheap at flow-editor scale (tens of nodes),
// and whole-state snapshots make undo trivially correct across every mutation
// path (canvas drag, palette add, inspector edit, edge connect/delete, ...).
//
// Coalescing: a node drag fires many moveNode calls, and a typing burst into
// one inspector field fires one per keystroke -- each would otherwise be its
// own undo step. A commit may carry a `coalesceKey`; consecutive commits with
// the SAME key replace the top entry instead of appending, so the whole drag /
// typing burst collapses into a single undo step. Any commit without a key (or
// with a different key), and any undo/redo, breaks the run.

/** Oldest entries are dropped past this depth (baseline counts as one). */
export const MAX_HISTORY = 100;

const clone = <T>(v: T): T => structuredClone(v);

export class FlowHistory<T> {
  private states: T[];
  private idx = 0;
  private lastKey: string | null = null;

  constructor(baseline: T) {
    this.states = [clone(baseline)];
  }

  get canUndo(): boolean {
    return this.idx > 0;
  }

  get canRedo(): boolean {
    return this.idx < this.states.length - 1;
  }

  /** Record the state AFTER an edit. Drops any redo branch. */
  commit(state: T, coalesceKey?: string): void {
    const snap = clone(state);
    // Truncate any redo branch: a new edit invalidates undone states.
    this.states.length = this.idx + 1;
    if (coalesceKey !== undefined && coalesceKey === this.lastKey && this.idx > 0) {
      // Same-key burst: fold into the current entry (keep its predecessor).
      this.states[this.idx] = snap;
    } else {
      this.states.push(snap);
      this.idx += 1;
      if (this.states.length > MAX_HISTORY) {
        this.states.shift();
        this.idx -= 1;
      }
    }
    this.lastKey = coalesceKey ?? null;
  }

  /** End any coalescing run (e.g. a drag ended or the selection moved). */
  breakCoalescing(): void {
    this.lastKey = null;
  }

  /** Step back; returns the state to restore, or null at the baseline. */
  undo(): T | null {
    if (!this.canUndo) return null;
    this.idx -= 1;
    this.lastKey = null;
    return clone(this.states[this.idx]);
  }

  /** Step forward; returns the state to restore, or null at the tip. */
  redo(): T | null {
    if (!this.canRedo) return null;
    this.idx += 1;
    this.lastKey = null;
    return clone(this.states[this.idx]);
  }

  /** Discard all history and start over from `baseline` (e.g. after a load). */
  reset(baseline: T): void {
    this.states = [clone(baseline)];
    this.idx = 0;
    this.lastKey = null;
  }
}
