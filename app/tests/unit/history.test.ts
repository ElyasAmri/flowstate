import { describe, it, expect } from "vitest";
import { FlowHistory, MAX_HISTORY } from "../../src/lib/flow/history";

// The history is generic; a plain shape is enough to exercise the cursor logic.
interface Doc {
  v: number;
  label?: string;
}

const doc = (v: number, label?: string): Doc => ({ v, label });

describe("FlowHistory", () => {
  it("starts at the baseline with nothing to undo or redo", () => {
    const h = new FlowHistory(doc(0));
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it("commit -> undo -> redo round-trips", () => {
    const h = new FlowHistory(doc(0));
    h.commit(doc(1));
    h.commit(doc(2));
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    expect(h.undo()).toEqual(doc(1));
    expect(h.canRedo).toBe(true);
    expect(h.undo()).toEqual(doc(0));
    expect(h.canUndo).toBe(false);

    expect(h.redo()).toEqual(doc(1));
    expect(h.redo()).toEqual(doc(2));
    expect(h.canRedo).toBe(false);
  });

  it("returns defensive clones (mutating a result can't corrupt history)", () => {
    const h = new FlowHistory(doc(0));
    h.commit(doc(1, "a"));
    const undone = h.undo()!;
    undone.v = 999;
    // Re-undo/redo must still see the original recorded values.
    expect(h.redo()).toEqual(doc(1, "a"));
  });

  it("coalesces same-key commits into a single undo step (drag)", () => {
    const h = new FlowHistory(doc(0));
    // Simulate one drag: many moves, same coalesce key.
    h.commit(doc(1), "drag:n1");
    h.commit(doc(2), "drag:n1");
    h.commit(doc(3), "drag:n1");
    // The whole drag collapses to one entry: one undo returns to the baseline.
    expect(h.undo()).toEqual(doc(0));
    expect(h.canUndo).toBe(false);
    // And redo restores the final dragged state.
    expect(h.redo()).toEqual(doc(3));
  });

  it("does not coalesce across different keys", () => {
    const h = new FlowHistory(doc(0));
    h.commit(doc(1), "drag:n1");
    h.commit(doc(2), "drag:n2"); // different node -> separate step
    expect(h.undo()).toEqual(doc(1));
    expect(h.undo()).toEqual(doc(0));
  });

  it("a commit without a key breaks a coalescing run", () => {
    const h = new FlowHistory(doc(0));
    h.commit(doc(1), "node:n1:label");
    h.commit(doc(2)); // un-keyed: distinct step
    h.commit(doc(3), "node:n1:label"); // same key as #1 but run was broken
    expect(h.undo()).toEqual(doc(2));
    expect(h.undo()).toEqual(doc(1));
    expect(h.undo()).toEqual(doc(0));
  });

  it("breakCoalescing() ends a run so the next same-key commit is its own step", () => {
    const h = new FlowHistory(doc(0));
    h.commit(doc(1), "drag:n1");
    h.breakCoalescing();
    h.commit(doc(2), "drag:n1"); // new run despite same key
    expect(h.undo()).toEqual(doc(1));
    expect(h.undo()).toEqual(doc(0));
  });

  it("a new edit after undo truncates the redo branch", () => {
    const h = new FlowHistory(doc(0));
    h.commit(doc(1));
    h.commit(doc(2));
    h.undo(); // back to v1, redo branch holds v2
    expect(h.canRedo).toBe(true);

    h.commit(doc(9)); // new edit -> v2 redo branch is discarded
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toEqual(doc(1));
    expect(h.redo()).toEqual(doc(9));
  });

  it("undo after a coalesced run then redo restores the folded state", () => {
    const h = new FlowHistory(doc(0));
    h.commit(doc(1)); // step A
    h.commit(doc(2), "drag:n1");
    h.commit(doc(3), "drag:n1"); // step B (folded)
    expect(h.undo()).toEqual(doc(1)); // undo B
    expect(h.undo()).toEqual(doc(0)); // undo A
    expect(h.redo()).toEqual(doc(1));
    expect(h.redo()).toEqual(doc(3));
  });

  it("bounds the stack at MAX_HISTORY, dropping the oldest entries", () => {
    const h = new FlowHistory(doc(0));
    // Commit well past the cap with distinct (un-coalesced) edits.
    const total = MAX_HISTORY + 50;
    for (let i = 1; i <= total; i++) h.commit(doc(i));

    // We can only undo at most MAX_HISTORY-1 times (cap includes the current tip).
    let undos = 0;
    while (h.undo() !== null) undos++;
    expect(undos).toBe(MAX_HISTORY - 1);
  });

  it("reset() establishes a new baseline and clears history", () => {
    const h = new FlowHistory(doc(0));
    h.commit(doc(1));
    h.commit(doc(2));
    h.reset(doc(100));
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBeNull();
  });
});
