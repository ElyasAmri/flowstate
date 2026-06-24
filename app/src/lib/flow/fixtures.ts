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

import type { ChannelDefinition, FlowDefinition } from "./types";

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
