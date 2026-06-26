# Flowstate

> Codify bureaucratic procedures as deterministic workflows, with AI agents
> only where judgement is needed. Most procedures run automatically, while
> humans stay in the loop to handle genuine exceptions and resolve ambiguities.

Flowstate turns a government/institutional procedure into a **flow**, a
deterministic state machine, so routine applications flow through
automatically and only special cases pause for a bureaucrat. A policy maker
authors the flow visually; consumers submit applications across typed channels;
an AI agent (powered by **Fanar**) does the judgement-heavy steps and document
parsing (text, images, transcript summaries); and every
decision leaves an auditable, replayable trace.

- Theme: Smart Government & Citizen Services
- Model backend: Fanar (Arabic-capable LLM), usable online via Fanar API
  or self-hosted (any OpenAI-compatible server), swapped by config alone.
- Team: return 0; performed by Elyas Al-Amri and Osama Hasoneh

> Build, run, repository layout, and the demo walkthrough live in
> [demo.md](demo.md).

---

## 1. Problem Statement

Routine government applications are delayed, inconsistent, and expensive
because every case waits on a person, even though most cases are unambiguous
and only a few are true exceptions. Flowstate automates the routine
deterministically, escalates only the exceptions to a human, and keeps the
whole process accountable, replayable, and appealable. This matters
acutely in the Arabic and Gulf government context, where procedures, dialect,
and local rules demand a model like Fanar that can read and serve citizens in
their own language.

## 2. Solution Architecture

```mermaid
flowchart LR
    subgraph discovery[Discovery]
        direction TB
        PRE[Pre-existing dataset<br/>event logs / docs]
        ACC[Accumulated dataset]
        MIN[Mining]
        DRAFT[Draft flow]
        PRE -->|ingest| MIN
        ACC -->|ingest| MIN
        MIN -->|discover| DRAFT
    end

    subgraph users[Users]
        direction TB
        PM[Policy maker]
        BUR[Bureaucrat]
        CON[Consumer]
    end

    TOOL[Flow configuration tooling]

    subgraph system[System]
        direction TB
        subgraph runtime[Flow runtime]
            CFG[Flow configuration]
            HAR[Harness<br/>deterministic exec]
            subgraph il[Interaction layer]
                APP[App]
                HOT[Hotline]
            end
        end
        subgraph core[Core services - program level]
            AUD[(Audit / record store<br/>replayable, appealable)]
            IDS[(Case / identity store)]
        end
    end

    subgraph ext[External services - institution level]
        direction TB
        REG[Government registry]
        EID[eID provider]
        PAY[Payment gateway]
        NOT[Notification<br/>email / SMS]
        TIC[Ticketing system]
    end

    POL[Policy]
    DB[Database]
    FANAR[[Fanar]]

    DRAFT --> TOOL
    PM -->|interact / review| TOOL
    POL --> TOOL
    DB --> TOOL
    TOOL -->|write| CFG

    CON -->|interact| il
    BUR -->|intervene / signoff| il
    il -->|run| HAR
    HAR -.read.-> CFG
    HAR -->|log| AUD
    il -->|persist| IDS
    HAR -->|call| ext
    MIN -->|extract| ext

    FANAR -->|backend| HAR
    FANAR -->|backend| HOT
    FANAR -->|backend| MIN
```

- **Discovery**: dataset (pre-existing + accumulated) -> mining -> draft flow.
- **Users**: policy maker (authors), bureaucrat (intervenes / signs off),
  consumer (is served).
- **Flow runtime**: flow configuration, harness (deterministic execution),
  interaction layer (app / hotline).
- **Core Services (program level)**: audit / record store, case / identity
  store.
- **External Services (institution level)**: government registry, eID,
  payment, notification, ticketing; plus policy and database as knowledge
  sources the mining flow extracts from.
- **Fanar**: model backend for the harness (and the hotline channel).

## 3. Agentic Workflow Design

A flow is a graph of typed nodes joined by guarded edges. A typed payload
submitted to an entry channel (the door) triggers it; deterministic nodes do
the routine work, the agent node defers judgement to Fanar, and only genuine
exceptions pause at a human gate.

```mermaid
flowchart LR
    door([Entry channel<br/>door]):::ui --> val[Action<br/>validate inputs]
    val --> agent{{"Agent<br/>classify (Fanar)"}}
    agent --> dec{Decision<br/>branch on verdict}
    dec -->|clear| issue([Issue and notify]):::service
    dec -->|ambiguous| gate([Human gate<br/>bureaucrat]):::ui
    gate -->|approve| issue
    gate -->|reject| rej([Reject]):::ui

    classDef ui fill:#fde68a,stroke:#d97706,color:#000;
    classDef service fill:#bbf7d0,stroke:#16a34a,color:#000;
```

Node colors carry the channel binding: yellow `ui` (a human-operated app),
green `service` (a core/external service), purple `flow` (a nested flow).

Maps to the agentic requirement targets:

- **Multi-step planning / decomposition**: the flow itself; nodes and edges.
- **Tool usage & orchestration**: per-tool allow/ask/deny gating.
- **Memory & state management**: core service, case / identity store.
- **Retrieval & knowledge integration**: extraction from policy + database
  into the configuration.
- **Autonomous execution**: the harness runs the flow deterministically.
- **Multi-agent collaboration**: subagents per task (own model / prompt /
  tools).

## 4. Use of Fanar and External Tools

### Main

- **Powering the harness**: Fanar is the model backend for the flow-runtime
  agent nodes (and the mining / draft-flow procedure).
