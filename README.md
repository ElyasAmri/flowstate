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

We evaluated the full Flowstate loop on two real public-sector datasets, run
**live against the real Fanar model** (`QCRI/Fanar-2-27B-Instruct`, self-hosted
on RunPod via vLLM), with Claude as a cross-check. The model swap was a one-line
config change (section 4), no code change. The harness, scoring scripts, and
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

**The three flows.** The loop is encoded as three real Flowstate flows under
[`examples/`](examples/) (authored to the `FlowDefinition` schema, with their
channels in `examples/flows/channels/`). All three pass the actual compiler
(`compileFlow` in `app/src/lib/flow/compile.ts`) with zero errors and emit valid
maestro YAML. Run the whole loop with `bash demo/run_demo.sh`, or rebuild the
flows alone with `python3 eval/build_flows.py`:

- **`flow-drafting`**: a meta-flow: event-log door → agent mines the model →
  agent drafts the flow → writes it to the flow library.
- **`fine-management-routine`**: the major flow: a deterministic spine
  (create → notify → pay, or unpaid → penalty → credit collection) that forks on
  `appeal_filed` into an agent assessment and a prefecture human gate, ending in
  paid / collected / appeal_upheld / appeal_rejected outcomes.
- **`flow-update`**: a meta-flow: exception-batch door → shell aggregation →
  agent proposes updates → `change_score >= 0.5` routes to a policy-maker human
  gate → writes the approved update back to the library.

**The loop, end to end.**

1. **Generate a flow from data.** From the variant statistics alone, the agent
   mined the routine flow: a deterministic spine (create → send → notify →
   pay, with credit collection as a routine unpaid branch) that forks at the
   notification step into an appeal branch: agent assessment, then a human gate
   (prefecture bureaucrat), then judge escalation. This is realised as the
   `fine-management-routine` flow above; see also `eval/data/mined_flow.md`.
2. **Classify routine vs. non-routine.** On a balanced blind sample of 60 fine
   cases, the agent scored **100% (60/60)**: it caught every appeal and, on the
   trap, never mistook automated credit collection for an exception.
3. **Process the routine / flag the exceptions.** The 97% routine majority runs
   the deterministic spine with no model discretion; only the 3% appeal cases
   reach the agent and the human gate.
4. **Arabic structured-verdict extraction.** The agent reads an Arabic Saudi
   commercial-court case and emits a deterministically-branchable verdict
   (`accept` / `reject` / `route`). On 50 blind cases, real Fanar scored
   **98%**, with Claude, DeepSeek, and GPT-5.5 at **100%** (corrected labels).
   Honest scope: the dataset's `input` already contains the court's reasoning
   (`الأسباب`), so this measures Arabic legal-text comprehension and clean
   structured output, **not** blind outcome prediction. See the details below.
5. **Improve the flow from accumulated exceptions.** Aggregating all 4,567
   appealed cases, the agent proposed five concrete, data-backed flow updates
   (e.g. a guard `amount > 100 OR points > 0` targeting the ~834 appeals where
   contests concentrate; article-specific triage for codes with 10–29% appeal
   rates vs. a ~2.3% baseline). See `eval/data/improvements.md`.

| Track | Fanar | Claude | DeepSeek | GPT-5.5 | gpt-4o |
| --- | --- | --- | --- | --- | --- |
| Conformance: routine vs. non-routine (60 blind) | 100% | 100% | 100% | 100% | 100% |
| Arabic structured-verdict (50 blind) | 98% | 100% | 100% | 100% | 52% |

Flow artifacts: 3 flows authored in `examples/`, all compile clean to valid
maestro YAML. Improvement loop: 4,567 exceptions aggregated into 5 data-backed
flow updates.

**Conformance** is the load-bearing result: deriving routine vs. exception from
process structure is solved across every model (100%), including the
credit-collection trap a keyword matcher fails. This is the "automate the
routine, escalate the exceptions" thesis, validated.

