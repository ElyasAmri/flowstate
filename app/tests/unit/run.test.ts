import { describe, it, expect } from "vitest";
import { FlowRun, type Executors } from "../../src/lib/flow/run/run.svelte";
import { residenceCertificateRunnable } from "../../src/lib/flow/fixtures";

/** Mock executors. The ID-validation shell exits per `idExit`; the assess agent
 *  returns the configured verdict; the issue shell returns a cert URL. */
function execs(opts: { idExit?: number; verdict?: string }): Executors {
  return {
    runShell: async (cmd: string) =>
      cmd.includes("cert://residence")
        ? { exit: 0, text: "cert://residence/19880421" }
        : { exit: opts.idExit ?? 0, text: "MATCH" },
    runAgent: async (prompt: string) =>
      prompt.includes("VERDICT")
        ? `reasoning\nVERDICT: ${opts.verdict ?? "sufficient"}`
        : "رسالة",
  };
}

describe("FlowRun over the residence runnable flow", () => {
  it("auto-issues a clean case (sufficient -> no human gate)", async () => {
    const run = new FlowRun(
      residenceCertificateRunnable,
      execs({ idExit: 0, verdict: "sufficient" }),
    );
    await run.start("n-input");
    expect(run.status).toBe("done");
    expect(run.vars.outcome).toBe("issued");
    expect(run.vars.certificate_url).toBe("cert://residence/issued");
    // It never paused for a human.
    expect(run.trace.some((t) => t.detail.includes("awaiting"))).toBe(false);
  });

  it("escalates an ambiguous case to the human gate, then issues on approve", async () => {
    const run = new FlowRun(
      residenceCertificateRunnable,
      execs({ idExit: 0, verdict: "ambiguous" }),
    );
    await run.start("n-input");
    // Paused at the bureaucrat gate.
    expect(run.status).toBe("awaiting");
    expect(run.pending?.nodeId).toBe("n-escalate");
    // Operator approves -> the flow resumes and issues.
    await run.resolve("approve");
    expect(run.status).toBe("done");
    expect(run.vars.outcome).toBe("issued");
  });

  it("rejects an ambiguous case when the operator denies it", async () => {
    const run = new FlowRun(
      residenceCertificateRunnable,
      execs({ idExit: 0, verdict: "ambiguous" }),
    );
    await run.start("n-input");
    expect(run.status).toBe("awaiting");
    await run.resolve("reject");
    expect(run.status).toBe("done");
    expect(run.vars.outcome).toBe("rejected");
  });

  it("rejects an invalid national ID without ever reaching the agent", async () => {
    const run = new FlowRun(residenceCertificateRunnable, execs({ idExit: 1 }));
    await run.start("n-input");
    expect(run.status).toBe("done");
    expect(run.vars.outcome).toBe("rejected");
    // The address agent never ran.
    expect(run.trace.some((t) => t.nodeId === "n-score-address")).toBe(false);
  });
});
