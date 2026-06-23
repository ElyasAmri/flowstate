# Flowstate domain model — channels, node taxonomy, agents

This document records the domain model the Flowstate flow editor authors against:
the **channel** concept, the **4-color node taxonomy**, and the **agent** node. It
is the conceptual companion to `app/src/lib/flow/types.ts`, which is the
machine-readable source of truth for the exact shapes.

## Why this model

A *flow* is the deterministic state machine a Policy Maker authors and the harness
later executes. The harness itself is deterministic and sealed: it never touches
the outside world directly. Everything outside it — a citizen's app, a government
registry, a bureaucrat's desktop, even another flow — is reached **only across a
channel**. That single rule is what makes a flow auditable and replayable: every
non-deterministic or external interaction is named, typed, and crosses a boundary
you can see on the canvas.

## Channel

A **channel** is a programmatic, typed interaction layer between the harness and a
program outside it.

- **First-class & registered.** Channels live in a registry (one JSON file per
  channel, just like flows). A flow references a channel **by id** — there are no
  inline channel definitions. This enables reuse, shared services, and nesting.
- **Typed contract.** A channel declares the messages it `accepts` (sent *into*
  the channel) and `returns` (received *back*). The harness codes against the
  contract, not whatever implements the far side.
- **Direction.** One of:
  - `inbound` — the outside program triggers/feeds the harness (a consumer submits
    an application and starts the flow);
  - `outbound` — the harness requests from / returns to the far side (ask the
    consumer for more info, call eID, hand a case to a bureaucrat, emit a result);
  - `both`.
- **Binding** — what implements the far side. Exactly one of:
  - **UI app** (`ui`) — a human-operated program: consumer app, bureaucrat
    desktop, hotline-as-agent.
  - **Flow** (`flow`) — the far side *is another flow*, referenced by its flow id.
    This is how flows nest and compose (the hotline-as-flow case).
  - **Service** (`service`) — a core service, with an `internal | external`
    attribute.

## Node taxonomy & the 4-color scheme

Color encodes **what is across the boundary**, or that there is no boundary. There
are four node **kinds**: `channel`, `agent`, `action`, `decision`.

| Color | Node | Meaning |
| --- | --- | --- |
| 🟢 Green | `channel` (binding = ui) | crosses to a person via an app |
| 🟣 Purple | `channel` (binding = flow) | crosses to a nested flow (composition) |
| 🟡 Yellow | `channel` (binding = service) | crosses to a service (internal/external) |
| ⬜ Gray (light) | `action` / `decision` | internal harness node, deterministic |
| ⬛ Gray (dark) | `agent` | internal node where an AI agent does the work |

- A **channel** node references a channel from the registry by `channelId`; its
  color is **derived** from that channel's binding (green / purple / yellow). It is
  not stored on the node.
- **Agent** is its own kind (gray-dark): a node where an AI agent reasons,
  classifies, extracts, or drafts. It is **non-deterministic** — the one place
  inside the harness that is not pure logic.
- **Action** and **decision** are gray-static (light): deterministic logic.
  `decision` is the branch point (its out-edges carry guards). `action` is internal
  computation/bookkeeping.

There is **no separate `start`/`terminal` kind, and no manual-input trigger**. A
flow is *triggered* by submitting a typed payload to an **entry channel node** — a
channel node bound to an `inbound` (or `both`) channel that nothing in the flow
routes to (no incoming edge). These are the flow's "doors": a consumer submits a
query across one, exactly as a real consumer app would hit the flow. A flow may
have **several** doors, each independently submittable; there is no global Run
button. A flow *ends* at an `outbound` channel node that returns the result; an
ending channel node may carry an `outcome` (`approved | rejected | issued`). Entry
and exit are themselves boundary crossings, so they are channels like any other.

The payload a consumer submits to a door is the union of fields across the
channel's `returns` messages (the messages the outside world sends *into* the
harness). Each field seeds a flow variable of the same name, so downstream nodes
read it as `{{name}}`.

## Composition and the drill-in hook (future)

Because a channel can be bound to another flow, a flow can invoke a flow. The
purple nested-flow node is the seam. A future affordance — **not built yet** — is
double-clicking a nested-flow node to open that flow on screen (drill-in). The
model already carries everything needed for it: the binding stores the target
`flowId`.

## Glossary

- **Flow** — deterministic state machine of typed nodes + guarded edges.
- **Channel** — registered, typed boundary between the harness and the outside.
- **Binding** — what implements a channel's far side: `ui`, `flow`, or `service`.
- **Agent** — a non-deterministic node where an AI does the work.
- **Guard** — the condition on an edge under which the harness takes that branch.
- **Outcome** — how an ending (outbound) channel resolves the case.

## Worked example: Residence Certificate Request

The `residenceCertificateRunnable` fixture is authored entirely in this model:

- An **entry channel** node bound to `ch-intake` (ui, `both`, no incoming edge)
  is the flow's door — the consumer submits their national ID, name, and proof of
  address across it to trigger the flow. 🟢
- An **action** (`shell`) node validates the national ID deterministically (a
  service channel can't yield an exit code to branch on).
- An **agent** node classifies the address proof (emits a VERDICT). ⬛
- A **decision** node branches on that verdict. ⬜
- **`ch-bureaucrat`** (ui, outbound) — a human reviews ambiguous cases. 🟢
- **`ch-notify`** (service, internal, outbound) — issue the certificate / notify. 🟡
- Two **outbound** channel nodes bound to `ch-intake` return the result to the
  consumer, carrying `outcome = issued` or `outcome = rejected`. 🟢
