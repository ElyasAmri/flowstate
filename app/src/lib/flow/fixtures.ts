// Worked examples so the editor opens on something concrete, authored entirely
// in the channel model (see docs/channel-model.md).
//
// "Residence Certificate" request: the consumer submits their ID and proof of
// address across an inbound UI channel; the harness validates the ID against an
// external registry service, an AI agent scores the address proof, a
// deterministic decision branches on that score, ambiguous cases cross to a
// reviewer UI channel, and the result is returned to the consumer across an
// outbound UI channel (issued or rejected). Channels are first-class and live in
// their own registry; nodes reference them by id.

import type { ChannelDefinition, FlowDefinition, FlowNode, Position } from "./types";

/**
 * The channels the worked example references. Seeded into the channel library on
 * first run (see channels.ts `seedChannelsIfEmpty`) and used as the off-Tauri
 * fallback registry so colors resolve in dev/in-browser too.
 */
export const exampleChannels: ChannelDefinition[] = [
  {
    id: "ch-intake",
    title: "Consumer application app",
    description:
      "The citizen-facing app that submits the request and shows the result.",
    direction: "both",
    binding: { kind: "ui" },
    accepts: [
      {
        name: "request_more_info",
        description: "Ask the applicant to supply or correct a document.",
        fields: [{ name: "message", type: "string" }],
      },
      {
        name: "deliver_result",
        description: "Return the final decision to the applicant.",
        fields: [
          { name: "outcome", type: "string" },
          { name: "certificate_url", type: "file", required: false },
        ],
      },
    ],
    returns: [
      {
        name: "submit_application",
        description: "Initial submission that starts the flow.",
        fields: [
          { name: "national_id", type: "string" },
          { name: "applicant_name", type: "string" },
          { name: "address_proof", type: "string" },
        ],
      },
    ],
  },
  {
    id: "ch-id-registry",
    title: "National ID registry",
    description: "External government registry used to validate identities.",
    direction: "outbound",
    binding: { kind: "service", scope: "external" },
    accepts: [
      {
        name: "lookup",
        fields: [{ name: "national_id", type: "string" }],
      },
    ],
    returns: [
      {
        name: "result",
        fields: [
          { name: "match", type: "boolean" },
          { name: "full_name", type: "string", required: false },
        ],
      },
    ],
  },
  {
    id: "ch-bureaucrat",
    title: "Reviewer desk",
    description: "Human caseworker desktop for ambiguous address proofs.",
    direction: "both",
    binding: { kind: "ui" },
    accepts: [
      {
        name: "assign_case",
        fields: [
          { name: "case_id", type: "string" },
          { name: "address_confidence", type: "number" },
        ],
      },
    ],
    returns: [
      {
        name: "decision",
        fields: [{ name: "approved", type: "boolean" }],
      },
    ],
  },
  {
    id: "ch-notify",
    title: "Certificate & notification service",
    description: "Internal service that generates the certificate document.",
    direction: "outbound",
    binding: { kind: "service", scope: "internal" },
    accepts: [
      {
        name: "issue_certificate",
        fields: [{ name: "national_id", type: "string" }],
      },
    ],
    returns: [
      {
        name: "issued",
        fields: [{ name: "certificate_url", type: "file" }],
      },
    ],
  },
  {
    id: "ch-draft-letter",
    title: "Draft decision letter (nested flow)",
    description:
      "A channel bound to another flow: it runs the 'Draft decision letter' " +
      "sub-flow, which takes the case as input and returns a drafted letter.",
    direction: "both",
    binding: { kind: "flow", flowId: "draft-decision-letter" },
    accepts: [],
    returns: [],
  },
  {
    id: "ch-draft-intake",
    title: "Draft service",
    description: "Internal service boundary the draft sub-flow runs behind.",
    direction: "both",
    binding: { kind: "service", scope: "internal" },
    accepts: [],
    returns: [
      {
        name: "case",
        description: "The decided case handed to the drafting sub-flow.",
        fields: [
          { name: "applicant_name", type: "string" },
          { name: "outcome", type: "string" },
          { name: "decision_reason", type: "string", required: false },
        ],
      },
    ],
  },

  // --- channels for the two meta-flow regions of the loop demo ------------- //
  {
    id: "ch-mining-feed",
    title: "Process-mining feed",
    description: "External feed of an existing procedure's event log + variant stats.",
    direction: "inbound",
    binding: { kind: "service", scope: "external" },
    accepts: [],
    returns: [
      {
        name: "log",
        description: "The mined activities and variant statistics to draft from.",
        fields: [
          { name: "activities", type: "string" },
          { name: "variant_stats", type: "string" },
        ],
      },
    ],
  },
  {
    // Shared store both meta-flows write to (init: the drafted flow; update: the
    // approved revision). Kept identical to eval/build_flows.py's definition so
    // the two sources don't fight over examples/flows/channels/ch-flow-library.json.
    id: "ch-flow-library",
    title: "Flow library",
    description: "Internal service: stores authored/updated flow definitions.",
    direction: "outbound",
    binding: { kind: "service", scope: "internal" },
    accepts: [
      {
        name: "write_flow",
        fields: [
          { name: "flow_id", type: "string" },
          { name: "flow_json", type: "string" },
        ],
      },
    ],
    returns: [],
  },
  {
    id: "ch-exception-queue",
    title: "Exception queue",
    description: "Inbound batch of accumulated non-routine cases to learn from.",
    direction: "inbound",
    binding: { kind: "service", scope: "internal" },
    accepts: [],
    returns: [
      {
        name: "batch",
        description: "The accumulated exceptions to analyse.",
        fields: [{ name: "cases", type: "string" }],
      },
    ],
  },
  {
    id: "ch-policy-registry",
    title: "Policy registry",
    description: "External authority consulted before proposing a flow change.",
    direction: "outbound",
    binding: { kind: "service", scope: "external" },
    accepts: [{ name: "lookup", fields: [{ name: "article", type: "string" }] }],
    returns: [{ name: "ref", fields: [{ name: "citation", type: "string" }] }],
  },
  {
    id: "ch-policy-authority",
    title: "Policy maker",
    description: "Human authority who approves or rejects a proposed flow update.",
    direction: "both",
    binding: { kind: "ui" },
    accepts: [{ name: "review", fields: [{ name: "proposal", type: "string" }] }],
    returns: [{ name: "decision", fields: [{ name: "approved", type: "boolean" }] }],
  },
  {
    id: "ch-change-log",
    title: "Change log",
    description: "Outbound record when an update is left as-is (no change).",
    direction: "outbound",
    binding: { kind: "service", scope: "internal" },
    accepts: [{ name: "record", fields: [{ name: "note", type: "string" }] }],
    returns: [],
  },
];

