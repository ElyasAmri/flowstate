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
  plugins: [Highlight, Notes],
});

// The `reveal.js` types use `export =`, so the instance type is not importable
// as a named type; derive it from the value instead.
type DeckApi = typeof deck;

void deck.initialize().then(() => {
  // Expose the deck for ad-hoc control from the devtools console.
  (window as unknown as { deck: DeckApi }).deck = deck;
  connectRemote(deck);
});

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
