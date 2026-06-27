import { describe, it, expect } from "vitest";
import { FlowRun, type Executors } from "../../src/lib/flow/run/run.svelte";
import type { FlowDefinition } from "../../src/lib/flow/types";

// A minimal flow: an entry channel feeds a single extraction agent node (a leaf,
// so the run finishes right after it). The agent's reply is whatever the mock
// executor returns, which is what we vary per test.
function flow(): FlowDefinition {
  return {
    id: "extract",
    title: "Extract receipt",
    nodes: [
      { id: "n-in", kind: "channel", channelId: "c", label: "Intake", position: { x: 0, y: 0 } },
      {
        id: "n-agent",
        kind: "agent",
        agentRef: "extractor",
        label: "Extract fields",
        prompt: "read the receipt",
        position: { x: 200, y: 0 },
      },
    ],
    edges: [{ id: "e1", from: "n-in", to: "n-agent" }],
  };
}

/** Executors whose agent always replies with `reply`. */
function execs(reply: string): Executors {
  return {
    runShell: async () => ({ exit: 0, text: "" }),
    runAgent: async () => reply,
  };
}

/** Decode the runtime's `fields_b64` the same UTF-8-safe way it was encoded. */
function decodeFieldsB64(b64: string): unknown {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function run(reply: string): Promise<FlowRun> {
  const r = new FlowRun(flow(), execs(reply));
  r.stepDelay = 0;
  await r.start("n-in");
  return r;
}

describe("agent-node JSON field ingestion", () => {
  it("lifts scalar fields and round-trips Arabic content through fields_b64", async () => {
    const fields = {
      merchant: "صيدلية الرعاية",
      date: "2026-06-20",
      receipt_no: "R1",
      items: [{ name: "دواء", price: 50, qty: 1, category: "pharmacy" }],
      total: 300,
      currency: "QAR",
      confidence: 0.95,
      unrecognized: false,
    };
    const reply = `Here are the extracted fields:\n\`\`\`json\n${JSON.stringify(
      fields,
    )}\n\`\`\`\nDone.`;
    const r = await run(reply);

    expect(r.status).toBe("done");
    // Top-level scalars become flow vars (Arabic preserved); arrays are skipped.
    expect(r.vars.merchant).toBe("صيدلية الرعاية");
    expect(r.vars.date).toBe("2026-06-20");
    expect(r.vars.receipt_no).toBe("R1");
    expect(r.vars.total).toBe(300);
    expect(r.vars.currency).toBe("QAR");
    expect(r.vars.confidence).toBe(0.95);
    expect(r.vars.unrecognized).toBe(false);
    expect(r.vars.items).toBeUndefined();

    // fields_b64 holds the whole object and round-trips through UTF-8 base64.
    expect(typeof r.vars.fields_b64).toBe("string");
    const decoded = decodeFieldsB64(r.vars.fields_b64 as string) as Record<
      string,
      unknown
    >;
    expect(decoded.merchant).toBe("صيدلية الرعاية");
    expect(decoded.total).toBe(300);
    expect((decoded.items as unknown[]).length).toBe(1);
  });

  it("uses the first balanced {...} object when there is no json fence", async () => {
    const reply = 'The receipt: {"merchant":"Al Meera","total":120,"currency":"QAR"} (end)';
    const r = await run(reply);
    expect(r.status).toBe("done");
    expect(r.vars.merchant).toBe("Al Meera");
    expect(r.vars.total).toBe(120);
    expect(typeof r.vars.fields_b64).toBe("string");
  });

  it("is a no-op on an invalid JSON block (never throws, sets nothing extra)", async () => {
    const reply = "```json\n{ this is not: valid json , }\n```";
    const r = await run(reply);
    expect(r.status).toBe("done");
    expect(r.vars.fields_b64).toBeUndefined();
    expect(r.vars.merchant).toBeUndefined();
  });

  it("leaves a plain text reply unchanged (backward compatible)", async () => {
    const reply = "reasoning here\nVERDICT: approved";
    const r = await run(reply);
    expect(r.status).toBe("done");
    // The existing {text,verdict} behaviour is intact (verdict still parsed)...
    expect(
      r.trace.some((t) => t.detail.includes("VERDICT: approved")),
    ).toBe(true);
    // ...and no structured fields were invented.
    expect(r.vars.fields_b64).toBeUndefined();
    expect(r.vars.merchant).toBeUndefined();
  });
});
