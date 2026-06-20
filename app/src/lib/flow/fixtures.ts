// A worked example flow so the editor opens on something concrete.
//
// Models a "Residence Certificate" request: the applicant submits their ID and
// proof of address; the harness validates the ID against the registry and
// checks the address; clean cases are issued automatically, ambiguous ones are
// escalated to a bureaucrat, and invalid ones are rejected.

import type { FlowDefinition } from "./types";

export const residenceCertificateFlow: FlowDefinition = {
  id: "flow-residence-certificate",
  title: "Residence Certificate Request",
  description:
    "Issue a certificate of residence. Auto-issues clean applications; " +
    "escalates ambiguous address proofs; rejects invalid identities.",
  startNodeId: "n-start",
  nodes: [
    {
      id: "n-start",
      kind: "start",
      label: "Application received",
      position: { x: 80, y: 200 },
    },
    {
      id: "n-collect",
      kind: "collect",
      label: "Collect ID & proof of address",
      description: "National ID number and a recent utility bill or tenancy contract.",
      position: { x: 320, y: 200 },
    },
    {
      id: "n-check-id",
      kind: "check",
      label: "Validate ID against registry",
      description: "Look up the national ID in the government registry.",
      position: { x: 580, y: 200 },
    },
    {
      id: "n-decision",
      kind: "decision",
      label: "Address proof sufficient?",
      position: { x: 840, y: 200 },
    },
    {
      id: "n-escalate",
      kind: "escalate",
      label: "Bureaucrat reviews address",
      description: "Manual review when the address proof is ambiguous.",
      position: { x: 840, y: 380 },
    },
    {
      id: "n-issue",
      kind: "action",
      label: "Issue certificate",
      description: "Generate the certificate and notify the applicant.",
      position: { x: 1100, y: 120 },
    },
    {
      id: "n-approved",
      kind: "terminal",
      label: "Certificate issued",
      outcome: "issued",
      position: { x: 1360, y: 120 },
    },
    {
      id: "n-rejected",
      kind: "terminal",
      label: "Application rejected",
      outcome: "rejected",
      position: { x: 580, y: 380 },
    },
  ],
  edges: [
    { id: "e-start-collect", from: "n-start", to: "n-collect" },
    { id: "e-collect-check", from: "n-collect", to: "n-check-id" },
    {
      id: "e-check-decision",
      from: "n-check-id",
      to: "n-decision",
      label: "ID valid",
      guard: "registry.match == true",
    },
    {
      id: "e-check-reject",
      from: "n-check-id",
      to: "n-rejected",
      label: "ID invalid",
      guard: "registry.match == false",
    },
    {
      id: "e-decision-issue",
      from: "n-decision",
      to: "n-issue",
      label: "sufficient",
      guard: "address.confidence >= 0.9",
    },
    {
      id: "e-decision-escalate",
      from: "n-decision",
      to: "n-escalate",
      label: "ambiguous",
      guard: "address.confidence < 0.9",
    },
    { id: "e-escalate-issue", from: "n-escalate", to: "n-issue", label: "approved" },
    {
      id: "e-escalate-reject",
      from: "n-escalate",
      to: "n-rejected",
      label: "denied",
    },
    { id: "e-issue-approved", from: "n-issue", to: "n-approved" },
  ],
};
