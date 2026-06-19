# Flowstate

> Codify bureaucratic procedures as deterministic, agent-driven workflows.
> Most applications can be processed automatically; only the genuine
> exceptions are escalated to a human.

<!-- One-paragraph elevator pitch. TODO: tighten once the demo procedure is chosen. -->

Flowstate turns a government/institutional procedure into a **flow** -- a
deterministic state machine the agent harness executes -- so routine
applications flow through automatically and only special cases pause for a
bureaucrat. A policy maker authors (or mines) the flow; consumers interact via
app or hotline; the system keeps an auditable, appealable record of every
decision.

- **Theme:** Smart Government & Citizen Services
- **Model backend:** Fanar (Arabic-capable LLM powering the harness)
- **Team:** Osama, Elyas

---

## 1. Problem Statement

<!-- 25% of scoring: importance, societal/organizational impact, value prop. -->

- The cost of humans-in-the-loop: routine applications are delayed,
  inconsistent, and expensive when every case waits on a person.
- Observation: most cases are automatable; few are true exceptions.
- Value proposition: automate the routine deterministically, escalate only
  the exceptions, and keep the whole thing accountable (replayable, appealable).
- Why Arabic / Gulf government context matters here (Fanar, dialect, local
  procedures). TODO: cite the concrete procedure we target.

## 2. Solution Architecture

<!-- See docs/Diagram.canvas for the visual model. -->

- **Discovery** -- dataset (pre-existing + accumulated) -> mining -> draft flow.
- **Users** -- policy maker (authors), bureaucrat (intervenes / signs off),
  consumer (is served).
- **Flow runtime** -- flow configuration, harness (deterministic execution),
  interaction layer (app / hotline).
- **Core Services (program level)** -- audit / record store, case / identity
  store.
- **External Services (institution level)** -- government registry, eID,
  payment, notification, ticketing; plus policy and database as knowledge
  sources the mining flow extracts from.
- **Fanar** -- model backend for the harness (and the hotline channel).

TODO: architecture diagram export + component responsibilities table.

## 3. Agentic Workflow Design

<!-- 30% of scoring: agentic workflows, planning, orchestration, tool usage. -->

Maps to the agentic requirement targets:

- **Multi-step planning / decomposition** -- the flow itself; nodes and edges.
- **Tool usage & orchestration** -- per-tool allow/ask/deny gating.
- **Memory & state management** -- core service: case / identity store.
- **Retrieval & knowledge integration** -- extraction from policy + database
  into the configuration.
- **Autonomous execution** -- the harness runs the flow deterministically.
- **Multi-agent collaboration** -- subagents per task (own model / prompt /
  tools).

TODO: describe a concrete flow end-to-end (the demo procedure) with node kinds,
guards, and the escalation points.

## 4. Use of Fanar and External Tools

<!-- 20% of scoring: meaningful integration, strengths, limitations. -->

- **Fanar as harness backend** -- runs the flow-runtime agents and the
  mining/draft-flow procedure.
- **Fanar for the hotline** -- Arabic speech / dialect interaction layer.
- **Arabic capability demonstration** -- (capability showcase, not a training
  method). TODO: which dialect(s), which surfaces.
- **External tools** -- aiXamine (security safeguards), eID / registry /
  payment integrations. TODO: confirm which are stubbed vs live for the demo.

## 5. Evaluation Results

<!-- 15% of scoring: assessment, experiments, lessons learned. -->

> Keep a running log here as we build -- do not reconstruct at the end.

- Fanar vs. alternative model on the key Arabic tasks (comparison TODO).
- Where Fanar handled the task well.
- Where we needed external tools or a different model.
- Limitations encountered during development.

## 6. Recommendations for Future Fanar Improvements

<!-- Required by the deliverable README spec. -->

- TODO: actionable recommendations distilled from section 5.

---

## Repository Layout

```
app/            Tauri 2 desktop client (Vite + Svelte 5 + Tailwind 4)
docs/           Design canvas (Obsidian) and specs
datasets/       Process-mining + Arabic corpora (gitignored; see catalog.csv)
.maestro/       Harness config, flows, agents (gitignored, machine-local)
```

## Build & Run

<!-- TODO: fill in once the harness integration lands. -->

```
cd app
npm install
npm run tauri dev
```

## Deliverables

- [ ] Working prototype / proof-of-concept
- [ ] Short presentation + demonstration
- [ ] GitHub repo (this)
- [ ] This technical README (problem, architecture, agentic design, Fanar +
      tools, evaluation, recommendations)
- [ ] Video (remotion.dev)
- [ ] Live demo (last priority)

## Demo Procedure

<!-- The single bureaucratic procedure the demo automates end-to-end.
     Pick from datasets/ triage. TODO. -->

TBD.