/**
 * A small sub-flow used to demonstrate nesting (README goal: take input from a
 * service/channel and output a draft update to the flow). An inbound service
 * channel receives the case; an agent drafts a citizen-facing decision letter;
 * an outbound service channel returns it. When a parent flow references this via
 * a `{ kind: "flow" }` channel, the runner runs it inline and merges its
 * `draft_letter` variable back into the parent run.
 */
export const draftDecisionLetter: FlowDefinition = {
  id: "draft-decision-letter",
  title: "Draft decision letter",
  description:
    "Nested sub-flow: takes the decided case as input and drafts the " +
    "citizen-facing letter, returning it to the parent flow.",
  nodes: [
    {
      id: "d-in",
      kind: "channel",
      channelId: "ch-draft-intake",
      label: "Receive case",
      description: "Inbound service channel: the parent flow hands off the case.",
      position: { x: 80, y: 160 },
    },
    {
      id: "d-draft",
      kind: "agent",
      agentRef: "arabic-reasoner",
      label: "Draft decision letter",
      description: "Fanar drafts a short, polite letter conveying the outcome.",
      prompt:
        "Write a short, polite decision letter to the applicant.\n\n" +
        "Applicant: {{applicant_name}}\nOutcome: {{outcome}}\n" +
        "Reason: {{decision_reason}}\n\n" +
        "Return only the letter body.",
      position: { x: 520, y: 160 },
    },
    {
      id: "d-out",
      kind: "channel",
      channelId: "ch-draft-intake",
      label: "Return draft",
      outcome: "issued",
      position: { x: 960, y: 160 },
    },
  ],
  edges: [
    { id: "de-in-draft", from: "d-in", to: "d-draft" },
    {
      id: "de-draft-out",
      from: "d-draft",
      to: "d-out",
      set: [{ var: "draft_letter", expr: "outcome.text" }],
    },
  ],
};

