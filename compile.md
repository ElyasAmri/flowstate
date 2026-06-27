# Compiling a Flowstate release

Notes for producing the distributable desktop app (the judges can't build it
themselves, so we ship a prebuilt binary on the GitHub Releases page).

## What gets built

A Tauri 2 desktop app. `productName` **Flowstate**, version **0.1.0**,
identifier `com.flowstate.app`. The frontend is the Svelte/Vite app in `app/`;
the shell is the Rust crate in `app/src-tauri/`.

## Prerequisites

- **Node** (built with v26) and the workspace deps: `npm install` at the repo root.
- **Rust** via rustup (built with cargo 1.96).
- **Xcode Command Line Tools** (`xcode-select --install`) for the macOS linker.
- **The sibling `maestro` checkout.** `app/src-tauri/Cargo.toml` has a path
  dependency:
  `maestro-tauri-connect = { path = "../../../maestro/crates/maestro-tauri-connect" }`
  so `~/workspace/maestro` must exist next to `~/workspace/flowstate`. Without
  it the Rust build fails to resolve the crate.

## macOS (universal) — what we ship

A universal `.dmg` runs on both Apple Silicon and Intel Macs. From the repo root:

```bash
# one-time: add the Intel target (the host arm64 target is already present)
rustup target add x86_64-apple-darwin

# build (frontend is built automatically via beforeBuildCommand `npm run build`)
npm run tauri -w app -- build --target universal-apple-darwin
```

Artifacts land under:

```
app/src-tauri/target/universal-apple-darwin/release/bundle/
  dmg/Flowstate_0.1.0_universal.dmg     <- upload this
  macos/Flowstate.app
```

A single-arch build (faster, arm64 only) is just
`npm run tauri -w app -- build` and lands under
`app/src-tauri/target/release/bundle/`.

### Expected, harmless build output

- `Warn ... identifier "com.flowstate.app" ... ends with .app`. Cosmetic; it
  builds and runs. (To silence it later, rename the identifier to something
  like `com.flowstate.desktop`.)

### Unsigned build / Gatekeeper

We do not code-sign or notarize (no `bundle.macOS.signingIdentity` in
`tauri.conf.json`). macOS will refuse to open it on first launch. To run:
**right-click the app -> Open -> Open**, or
`xattr -dr com.apple.quarantine /Applications/Flowstate.app`. Worth saying this
in the release notes so judges aren't blocked.

## Other platforms

Tauri builds for the OS it runs on; you cannot cross-compile a Windows `.exe`
or Linux `.AppImage` from macOS. For those, run the same build on each OS, or
add a GitHub Actions matrix (`macos-latest`, `windows-latest`, `ubuntu-latest`)
that builds and uploads to the release. Not set up yet — Mac-only for now.

## Publishing the release

`gh` is authed to `ElyasAmri/flowstate`. Tag matches the app version.

```bash
gh release create v0.1.0 \
  "app/src-tauri/target/universal-apple-darwin/release/bundle/dmg/Flowstate_0.1.0_universal.dmg" \
  --title "Flowstate v0.1.0" \
  --notes "macOS universal build (Apple Silicon + Intel). Unsigned: right-click -> Open on first launch."
```

To revise: `gh release upload v0.1.0 <file> --clobber` (replace an asset) or
`gh release edit v0.1.0 --notes "..."`.
