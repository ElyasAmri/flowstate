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
  slideNumber: true,
  // Smooth, elegant motion: cross-fade between slides, a fading background, and
  // a slick auto-animate morph for the "Flowstate" title (slides 1 -> 3 -> 8).
  transition: "fade",
  transitionSpeed: "default",
  backgroundTransition: "fade",
  autoAnimateDuration: 0.7,
  autoAnimateEasing: "cubic-bezier(0.22, 1, 0.36, 1)",
  plugins: [Highlight, Notes],
});

// The `reveal.js` types use `export =`, so the instance type is not importable
// as a named type; derive it from the value instead.
type DeckApi = typeof deck;

void deck.initialize().then(() => {
  // Expose the deck for ad-hoc control from the devtools console.
  (window as unknown as { deck: DeckApi }).deck = deck;
  connectRemote(deck);
  playVideosAtDouble();
  syncCitizenView();
});

// Advance the citizen phone view on the demo slide in step with the video. Each
// `.cstep` carries `data-t` — the video time (seconds, at normal speed) the state
// begins — and `data-dots`, how many stepper nodes are then filled. Sync is by
// absolute media time (currentTime), so the 2x playbackRate is irrelevant, and it
// re-syncs every time the looping video wraps. Edit the timings in the markup.
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

  let last = -1;
  const tick = (): void => {
    const t = video.currentTime;
    let cur = cues[0];
    for (const c of cues) if (t >= c.t) cur = c;
    if (cur.i !== last) {
      last = cur.i;
      apply(cur.i, cur.dots);
    }
  };
  apply(cues[0].i, cues[0].dots);
  video.addEventListener("timeupdate", tick);
}

// Play deck videos at 2x so the ~1-min demo fits the ~30s slot. reveal restarts
// autoplay videos on slide entry, so re-assert the rate on every `play`.
function playVideosAtDouble(): void {
  const RATE = 2;
  document.querySelectorAll("video").forEach((v) => {
    v.playbackRate = RATE;
    v.addEventListener("play", () => (v.playbackRate = RATE));
    v.addEventListener("ratechange", () => {
      if (v.playbackRate !== RATE) v.playbackRate = RATE;
    });
  });
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
