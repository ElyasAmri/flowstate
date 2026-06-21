import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Tauri bridge so save()/load() exercise the editor's persistence
// contract without a real backend. Each test sets the mock's behavior.
const tryInvoke = vi.fn();
vi.mock("../../src/lib/flow/tauri", () => ({
  tryInvoke: (command: string, args?: Record<string, unknown>) =>
    tryInvoke(command, args),
}));

import { FlowEditor } from "../../src/lib/flow/editor.svelte";
import { blankFlow } from "../../src/lib/flow/fixtures";

/** A FlowEditor seeded with a fresh blank flow under the given id. */
function makeEditor(id = "demo") {
  return new FlowEditor(blankFlow(id));
}

/** Route tryInvoke as if running under Tauri with the given project dir. */
function underTauri(dir = "/proj") {
  tryInvoke.mockImplementation(async (command: string) => {
    if (command === "project_dir") return dir;
    if (command === "write_flow") return undefined;
    return undefined;
  });
}

describe("FlowEditor persistence", () => {
  beforeEach(() => {
    tryInvoke.mockReset();
  });

  it("save() writes the serialized flow to the backend", async () => {
    underTauri();
    const editor = makeEditor("my-flow");

    await editor.save();

    expect(tryInvoke).toHaveBeenCalledWith("project_dir", undefined);
    expect(tryInvoke).toHaveBeenCalledWith("write_flow", {
      dir: "/proj",
      name: "my-flow",
      flow: editor.serialize(),
    });
    expect(editor.saveState).toBe("saved");
  });

  it("save() is a no-op when the flow is unchanged since the last save", async () => {
    underTauri();
    const editor = makeEditor();

    await editor.save();
    const callsAfterFirst = tryInvoke.mock.calls.length;
    expect(editor.isDirty()).toBe(false);

    // No edit between saves: the second save must not touch the backend.
    await editor.save();
    expect(tryInvoke.mock.calls.length).toBe(callsAfterFirst);
  });

  it("an edit after a save makes the flow dirty and the next save writes again", async () => {
    underTauri();
    const editor = makeEditor();

    await editor.save();
    expect(editor.isDirty()).toBe(false);

    editor.updateNode("n-start", { label: "Changed" });
    expect(editor.isDirty()).toBe(true);

    await editor.save();
    const writes = tryInvoke.mock.calls.filter((c) => c[0] === "write_flow");
    expect(writes.length).toBe(2);
  });

  it("save() is a no-op (idle) outside Tauri and never marks the flow clean", async () => {
    tryInvoke.mockResolvedValue(null); // project_dir => null => off-Tauri
    const editor = makeEditor();

    await editor.save();

    expect(editor.saveState).toBe("idle");
    // Nothing was written, so the flow must stay dirty for a real save later.
    expect(editor.isDirty()).toBe(true);
    const writes = tryInvoke.mock.calls.filter((c) => c[0] === "write_flow");
    expect(writes.length).toBe(0);
  });

  it("save() sets saveState to 'error' when the write rejects", async () => {
    tryInvoke.mockImplementation(async (command: string) => {
      if (command === "project_dir") return "/proj";
      throw new Error("disk full");
    });
    const editor = makeEditor();

    await editor.save();

    expect(editor.saveState).toBe("error");
    // A failed write must not mark the flow clean.
    expect(editor.isDirty()).toBe(true);
  });

  it("load() replaces the flow, resets history, and marks it clean", async () => {
    const loaded = blankFlow("other");
    loaded.title = "Loaded flow";
    tryInvoke.mockImplementation(async (command: string) => {
      if (command === "project_dir") return "/proj";
      if (command === "read_flow") return loaded;
      return undefined;
    });
    const editor = makeEditor("start");
    editor.updateNode("n-start", { label: "Edited" }); // build some history

    const ok = await editor.load("other");

    expect(ok).toBe(true);
    expect(editor.flow.title).toBe("Loaded flow");
    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(false);
    expect(editor.saveState).toBe("saved");
    // Freshly loaded == on disk: not dirty, so autosave waits for a real edit.
    expect(editor.isDirty()).toBe(false);
  });
});
