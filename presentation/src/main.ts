import Reveal from "reveal.js";
import Highlight from "reveal.js/plugin/highlight";
import Notes from "reveal.js/plugin/notes";

// reveal.js core styles + theme.
import "reveal.js/reveal.css";
import "reveal.js/theme/black.css";
// Code-highlight theme for <pre><code> blocks.
import "reveal.js/plugin/highlight/monokai.css";

// Local overrides.
import "./style.css";

const deck = new Reveal({
  hash: true,
  slideNumber: "c/t",
  width: 1280,
  height: 720,
  margin: 0.06,
  controls: true,
  progress: true,
  transition: "fade",
  transitionSpeed: "fast",
  backgroundTransition: "fade",
  plugins: [Highlight, Notes],
});

// The `reveal.js` types use `export =`, so the instance type is not importable
// as a named type; derive it from the value instead.
type DeckApi = typeof deck;

void deck.initialize().then(() => {
  // Expose the deck for ad-hoc control from the devtools console.
  (window as unknown as { deck: DeckApi }).deck = deck;
  connectRemote(deck);
  syncCitizenView();
});

// Advance the citizen phone view on the demo slide in step with the video. Each
// `.cstep` carries `data-t` -- the video time (seconds, normal speed) the state
// begins -- and `data-dots`, how many stepper nodes are then filled. Sync is by
// absolute media time so the loop re-syncs each wrap. Edit timings in the markup.
function syncCitizenView(): void {
  const phone = document.querySelector("[data-citizen]");
  const video = document.querySelector<HTMLVideoElement>(".demo-split video");
  if (!phone || !video) return;
  const steps = Array.from(phone.querySelectorAll<HTMLElement>(".cstep"));
  const dots = Array.from(phone.querySelectorAll<HTMLElement>(".stepper li"));
  const cues = steps
    .map((el, i) => ({ i, t: Number(el.dataset.t ?? 0), dots: Number(el.dataset.dots ?? 0) }))
    .sort((a, b) => a.t - b.t);

  const apply = (active: number, filled: number): void => {
    steps.forEach((s, k) => s.classList.toggle("active", k === active));
    dots.forEach((d, k) => {
      d.classList.toggle("done", k < filled);
      d.classList.toggle("cur", k === filled - 1);
    });
  };

  // The phone only appears once the second (citizen-facing) flow starts running
  // in the video. Set data-show-at on [data-citizen] to that timestamp (seconds).
  const showAt = Number((phone as HTMLElement).dataset.showAt ?? 0);

  let last = -1;
  const tick = (): void => {
    const t = video.currentTime;
    phone.classList.toggle("live", t >= showAt);
    let cur = cues[0];
    for (const c of cues) if (t >= c.t) cur = c;
    if (cur.i !== last) {
      last = cur.i;
      apply(cur.i, cur.dots);
    }
  };
  apply(cues[0].i, cues[0].dots);
  phone.classList.toggle("live", video.currentTime >= showAt);
  video.addEventListener("timeupdate", tick);
}

// ---------------------------------------------------------------------------
// Remote control: connect to the relay mounted on the dev server at `/remote`
// (see vite.config.ts). The crc phone app sends `{cmd}` messages we act on;
// we echo deck position back so the remote can show where we are. Reconnects
// on its own, so starting the deck before/after the phone is fine.
// ---------------------------------------------------------------------------
type RemoteCommand = {
  cmd: string;
  h?: number;
  v?: number;
};

function connectRemote(deck: DeckApi): void {
  const url = `ws://${location.host}/remote`;
  let ws: WebSocket | null = null;

  const sendPosition = (): void => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    const { h, v } = deck.getIndices();
    ws.send(
      JSON.stringify({
        type: "pos",
        h,
        v,
        total: deck.getTotalSlides(),
        overview: deck.isOverview(),
      }),
    );
  };

  const handle = (msg: RemoteCommand): void => {
    switch (msg.cmd) {
      case "next":
        deck.next();
        break;
      case "prev":
        deck.prev();
        break;
      case "left":
        deck.left();
        break;
      case "right":
        deck.right();
        break;
      case "up":
        deck.up();
        break;
      case "down":
        deck.down();
        break;
      case "overview":
        deck.toggleOverview();
        break;
      case "first":
        deck.slide(0, 0);
        break;
      case "goto":
        deck.slide(msg.h ?? 0, msg.v ?? 0);
        break;
    }
  };

  const open = (): void => {
    ws = new WebSocket(url);
    ws.onopen = () => sendPosition();
    ws.onmessage = (e) => {
      try {
        handle(JSON.parse(e.data as string) as RemoteCommand);
      } catch {
        // Ignore malformed frames; the relay forwards bytes verbatim.
      }
    };
    // Reconnect after a short delay so a relay restart or a late start of the
    // dev server recovers without reloading the deck.
    ws.onclose = () => window.setTimeout(open, 1500);
    ws.onerror = () => ws?.close();
  };

  // Push our position whenever the deck moves, so the phone stays in sync.
  deck.on("slidechanged", sendPosition);
  deck.on("overviewshown", sendPosition);
  deck.on("overviewhidden", sendPosition);

  open();
}