/**
 * The bundled worked example, authored entirely in the channel model (see
 * docs/channel-model.md) and carrying the executable detail the compiler needs:
 * agent prompts, action ops, flow vars, branch guards in the harness expression
 * language, and per-branch `set`s. Clicking "Compile" produces a clean
 * `.maestro/flows/<id>.yaml` the harness runs with `/flow <id>`.
 *
 * Where execution demands it the model uses concrete ops: identity validation is
 * a deterministic shell action (a service channel can't yield an exit code to
 * branch on), and the address agent emits a VERDICT the decision branches on --
 * carried through a variable, because a node's guards see only the immediately
 * preceding node's outcome.
 */
export const residenceCertificateRunnable: FlowDefinition = {
  id: "residence-certificate-runnable",
  title: "Residence Certificate Request",
  description:
    "Auto-issues clean applications, escalates " +
    "ambiguous address proofs to a reviewer, rejects invalid identities. Compiles " +
    "to a maestro flow.",
  nodes: [
    {
      id: "n-input",
      kind: "channel",
      channelId: "ch-intake",
      label: "Application intake",
      description:
        "Inbound door: the citizen submits their application across the " +
        "consumer app to trigger the flow.",
      position: { x: 80, y: 160 },
    },
    {
      id: "n-approved",
      kind: "channel",
      channelId: "ch-intake",
      label: "Certificate issued",
      outcome: "issued",
      position: { x: 80, y: -999 },
    },
    {
      id: "n-rejected",
      kind: "channel",
      channelId: "ch-intake",
      label: "Application rejected",
      outcome: "rejected",
      position: { x: 80, y: -999 },
    },
    {
      id: "n-escalate",
      kind: "channel",
      channelId: "ch-bureaucrat",
      label: "Reviewer reviews address",
      description:
        "Review {{applicant_name}} (ID {{national_id}}). Proof: {{address_proof}}\n\n" +
        "Notes: {{decision_reason}}\n\nApprove to issue the certificate, or reject to deny.",
      position: { x: 80, y: 420 },
    },
    {
      id: "n-issue",
      kind: "channel",
      channelId: "ch-notify",
      label: "Issue certificate",
      description: "Generate the certificate document.",
      position: { x: 80, y: 560 },
    },
    {
      id: "n-draft",
      kind: "channel",
      channelId: "ch-draft-letter",
      label: "Draft decision letter",
      description:
        "Nested flow: hands the decided case to the 'Draft decision letter' " +
        "sub-flow, which returns a citizen-facing letter (double-click to open).",
      position: { x: 520, y: 560 },
    },
    {
      id: "n-check-id",
      kind: "action",
      op: "shell",
      label: "Validate ID against registry",
      description:
        "Deterministic registry check: a valid ID is 8 digits, not leading zero.",
      command:
        'id="{{national_id}}"\n' +
        'if echo "$id" | grep -Eq \'^[1-9][0-9]{7}$\'; then echo MATCH; exit 0; fi\n' +
        'echo "national id not found in registry" >&2; exit 1',
      position: { x: 520, y: 160 },
    },
    {
      id: "n-score-address",
      kind: "agent",
      agentRef: "arabic-reasoner",
      label: "Assess address proof",
      description: "Fanar reads the proof and returns a verdict.",
      prompt:
        "Assess whether the proof of address confirms the applicant resides at the stated address.\n\n" +
        "Applicant: {{applicant_name}}\nNational ID: {{national_id}}\nProof: {{address_proof}}\n\n" +
        "Explain briefly, then end with EXACTLY one line:\n" +
        "  VERDICT: sufficient    -- clearly proves residence; auto-issue\n" +
        "  VERDICT: ambiguous     -- unclear; a reviewer must review\n" +
        "  VERDICT: insufficient  -- does not prove residence; reject",
      position: { x: 960, y: 160 },
    },
    {
      id: "n-decision",
      kind: "decision",
      label: "Address proof sufficient?",
      position: { x: 1400, y: 160 },
    },
  ],
  edges: [
    { id: "e-input-check", from: "n-input", to: "n-check-id" },
    {
      id: "e-check-score",
      from: "n-check-id",
      to: "n-score-address",
      label: "ID valid",
      guard: "outcome.exit == 0",
    },
    {
      id: "e-check-reject",
      from: "n-check-id",
      to: "n-rejected",
      label: "ID invalid",
      set: [
        { var: "outcome", expr: '"rejected"' },
        {
          var: "decision_reason",
          expr: '"National ID failed registry validation."',
        },
      ],
    },
    {
      id: "e-score-decision",
      from: "n-score-address",
      to: "n-decision",
      set: [
        { var: "addr_verdict", expr: "outcome.verdict" },
        { var: "decision_reason", expr: "outcome.text" },
      ],
    },
    {
      id: "e-decision-issue",
      from: "n-decision",
      to: "n-issue",
      label: "sufficient",
      guard: 'addr_verdict == "sufficient"',
      set: [{ var: "outcome", expr: '"issued"' }],
    },
    {
      id: "e-decision-escalate",
      from: "n-decision",
      to: "n-escalate",
      label: "ambiguous",
      guard: 'addr_verdict == "ambiguous"',
    },
    {
      id: "e-decision-reject",
      from: "n-decision",
      to: "n-rejected",
      label: "insufficient",
      set: [{ var: "outcome", expr: '"rejected"' }],
    },
    {
      id: "e-escalate-issue",
      from: "n-escalate",
      to: "n-issue",
      label: "approved",
      guard: 'outcome.verdict == "approve"',
      set: [
        { var: "outcome", expr: '"issued"' },
        {
          var: "decision_reason",
          expr: '"Approved by the reviewer after review."',
        },
      ],
    },
    {
      id: "e-escalate-reject",
      from: "n-escalate",
      to: "n-rejected",
      label: "denied",
      set: [
        { var: "outcome", expr: '"rejected"' },
        {
          var: "decision_reason",
          expr: '"Denied by the reviewer after review."',
        },
      ],
    },
    {
      id: "e-issue-draft",
      from: "n-issue",
      to: "n-draft",
      set: [{ var: "certificate_url", expr: '"cert://residence/issued"' }],
    },
    {
      id: "e-draft-approved",
      from: "n-draft",
      to: "n-approved",
    },
  ],
};

