import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Tauri bridge so save()/load() exercise the editor's persistence
// contract without a real backend. Each test sets the mock's behavior.
const tryInvoke = vi.fn();
vi.mock("../../src/lib/flow/tauri", () => ({
  tryInvoke: (command: string, args?: Record<string, unknown>) =>
    tryInvoke(command, args),
}));

import { FlowEditor, slugifyFlowName } from "../../src/lib/flow/editor.svelte";
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

describe("slugifyFlowName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyFlowName("Residence Certificate Request")).toBe(
      "residence-certificate-request",
    );
  });

  it("collapses runs of non-alphanumerics and trims edges", () => {
    expect(slugifyFlowName("  Hello --- World!!  ")).toBe("hello-world");
  });

  it("returns empty when nothing usable remains", () => {
    expect(slugifyFlowName("///")).toBe("");
  });
});

describe("FlowEditor.rename", () => {
  beforeEach(() => {
    tryInvoke.mockReset();
  });

  it("writes under the new name and removes the old json + maestro files", async () => {
    tryInvoke.mockImplementation(async (command: string) => {
      if (command === "project_dir") return "/proj";
      if (command === "read_flow") throw new Error("no such flow"); // new name is free
      return undefined; // write_flow, write_maestro_flow, delete_*, project_dir
    });
    const editor = makeEditor("old-name");

    const r = await editor.rename("Brand New Title");

    expect(r).toEqual({ ok: true, name: "brand-new-title" });
    expect(editor.flow.id).toBe("brand-new-title");
    expect(editor.flow.title).toBe("Brand New Title");
    expect(editor.name).toBe("brand-new-title");

    const calls = tryInvoke.mock.calls;
    // Wrote the new file...
    expect(calls).toContainEqual([
      "write_flow",
      { dir: "/proj", name: "brand-new-title", flow: editor.serialize() },
    ]);
    // ...and deleted the old json + compiled yaml.
    expect(calls).toContainEqual([
      "delete_flow",
      { dir: "/proj", name: "old-name" },
    ]);
    expect(calls).toContainEqual([
      "delete_maestro_flow",
      { dir: "/proj", name: "old-name" },
    ]);
  });

  it("refuses to rename onto an existing flow", async () => {
    tryInvoke.mockImplementation(async (command: string) => {
      if (command === "project_dir") return "/proj";
      if (command === "read_flow") return blankFlow("taken"); // name is taken
      return undefined;
    });
    const editor = makeEditor("old-name");

    const r = await editor.rename("Taken");

    expect(r.ok).toBe(false);
    // The document must be left untouched on a refused rename.
    expect(editor.flow.id).toBe("old-name");
    const writes = tryInvoke.mock.calls.filter((c) => c[0] === "write_flow");
    expect(writes.length).toBe(0);
  });

  it("rejects an empty / unusable name without touching the backend", async () => {
    underTauri();
    const editor = makeEditor("old-name");

    const r = await editor.rename("   ");

    expect(r.ok).toBe(false);
    expect(editor.flow.id).toBe("old-name");
    expect(tryInvoke).not.toHaveBeenCalled();
  });

  it("keeps the same files when only the title (not the slug) changes", async () => {
    tryInvoke.mockImplementation(async (command: string) => {
      if (command === "project_dir") return "/proj";
      return undefined;
    });
    const editor = makeEditor("my-flow");

    const r = await editor.rename("My Flow"); // slugs back to "my-flow"

    expect(r).toEqual({ ok: true, name: "my-flow" });
    expect(editor.flow.title).toBe("My Flow");
    // Same file name => no delete of the "old" file, no read_flow collision check.
    const deletes = tryInvoke.mock.calls.filter((c) =>
      String(c[0]).startsWith("delete_"),
    );
    expect(deletes.length).toBe(0);
  });

  it("off-Tauri updates the in-memory title/id without disk writes", async () => {
    tryInvoke.mockResolvedValue(null); // project_dir => null
    const editor = makeEditor("old-name");

    const r = await editor.rename("New Title");

    expect(r).toEqual({ ok: true, name: "new-title" });
    expect(editor.flow.id).toBe("new-title");
    expect(editor.flow.title).toBe("New Title");
    const writes = tryInvoke.mock.calls.filter((c) => c[0] === "write_flow");
    expect(writes.length).toBe(0);
  });
});
