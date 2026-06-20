import { defineConfig, type PreviewServer, type ViteDevServer } from "vite";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

// Remote-control relay: a dumb WebSocket hub mounted on Vite's own HTTP server
// at `/remote`, so the slide deck and any number of remotes (the crc phone app)
// share one process and one port -- no second server to start for a demo. A
// message from any client is fanned out to every other client: the phone sends
// `{cmd:"next"}` and the deck acts on it; the deck sends `{type:"pos",...}` and
// the phone shows it.
//
// HMR is left untouched: Vite's own upgrade handler claims sockets by the
// `vite-hmr` subprotocol, while this one claims only the `/remote` path, so the
// two coexist on the same port.
function attachRelay(httpServer: Server | null): void {
  if (!httpServer) return;
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/remote") return; // not ours -- leave it for HMR
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      const msg = data.toString();
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    });
  });
}

function remoteRelay() {
  return {
    name: "remote-relay",
    configureServer(server: ViteDevServer) {
      attachRelay(server.httpServer);
    },
    // Also mount under `vite preview`, so a built deck (`npm run build` then
    // `npm run preview`) keeps the remote working.
    configurePreviewServer(server: PreviewServer) {
      attachRelay(server.httpServer);
    },
  };
}

export default defineConfig({
  plugins: [remoteRelay()],
  // Bind all interfaces so the phone can reach the dev server over the LAN.
  server: { host: true },
  preview: { host: true },
});