// --------------------------------------------------------------------------- //
// Loop demo: the whole self-improving loop on one canvas. The running procedure
// (the residence spine) sits at the bottom; the two meta-flows that bookend it
// -- "initial drafting" (data -> a routine flow) and "periodic update"
// (exceptions -> an improved flow) -- are shown EXPANDED as labelled group
// containers floating above it, each crossing external services. Running any
// region pans/zooms the camera to it (see FlowCanvas live-run camera).
// --------------------------------------------------------------------------- //

// Group geometry, mirrored from geometry.ts (NODE_W/HEADER/PAD). The group frame
// wraps its members' bounding box, so we can arrange them in a compact grid
// rather than one tall column.
// --------------------------------------------------------------------------- //
// Loop-demo layout, organised by channel ROLE (not by flow):
//   - UI (yellow) channels on the LEFT  -- the human/citizen touch-points.
//   - service channels collected on the RIGHT, SHARED across flows (one Flow
//     library that both meta-flows write to; one services group).
//   - flow logic (agents/actions/decisions) in the MIDDLE, in lanes.
// Columns are wide so edge labels read between nodes.
// --------------------------------------------------------------------------- //
const G_PAD = 12, G_HEADER = 40, CH_H = 88;
const COL_UI = 40, COL_A = 760, COL_B = 1340, COL_C = 1760, COL_SVC = 2320;