**Arabic structured-verdict** measures the agent node's Arabic capability:
turn a Saudi-court case into a typed `accept` / `reject` / `route` the flow
branches on, and reliably route out-of-scope cases (`عدم اختصاص`). Frontier
models do this at 100%, Fanar at 98% (its single miss is an unparsed verdict, a
format artifact, not a wrong call). Two honest caveats:

- **It is comprehension, not blind judgement.** The dataset's `input` contains
  the court's reasoning (`الأسباب`); 83% of inputs literally contain an outcome
  cue. So the task is "read the Arabic ruling's logic and extract the verdict,"
  which the agent node genuinely needs, but it is not evidence the model can
  *decide* an undecided case. A true judgement test would strip `الأسباب` and
  give only the raw facts.
- **The eval labels were the noisy part, not the models.** Ground-truth labels
  are keyword-scraped from the ruling text and we found and fixed several
  errors (e.g. a ruling tagged `reject` because the *judge's surname* `الزامل`
  contains the keyword `الزام`; grants tagged `reject` because of a trailing
  "rejected the remainder" clause). After the fixes, frontier models are at
  100%; the binding constraint was label quality. Model *tier* still matters:
  the older gpt-4o scored only 52% (never predicting `route`).

### Other live-Fanar findings

(full results in [`eval/data/fanar_findings.md`](eval/data/fanar_findings.md))

- **Fanar-2-27B is a reasoning model** (`<think>`). Forcing terse output
  truncates the verdict, and `/no_think` / `enable_thinking=false` / system
  prompts do **not** suppress it. The harness must budget tokens and parse after
  `</think>`. Full untruncated input also matters: clipping facts to 1,800 chars
  capped Fanar at 74%; full facts gave 98%.
- **Self-reported confidence is uninformative** (Fanar returns `high` on every
  case, including wrong ones), so a human gate cannot rely on it; it needs
  logprobs or ensemble disagreement.
- **Arabic generation and the meta-flows work well**: clean formal Arabic
  decision letters, accurate JSON extraction, and flow mining / improvement
  proposals comparable to Claude.

**Honest bottom line.** The conformance/automation thesis is validated and
model-agnostic. The Arabic agent-node capability (read Arabic, emit a clean
typed verdict, route out-of-scope) is solid. We did *not* demonstrate hard legal
judgement, and we won't claim it. Sample sizes (60 / 50) are small, so treat the
percentages as feasibility signals.

## 6. Recommendations for Future Fanar Improvements

Distilled from section 5, focused on what would make Fanar a stronger backend
for deterministic, auditable government flows:

- **Reasoning controllable from the API.** Fanar-2-27B always emits `<think>`,
  and `/no_think` / `enable_thinking=false` / system prompts do not turn it off.
  A reliable toggle (or a separate reasoning/answer field) would let the harness
  budget tokens correctly and avoid the one failure we saw: a truncated reply
  that never reached its verdict. This was Fanar's only miss on the Arabic track.
- **First-class structured output.** Flowstate parses a `VERDICT: <word>` line.
  Native constrained/structured output (a fixed label set, optionally with a
  confidence field) would remove the parsing seam and make the one
  non-deterministic node predictable.
- **Calibrated confidence for escalation.** Fanar self-reports `high` confidence
  on every case, including wrong ones, so the human gate cannot use it. Exposing
  token logprobs (or a calibrated score) would let the flow escalate exactly the
  uncertain cases, which is the whole point of the design.
- **Local grounding for genuine judgement.** Our Arabic track was comprehension,
  not blind judgement. For the harder task (decide from raw facts, no embedded
  reasoning), grounding in Saudi/Gulf procedure (mediation prerequisites,
  standing/صفة, jurisdiction) is what would let Fanar handle the ambiguous cases
  that otherwise must reach a human.
- **Run-to-run determinism.** `temperature: 0` is necessary but not sufficient;
  stability guarantees on identical prompts would strengthen the
  replayable/appealable property the harness promises.
</content>
