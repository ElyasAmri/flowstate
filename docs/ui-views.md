# Desktop UI views

The desktop frontend (`app/`) is a Svelte 5 + Tailwind 4 Tauri app. Its main
content area uses manual, state-driven routing: a typed `Route` union held in
`$state` in `app/src/App.svelte`, flipped by the native menubar.

## View components

Each route renders a dedicated view component under `app/src/lib/views/`.
`App.svelte` imports them and switches on `route.name`:

| Route name  | Component            | File                                  |
| ----------- | -------------------- | ------------------------------------- |
| `home`      | `Home.svelte`        | `app/src/lib/views/Home.svelte`       |
| `workflows` | `Workflows.svelte`   | `app/src/lib/views/Workflows.svelte`  |
| `documents` | `Documents.svelte`   | `app/src/lib/views/Documents.svelte`  |

Previously the markup for all three routes lived inline in `App.svelte`. It has
been extracted into these separate components; `App.svelte` now only handles
routing and delegates rendering to the views.

### Home

`Home.svelte` shows the app title, a short description, and a **Check Rust
bridge** button. The button calls the `greet` Tauri command (defined in
`src-tauri/src/lib.rs`) via `invoke` and displays the returned greeting,
demonstrating the frontend ↔ Rust bridge. The `invoke` import and the `ping`
handler moved out of `App.svelte` and now live in this component.

### Workflows

`Workflows.svelte` is a placeholder: a "Workflows" header with an empty-state
message ("Nothing here yet.").

### Documents

`Documents.svelte` is a placeholder: a "Documents" header with an empty-state
message ("Nothing here yet.").

## Style

All views follow the existing Tailwind 4 / Svelte 5 conventions: a centered
`mx-auto max-w-2xl space-y-4` container with a `text-2xl font-semibold` header.