// Shared services collection (right). Each service is ONE node; flows connect to
// it from the middle. Stacked vertically inside a labelled group; the loop's
// drafted spine adds its own services (e.g. Notification) into the same group.
const servicesGroup: FlowNode = {
  id: "g-services",
  kind: "group",
  label: "Services (shared)",
  color: "green",
  position: { x: COL_SVC - G_PAD, y: -80 },
};
const SVC_Y0 = servicesGroup.position.y + G_HEADER + G_PAD;
const svcSlot = (i: number) => ({ x: COL_SVC, y: SVC_Y0 + i * (CH_H + 18) });
const services: FlowNode[] = [
  servicesGroup,
  { id: "svc-mining", kind: "channel", groupId: "g-services", channelId: "ch-mining-feed",
    label: "Process-mining feed", description: "External feed: a procedure's event log + variant stats.",
    position: svcSlot(0) },
  { id: "svc-exceptions", kind: "channel", groupId: "g-services", channelId: "ch-exception-queue",
    label: "Exception queue", description: "Accumulated non-routine cases to learn from.",
    position: svcSlot(1) },
  { id: "svc-policy", kind: "channel", groupId: "g-services", channelId: "ch-policy-registry",
    label: "Policy registry", description: "External authority consulted before a change.",
    position: svcSlot(2) },
  { id: "svc-library", kind: "channel", groupId: "g-services", channelId: "ch-flow-library",
    label: "Flow library", outcome: "issued",
    description: "Shared store: both meta-flows write the drafted / updated flow here.",
    position: svcSlot(3) },
  { id: "svc-changelog", kind: "channel", groupId: "g-services", channelId: "ch-change-log",
    label: "Change log", outcome: "rejected", description: "Record when an update is left as-is.",
    position: svcSlot(4) },
];

// UI (yellow) channels, on the left. The update flow's human gate lives here.
const metaUi: FlowNode[] = [
  { id: "fu-gate", kind: "channel", channelId: "ch-policy-authority", label: "Policy maker",
    description: "The policy maker reviews the proposed update.\n\nApprove to write it back, or reject to leave the flow as-is.",
    position: { x: COL_UI, y: 360 } },
];

// Flow logic in the middle: init lane (y 40) and update lane (y 360).
const metaLogic: FlowNode[] = [
  { id: "fd-mine", kind: "agent", agentRef: "arabic-reasoner", label: "Mine process model",
    description: "Identify the routine spine and the exception forks from the event log.",
    prompt: "Mine the dominant routine path and exception forks from this event log.\n\n" +
      "Activities: {{activities}}\nVariants: {{variant_stats}}\n\nEnd with one line:\n  VERDICT: mined",
    position: { x: COL_A, y: 40 } },
  { id: "fd-draft", kind: "agent", agentRef: "arabic-reasoner", label: "Draft routine flow",
    description: "Emit a deterministic spine + an agent node on exceptions + a human gate.",
    prompt: "Using the mined model, draft a Flowstate routine flow (deterministic spine, " +
      "agent on exceptions, a human gate). Return the flow JSON.",
    position: { x: COL_B, y: 40 } },
  { id: "fu-agg", kind: "action", op: "shell", label: "Aggregate exceptions",
    description: "Compute appeal rates by article / amount band.",
    command: "python3 aggregate_exceptions.py '{{cases}}' || echo aggregated",
    position: { x: COL_A, y: 360 } },
  { id: "fu-analyze", kind: "agent", agentRef: "arabic-reasoner", label: "Propose flow update",
    description: "Turn the aggregates into a concrete, cited flow change.",
    prompt: "Given the aggregates, propose a concrete flow update (new guard / pre-check). " +
      "End with one line:\n  VERDICT: material   -- worth a policy review\n" +
      "  VERDICT: minor      -- leave the flow as-is",
    position: { x: COL_B, y: 360 } },
  { id: "fu-material", kind: "decision", label: "Material change?", position: { x: COL_C, y: 360 } },
];

// The main routine procedure (the residence spine), re-laid-out to the same
// convention (UI left, service right, logic middle). NOT part of loopDemo's
// initial nodes: the demo starts with only the two meta-flows, and the init
// drafting run "drafts" this onto the canvas (see FlowEditor's loop-demo hook).
const SPINE_POS: Record<string, Position> = {
  "n-input": { x: COL_UI, y: 900 },
  // n-approved / n-rejected share ch-intake, so they render consolidated into
  // the intake card. Give them that card's position (not an off-screen sentinel)
  // so the live-run camera rests on the card, not on empty space, at the end.
  "n-approved": { x: COL_UI, y: 900 },
  "n-rejected": { x: COL_UI, y: 900 },
  "n-check-id": { x: COL_A, y: 900 },
  "n-score-address": { x: COL_B, y: 900 },
  "n-decision": { x: COL_C, y: 900 },
  "n-escalate": { x: COL_UI, y: 1140 },
  "n-issue": svcSlot(5),
  "n-draft": { x: COL_B, y: 1140 },
};
const SPINE_GROUP: Record<string, string> = { "n-issue": "g-services" };
export const loopDemoSpine: { nodes: FlowNode[]; edges: typeof residenceCertificateRunnable.edges } = {
  nodes: residenceCertificateRunnable.nodes.map((n) => ({
    ...n,
    position: SPINE_POS[n.id] ?? n.position,
    ...(SPINE_GROUP[n.id] ? { groupId: SPINE_GROUP[n.id] } : {}),
  })),
  edges: residenceCertificateRunnable.edges,
};

