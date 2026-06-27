// Emit the in-app "Government services loop" demo flow (authored in
// app/src/lib/flow/fixtures.ts) and the channels it references as on-disk JSON
// under examples/flows/, the same shape the app loads from <project>/.flowstate.
// Run via esbuild (see the npm/demo wiring); keeps the committed examples in
// sync with the fixture that the editor and the recorder use.
import {
  loopDemo,
  loopDemoSpine,
  loopDemoUpdate,
  exampleChannels,
} from "../app/src/lib/flow/fixtures.ts";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "examples/flows");
const CH = path.join(OUT, "channels");
fs.mkdirSync(CH, { recursive: true });

const write = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");

// In-app, loopDemo starts as just the two meta-flows and the spine/update are
// grown on the canvas as the meta-flows run. The committed example is the
// COMPLETE flow (meta-flows + drafted spine + the update step) so it stands on
// its own and compiles.
const complete = {
  ...loopDemo,
  nodes: [...loopDemo.nodes, ...loopDemoSpine.nodes, ...loopDemoUpdate.nodes],
  edges: [...loopDemo.edges, ...loopDemoSpine.edges, ...loopDemoUpdate.edges],
};
write(path.join(OUT, "loop-demo.json"), complete);

const used = new Set(complete.nodes.filter((n) => n.channelId).map((n) => n.channelId));
let n = 0;
for (const ch of exampleChannels) {
  if (!used.has(ch.id)) continue;
  write(path.join(CH, `${ch.id}.json`), ch);
  n++;
}
console.log(`wrote examples/flows/loop-demo.json + ${n} channels`);
