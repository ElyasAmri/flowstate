# Flow editor: saving and loading

This page documents the save/load behavior of the flow editor.

> Scope note: this documentation is derived from the editor's unit test suite
> (the only part of the change visible in the diff used to write these docs).
> The tests exercise the editor's public API and pin down its observable
> behavior. The editor implementation itself was not visible in the diff, so
> internal details (and any background/debounced trigger) are intentionally not
> described here — see "What this page does not cover" below.

## Overview

The editor tracks whether the in-memory flow differs from the copy on disk and
exposes that as a "dirty" flag. Saving persists the flow to disk only when there
is something to save, and surfaces the outcome through a `saveState` value.

## Observable state

- `editor.isDirty()` — `true` when the flow has unsaved changes, `false` when the
  in-memory flow matches what was last written/loaded.
- `editor.saveState` — the result of the most recent save attempt:
  - `"idle"` — no save has taken place (e.g. running outside Tauri).
  - `"saved"` — the flow was written to disk (or freshly loaded from disk).
  - `"error"` — the most recent write failed.

## Saving — `editor.save()`

`save()` is asynchronous. When invoked under Tauri it:

1. Resolves the project directory via the `project_dir` command.
2. Writes the flow via the `write_flow` command with `{ dir, name, flow }`, where
   `flow` is `editor.serialize()`.
3. Sets `saveState` to `"saved"` and clears the dirty flag.

### No-op when unchanged

If the flow has not changed since the last successful save, `save()` is a no-op:
it does not call the backend again. After a save, `isDirty()` returns `false`,
and a second `save()` with no edits in between issues no further backend calls.

### Editing makes the flow dirty again

Any edit (for example `editor.updateNode(...)`) sets `isDirty()` back to `true`.
The next `save()` then writes to disk again, producing a fresh `write_flow` call.

### Outside Tauri

When not running under Tauri (`project_dir` resolves to `null`), `save()` is a
no-op that leaves `saveState` at `"idle"`. Nothing is written, and the flow stays
dirty so a real save can happen later once a backend is available.

### On failure

If the `write_flow` call rejects, `save()` sets `saveState` to `"error"` and the
flow remains dirty (a failed write never marks the flow clean), so the change can
be retried.

## Loading — `editor.load(name)`

`load(name)` reads a flow via the `read_flow` command and replaces the current
flow. On success it:

- replaces the in-memory flow with the loaded one,
- resets undo/redo history (`canUndo` and `canRedo` become `false`),
- sets `saveState` to `"saved"`,
- leaves the flow not dirty (`isDirty()` is `false`), since a freshly loaded flow
  matches what is on disk.

`load(name)` resolves to `true` on success.

## Backend commands used

| Command       | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `project_dir` | Resolve the project directory; `null` means off-Tauri. |
| `write_flow`  | Persist the flow (`{ dir, name, flow }`).            |
| `read_flow`   | Read a flow by name when loading.                    |

## Testing notes

The editor's `.svelte.ts` modules use Svelte runes (`$state`). The Vitest config
loads the `@sveltejs/vite-plugin-svelte` plugin (with `compilerOptions.dev: false`)
and sets `resolve.conditions: ["browser"]` so these rune-based modules compile and
run in the Node test environment. Without this, importing the flow editor into a
unit test would fail to compile.

## What this page does not cover

The diff used to write this page contained the unit tests and the Vitest config
change only. It did **not** include:

- the editor implementation, or
- any timer/debounce that would trigger saving automatically.

The tests call `save()` directly, so this page documents the save/load and
dirty-tracking semantics they verify. If an automatic (timed/debounced) trigger
exists, document it from its own diff once that source is available.