// The change the periodic-update run makes to the main flow: a new pre-appeal
// fast-track step, tapped off the address-proof decision with a guard that never
// fires in the demo (so it's a visible, structurally-real addition that can't
// alter the already-run procedure).
export const loopDemoUpdate: { nodes: FlowNode[]; edges: typeof residenceCertificateRunnable.edges } = {
  nodes: [
    {
      id: "n-fasttrack",
      kind: "decision",
      label: "Pre-appeal fast-track (added by update)",
      position: { x: COL_C, y: 1140 },
    },
  ],
  edges: [
    {
      id: "e-decision-fasttrack",
      from: "n-decision",
      to: "n-fasttrack",
      label: "fast-track (new)",
      guard: 'addr_verdict == "expedite"',
    },
  ],
};

export const loopDemo: FlowDefinition = {
  id: "loop-demo",
  title: "Government services loop",
  description:
    "The whole self-improving loop on one canvas: UI channels on the left, a " +
    "shared services collection on the right, flow logic in the middle. Running " +
    "the init flow drafts the routine procedure onto the canvas; running the " +
    "update flow adds a step to it.",
  nodes: [...services, ...metaUi, ...metaLogic],
  edges: [
    // init: mining feed (svc) -> mine -> draft -> flow library (svc, shared)
    { id: "fde-door-mine", from: "svc-mining", to: "fd-mine" },
    { id: "fde-mine-draft", from: "fd-mine", to: "fd-draft",
      set: [{ var: "process_model", expr: "outcome.text" }] },
    { id: "fde-draft-out", from: "fd-draft", to: "svc-library",
      set: [{ var: "flow_json", expr: "outcome.text" }] },
    // update: exception queue (svc) -> aggregate -> policy registry (svc) ->
    // propose -> material? -> policy maker (UI gate) -> library / change log
    { id: "fue-door-agg", from: "svc-exceptions", to: "fu-agg" },
    { id: "fue-agg-policy", from: "fu-agg", to: "svc-policy" },
    { id: "fue-policy-analyze", from: "svc-policy", to: "fu-analyze" },
    { id: "fue-analyze-material", from: "fu-analyze", to: "fu-material",
      set: [{ var: "materiality", expr: "outcome.verdict" }] },
    { id: "fue-material-yes", from: "fu-material", to: "fu-gate",
      label: "material", guard: 'materiality == "material"' },
    { id: "fue-material-no", from: "fu-material", to: "svc-changelog",
      label: "minor", set: [{ var: "outcome", expr: '"no_change"' }] },
    { id: "fue-gate-approve", from: "fu-gate", to: "svc-library",
      label: "approved", guard: 'outcome.verdict == "approve"',
      set: [{ var: "outcome", expr: '"updated"' }] },
    { id: "fue-gate-reject", from: "fu-gate", to: "svc-changelog",
      label: "rejected", set: [{ var: "outcome", expr: '"no_change"' }] },
  ],
};

/**
 * A fresh, empty flow with a single channel node. Used by "New flow" in the
 * selector and as a fallback when an unknown flow id is opened. The id must be a
 * safe bare file name (see the backend `safe_name` guard). The node has no
 * channel assigned yet -- the author picks an inbound channel in the inspector
 * to turn it into the flow's entry door.
 */
export function blankFlow(id: string): FlowDefinition {
  return {
    id,
    title: "Untitled flow",
    nodes: [
      {
        id: "n-start",
        kind: "channel",
        label: "Application received",
        position: { x: 178, y: 200 },
      },
    ],
    edges: [],
  };
}