- **Document parsing**: reading and extracting from uploaded evidence (text,
  images, transcript summaries) into structured verdicts the flow branches on.

### Extra

- **Hotline as a separate flow**: an Arabic speech / dialect interaction
  layer, run as its own flow and integrated into the main flow as a channel (independent blocks).

## 5. Evaluation Results

We evaluated the full Flowstate loop on two real public-sector datasets. The
agent node was driven live by Claude as a stand-in for Fanar; because the model
is reached through one OpenAI-compatible config entry (section 4), swapping in
Fanar is a config change, not a code change. The harness, scoring scripts, and
model outputs are in `eval/` (run `python3 eval/parse_rtf.py && python3
eval/parse_ljp.py && python3 eval/score.py`); scoring is done by script against
a held-out key, never by the model.

**Datasets.**

- **Road-Traffic Fine Management** (BPI, an Italian municipality): 150,370 fine
  cases, 231 process variants. Ground-truth routine vs. non-routine is derived
  from process structure: a case is non-routine only if the offender appeals
  (prefecture or judge). This yields **97.0% routine, 3.0% exceptions**, the
  "few true exceptions" the system is built for.
- **Arabic-LJP** (Saudi commercial court): 538 judgements with Arabic case
  facts. The agent reads the facts (الوقائع) and predicts the ruling class:
  `accept`, `reject`, or `route` (declined jurisdiction). Facts never contain
  the ruling, so this is a genuine Arabic legal-judgement test.

**The loop, end to end.**

1. **Generate a flow from data.** From the variant statistics alone, the agent
   mined a ~21-node draft flow: a deterministic spine (create → send → notify →
   pay, with credit collection as a routine unpaid branch) that forks at the
   notification step into an appeal branch: agent assessment, then a human gate
   (prefecture bureaucrat), then judge escalation. See `eval/data/mined_flow.md`.
2. **Classify routine vs. non-routine.** On a balanced blind sample of 60 fine
   cases, the agent scored **100% (60/60)**: it caught every appeal and, on the
   trap, never mistook automated credit collection for an exception.
3. **Process the routine / flag the exceptions.** The 97% routine majority runs
   the deterministic spine with no model discretion; only the 3% appeal cases
   reach the agent and the human gate.
4. **Arabic judgement.** On 50 blind Arabic cases the agent reached **86%
   accuracy**, with jurisdiction-routing at **100% precision / 90% recall**:
   the cases that should leave the flow are reliably routed out.
5. **Improve the flow from accumulated exceptions.** Aggregating all 4,567
   appealed cases, the agent proposed five concrete, data-backed flow updates
   (e.g. a guard `amount > 100 OR points > 0` targeting the ~834 appeals where
   contests concentrate; article-specific triage for codes with 10–29% appeal
   rates vs. a ~2.3% baseline). See `eval/data/improvements.md`.

| Track | Task | Result |
| --- | --- | --- |
| Road-Traffic Fines | routine vs. non-routine (60 blind) | acc 100%, precision 100%, recall 100% |
| Arabic-LJP | accept / reject / route (50 blind) | acc 86%; route precision 100%, recall 90% |
| Flow mining | variants → draft flow | ~21 nodes, human gate on the appeal branch |
| Improvement loop | 4,567 exceptions → updates | 5 guards/nodes, each tied to a measured pattern |

**Where the model did well.** Conformance classification was perfect, including
the credit-collection trap that a keyword matcher would fail. Jurisdiction
detection on Arabic legal text was near-perfect, exactly the "route this
elsewhere" call the flow depends on. Flow mining and the improvement proposals
were specific and grounded in computed aggregates, not generic advice.

**Limitations.** On Arabic-LJP the 7 errors were almost all `reject → accept`:
the model over-grants borderline claims (predicting the court obliges the
defendant when it in fact rejected on procedural grounds such as missing
mediation or standing). This is the judgement-heavy tail where a human gate is
warranted. Ground-truth labels for the legal track are derived by ruling-text
keywords, so a small label-noise margin applies. The fine-management routine/
exception boundary is process-structural and unambiguous; a real deployment
would also need to confirm Fanar matches Claude on the Arabic facts (the swap is
config-only, but the numbers above are Claude's).

## 6. Recommendations for Future Fanar Improvements

Distilled from section 5, focused on what would make Fanar a stronger backend
for deterministic, auditable government flows:

- **Calibrated abstention.** The agent's costliest errors were confident
  `reject → accept` flips on procedural dismissals. A reliable, calibrated
  confidence (or an explicit "unsure") would let the flow escalate exactly the
  borderline cases to the human gate instead of deciding them, which is the
  whole point of the design.
- **Structured verdict output.** Flowstate parses a `VERDICT: <word>` line.
  First-class support for constrained/structured output (a fixed label set,
  optionally with a confidence field) would remove the parsing seam and make the
  one non-deterministic node more predictable.
- **Saudi/Gulf legal and administrative grounding.** The reject→accept errors
  track Saudi-specific procedure (mediation prerequisites, standing/صفة,
  jurisdiction). Stronger grounding in local procedural rules would lift exactly
  the cases that currently need a human.
- **Long-document robustness.** Facts were clipped to ~1,800 characters to fit;
  real dossiers (uploaded proofs, transcripts) are longer. Stable judgement over
  long Arabic documents would widen the set of procedures Flowstate can automate.
- **Determinism aids.** `temperature: 0` is necessary but not sufficient.
  Run-to-run stability guarantees on identical prompts would strengthen the
  replayable/appealable property the harness promises.
</content>
