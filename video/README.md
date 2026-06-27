# Demo video

Autonomous screen recording of the real Flowstate app — no human at the
keyboard, no editing. Playwright drives the running app through the whole
"Government services loop" (init drafts the routine flow, the routine flow runs
through its human gate, the update flow adds a step), recording to webm and
transcoding to mp4.

## Record

```sh
# from the repo root, with the app dev server running:
npm run dev            # in one terminal (serves http://localhost:1420)
node video/record-app.mjs
```

Outputs (gitignored):
- `video/out/raw/flowstate-demo.webm` — Playwright capture
- `video/out/flowstate-demo.mp4` — H.264, web-friendly (faststart)

Deps are the repo-root devDependencies `playwright` and `ffmpeg-static`
(`npx playwright install chromium` once). Pacing, payloads, and the camera are
driven by the app itself (see `app/src/lib/flow/run/run.svelte.ts` stepDelay and
`FlowCanvas` live-run camera); edit `record-app.mjs` to change the script.
