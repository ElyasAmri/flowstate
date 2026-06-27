# Live demo rig: deck + app + OBS + phone (crc)

How the pieces connect during the presentation:

```
  phone (crc app)                          laptop
  ┌───────────────┐   ws .../remote   ┌──────────────────────────┐
  │ ‹  ›  First    │ ────────────────▶ │ deck (reveal, vite :5173) │ ──┐
  │ Overview       │                   │   relay mounted at /remote │   │  OBS
  │                │   ws ...:4455      │ app  (Flowstate, vite :1420)│  ├─▶ scenes:
  │ [Deck] [Demo]  │ ────────────────▶ │ OBS WebSocket (4455)       │ ──┘   Deck / Demo
  └───────────────┘                    └──────────────────────────┘  ──▶ projector
```

The phone drives **two** legs: slide navigation (through the deck's relay) and the
OBS scene cut between the slides and the live app. Both go over the LAN, so the
phone and the laptop must be on the **same Wi-Fi**.

## This machine (already set up)

- LAN IP: **192.168.0.192** (re-check at demo time: `ipconfig getifaddr en0`).
- OBS WebSocket: **enabled**, port **4455**, auth **on**, password **`conn3cting`**
  (Tools -> WebSocket Server Settings to view/change; config at
  `~/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json`).
- The phone (crc) is already pointed here: relay `ws://192.168.0.192:5173/remote`,
  OBS `ws://192.168.0.192:4455`, password `conn3cting`.

## 1. Start the deck and the app

```sh
# terminal 1 -- the slide deck + remote relay
cd presentation && npm run dev        # http://localhost:5173

# terminal 2 -- the live Flowstate app
npm run dev                           # http://localhost:1420
```

## 2. OBS scenes (one-time)

Create two scenes named **exactly** `Deck` and `Demo` (the crc app cuts by these
names). Browser sources are easiest -- portable, no screen-recording permission:

| Scene | Source (Browser) | URL | Size |
| --- | --- | --- | --- |
| `Deck` | Browser | `http://localhost:5173` | 1920 x 1080 |
| `Demo` | Browser | `http://localhost:1420` | 1920 x 1080 |

- The `Deck` browser source connects to the relay on its own, so the phone's
  `‹ › First Overview` advance the projected deck too.
- For an interactive app demo, prefer a **macOS Window Capture** of the Flowstate
  window for the `Demo` scene (grant Screen Recording permission once) so your
  cursor/clicks show; the browser-source URL above is the no-permission fallback.
- Project to the external screen: right-click the program preview ->
  **Fullscreen Projector (Program)** -> pick the projector display.

> Note: slide 4 of the deck already autoplays the recorded demo video, so the
> live `Demo` scene is optional -- use it only if you want to drive the real app.

## 3. The phone (crc)

Install the APK (built from `crc/` on the Windows machine -- this Mac has no
Android SDK). In the app's **Settings**, set:

- **Deck relay**: `ws://192.168.0.192:5173/remote`
- **OBS WebSocket**: `ws://192.168.0.192:4455`
- **OBS password**: `conn3cting`

These are already saved on the connected phone (SM-S938B). If the laptop's IP
changes, update both URLs (find it with `ipconfig getifaddr en0`). Two green
status dots = both legs connected.

## 4. Run of show

1. Both dev servers up; OBS open with `Deck` projected fullscreen.
2. Phone shows two green dots and the deck position (e.g. `1.1 / 7`).
3. Narrate with `‹ ›`; the projected deck follows.
4. On the Flowstate slide, the recorded demo plays. To go interactive, tap
   **Demo** to cut OBS to the live app, drive it, then tap **Deck** to cut back.
5. Finish on the closing slide.

## Verified / known

- Deck <-> phone relay fan-out: **verified** (a `{"cmd":"next"}` from one client
  reaches the deck client). The deck acts on `next/prev/first/overview/goto`.
- OBS leg: WebSocket enabled here; the crc `ObsClient` does the obs-websocket v5
  SHA-256 challenge auth and tracks the active scene, so the active scene button
  highlights live.
- crc builds on Windows (`crc/local.properties` -> a Windows SDK path); to build
  on this Mac, install the Android SDK and point `sdk.dir` at it.
