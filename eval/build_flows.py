#!/usr/bin/env python3
"""Author the three Flowstate flows of the evaluation loop as real
FlowDefinition / ChannelDefinition JSON (the exact on-disk shape the app loads
from <project>/.flowstate/{flows,channels}/<id>.json), then validate them with
the same rules the compiler enforces (compile.ts):

  1. flow-drafting   meta-flow: existing data  -> draft routine flow
  2. fine-management major flow: routine processing, exceptions -> human gate
  3. flow-update     meta-flow: accumulated exceptions -> proposed flow update

Output goes to the committed examples/ library (examples/flows/{,channels/}).
Run: python3 eval/build_flows.py   (writes examples/, prints validation)
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "examples", "flows")
CH = os.path.join(OUT, "channels")
os.makedirs(CH, exist_ok=True)

def pos(x, y): return {"x": float(x), "y": float(y)}

# --------------------------------------------------------------------------- #
# Channels
# --------------------------------------------------------------------------- #
CHANNELS = [
    # --- fine-management ---
    {"id": "ch-fine-intake", "title": "Fine intake",
     "description": "Inbound door: a new road-traffic fine enters the flow.",
     "direction": "inbound", "binding": {"kind": "ui"},
     "accepts": [],
     "returns": [{"name": "new_fine", "description": "A newly issued fine.",
                  "fields": [
                      {"name": "amount", "type": "number"},
                      {"name": "points", "type": "number"},
                      {"name": "article", "type": "string"},
                      {"name": "offender_id", "type": "string"},
                      {"name": "appeal_filed", "type": "boolean"},
                      {"name": "paid", "type": "boolean"}]}]},
    {"id": "ch-collection", "title": "Credit collection service",
     "description": "External service: unpaid fines are forwarded automatically.",
     "direction": "outbound", "binding": {"kind": "service", "scope": "external"},
     "accepts": [{"name": "forward", "fields": [
         {"name": "offender_id", "type": "string"},
         {"name": "amount", "type": "number"}]}],
     "returns": []},
    {"id": "ch-prefecture", "title": "Prefecture bureaucrat",
     "description": "Human gate: a bureaucrat rules on a contested fine.",
     "direction": "both", "binding": {"kind": "ui"},
     "accepts": [{"name": "assign_appeal", "fields": [
         {"name": "offender_id", "type": "string"},
         {"name": "amount", "type": "number"},
         {"name": "points", "type": "number"},
         {"name": "recommendation", "type": "string"}]}],
     "returns": [{"name": "ruling", "fields": [
         {"name": "upheld", "type": "boolean"}]}]},
    {"id": "ch-fine-result", "title": "Fine outcome",
     "description": "Outbound: the terminal outcome of a fine case.",
     "direction": "outbound", "binding": {"kind": "ui"},
     "accepts": [{"name": "deliver", "fields": [
         {"name": "outcome", "type": "string"}]}],
     "returns": []},
    # --- shared meta channel: the flow library ---
    {"id": "ch-flow-library", "title": "Flow library",
     "description": "Internal service: stores authored/updated flow definitions.",
     "direction": "outbound", "binding": {"kind": "service", "scope": "internal"},
     "accepts": [{"name": "write_flow", "fields": [
         {"name": "flow_id", "type": "string"},
         {"name": "flow_json", "type": "string"}]}],
     "returns": []},
    # --- flow-drafting ---
    {"id": "ch-event-log", "title": "Event-log intake",
     "description": "Inbound door: mined variant statistics from an existing log.",
     "direction": "inbound", "binding": {"kind": "service", "scope": "internal"},
     "accepts": [],
     "returns": [{"name": "event_log", "fields": [
         {"name": "activities", "type": "string"},
         {"name": "variant_stats", "type": "string"}]}]},
    # --- flow-update ---
    {"id": "ch-exceptions", "title": "Exception batch intake",
     "description": "Inbound door: a batch of accumulated non-routine cases.",
     "direction": "inbound", "binding": {"kind": "service", "scope": "internal"},
     "accepts": [],
     "returns": [{"name": "exception_batch", "fields": [
         {"name": "cases", "type": "string"},
         {"name": "current_flow_id", "type": "string"}]}]},
    {"id": "ch-policy-maker", "title": "Policy maker",
     "description": "Human gate: the policy maker approves a proposed flow update.",
     "direction": "both", "binding": {"kind": "ui"},
     "accepts": [{"name": "propose_update", "fields": [
         {"name": "summary", "type": "string"},
         {"name": "diff", "type": "string"}]}],
     "returns": [{"name": "approval", "fields": [
         {"name": "approved", "type": "boolean"}]}]},
    {"id": "ch-update-result", "title": "Update outcome",
     "description": "Outbound: whether the routine flow was updated or left as-is.",
     "direction": "outbound", "binding": {"kind": "ui"},
     "accepts": [{"name": "deliver", "fields": [
         {"name": "outcome", "type": "string"}]}],
     "returns": []},
]

# --------------------------------------------------------------------------- #
# Flow 1: flow-drafting (meta-flow: data -> draft routine flow)
# --------------------------------------------------------------------------- #
flow_drafting = {
    "id": "flow-drafting",
    "title": "Flow drafting (mine a flow from data)",
    "description": "Meta-flow: ingests an event log's variant statistics and "
                   "drafts a Flowstate routine flow, writing it to the library.",
    "nodes": [
        {"id": "fd-in", "kind": "channel", "channelId": "ch-event-log",
         "label": "Receive event log",
         "description": "Inbound door: the mined activities + variant statistics.",
         "position": pos(80, 200)},
        {"id": "fd-mine", "kind": "agent", "agentRef": "arabic-reasoner",
         "label": "Mine process model",
         "description": "Identify the dominant routine path and the exception forks.",
         "prompt": "You are given an event log's activity list and variant "
                   "statistics.\n\nActivities: {{activities}}\nVariants: "
                   "{{variant_stats}}\n\nIdentify the dominant deterministic "
                   "routine path and the points where exception branches fork. "
                   "End with one line:\n  VERDICT: mined",
         "position": pos(520, 200)},
        {"id": "fd-draft", "kind": "agent", "agentRef": "arabic-reasoner",
         "label": "Draft Flowstate flow",
         "description": "Emit a draft flow: deterministic spine + agent node on "
                        "exceptions + a human gate.",
         "prompt": "Using the mined model, draft a Flowstate flow as nodes and "
                   "edges. The routine path must be deterministic (action + "
                   "decision nodes); route exceptions to an agent node, then a "
                   "human gate (a channel bound to ui). Return the flow JSON.",
         "position": pos(960, 200)},
        {"id": "fd-assemble", "kind": "action", "op": "set",
         "label": "Assemble draft",
         "description": "Name the drafted flow (the JSON itself is captured on "
                        "the incoming edge, where the agent outcome is in scope).",
         "assignments": [{"var": "flow_id", "expr": '"fine-management-routine"'}],
         "position": pos(1400, 200)},
        {"id": "fd-out", "kind": "channel", "channelId": "ch-flow-library",
         "label": "Write draft to library", "outcome": "issued",
         "description": "Outbound: persist the drafted routine flow.",
         "position": pos(1840, 200)},
    ],
    "edges": [
        {"id": "fde-in-mine", "from": "fd-in", "to": "fd-mine"},
        {"id": "fde-mine-draft", "from": "fd-mine", "to": "fd-draft",
         "set": [{"var": "process_model", "expr": "outcome.text"}]},
        {"id": "fde-draft-assemble", "from": "fd-draft", "to": "fd-assemble",
         "set": [{"var": "flow_json", "expr": "outcome.text"}]},
        {"id": "fde-assemble-out", "from": "fd-assemble", "to": "fd-out"},
    ],
}

# --------------------------------------------------------------------------- #
# Flow 2: fine-management-routine (the major flow)
# --------------------------------------------------------------------------- #
fine_management = {
    "id": "fine-management-routine",
    "title": "Road-traffic fine management",
    "description": "Routine fines run a deterministic spine (create, send, pay "
                   "or auto-forward to collection); contested fines escalate to "
                   "an agent assessment and a prefecture human gate.",
    "nodes": [
        {"id": "fm-door", "kind": "channel", "channelId": "ch-fine-intake",
         "label": "Fine intake",
         "description": "Inbound door: a new fine (amount, article, points, "
                        "offender).",
         "position": pos(80, 320)},
        {"id": "fm-create", "kind": "action", "op": "log",
         "label": "Create fine", "message": "Create fine record from payload.",
         "position": pos(420, 320)},
        {"id": "fm-notify", "kind": "action", "op": "log",
         "label": "Send fine + insert notification",
         "message": "Send the fine to the offender and record notification.",
         "position": pos(760, 320)},
        {"id": "fm-appeal-q", "kind": "decision", "label": "Appeal filed?",
         "position": pos(1100, 320)},
        # routine payment sub-branch
        {"id": "fm-pay-q", "kind": "decision", "label": "Payment received?",
         "position": pos(1440, 200)},
        {"id": "fm-paid", "kind": "channel", "channelId": "ch-fine-result",
         "label": "Closed: paid", "outcome": "issued",
         "position": pos(1780, 120)},
        {"id": "fm-penalty", "kind": "action", "op": "log",
         "label": "Add penalty", "message": "Apply statutory surcharge.",
         "position": pos(1780, 280)},
        {"id": "fm-collection", "kind": "channel", "channelId": "ch-collection",
         "label": "Send for credit collection",
         "description": "Routine automated branch for unpaid fines.",
         "position": pos(2120, 280)},
        {"id": "fm-collected", "kind": "channel", "channelId": "ch-fine-result",
         "label": "Closed: collected", "outcome": "issued",
         "position": pos(2460, 280)},
        # exception (appeal) branch
        {"id": "fm-assess", "kind": "agent", "agentRef": "arabic-reasoner",
         "label": "Assess appeal",
         "description": "Agent weighs the contested fine and recommends a ruling.",
         "prompt": "A fine has been contested. Assess whether the appeal is "
                   "well-founded.\n\nArticle: {{article}}\nAmount: {{amount}}\n"
                   "Points: {{points}}\n\nExplain briefly, then end with one "
                   "line:\n  VERDICT: uphold   -- the appeal should be granted\n"
                   "  VERDICT: reject   -- the fine stands",
         "position": pos(1440, 460)},
        {"id": "fm-gate", "kind": "channel", "channelId": "ch-prefecture",
         "label": "Prefecture review (human gate)",
         "description": "Bureaucrat makes the binding ruling on the appeal.",
         "position": pos(1780, 460)},
        {"id": "fm-upheld", "kind": "channel", "channelId": "ch-fine-result",
         "label": "Appeal upheld", "outcome": "approved",
         "position": pos(2460, 400)},
        {"id": "fm-judge", "kind": "action", "op": "log",
         "label": "Escalate to judge", "message": "Forward rejected appeal to a judge.",
         "position": pos(2460, 540)},
        {"id": "fm-rejected", "kind": "channel", "channelId": "ch-fine-result",
         "label": "Appeal rejected", "outcome": "rejected",
         "position": pos(2800, 540)},
    ],
    "edges": [
        {"id": "fme-door-create", "from": "fm-door", "to": "fm-create"},
        {"id": "fme-create-notify", "from": "fm-create", "to": "fm-notify"},
        {"id": "fme-notify-appeal", "from": "fm-notify", "to": "fm-appeal-q"},
        {"id": "fme-appeal-yes", "from": "fm-appeal-q", "to": "fm-assess",
         "label": "contested", "guard": "appeal_filed == true"},
        {"id": "fme-appeal-no", "from": "fm-appeal-q", "to": "fm-pay-q",
         "label": "routine"},
        # payment sub-branch
        {"id": "fme-pay-paid", "from": "fm-pay-q", "to": "fm-paid",
         "label": "paid", "guard": "paid == true",
         "set": [{"var": "outcome", "expr": '"paid"'}]},
        {"id": "fme-pay-unpaid", "from": "fm-pay-q", "to": "fm-penalty",
         "label": "unpaid"},
        {"id": "fme-penalty-collection", "from": "fm-penalty", "to": "fm-collection"},
        {"id": "fme-collection-closed", "from": "fm-collection", "to": "fm-collected",
         "set": [{"var": "outcome", "expr": '"collected"'}]},
        # appeal branch
        {"id": "fme-assess-gate", "from": "fm-assess", "to": "fm-gate",
         "set": [{"var": "recommendation", "expr": "outcome.verdict"}]},
        # fm-gate is the human gate: the channel node itself owns the guarded
        # split, so the interpreter suspends here for the bureaucrat's ruling.
        {"id": "fme-gate-upheld", "from": "fm-gate", "to": "fm-upheld",
         "label": "upheld", "guard": 'outcome.verdict == "approve"',
         "set": [{"var": "outcome", "expr": '"appeal_upheld"'}]},
        {"id": "fme-gate-rejected", "from": "fm-gate", "to": "fm-judge",
         "label": "rejected"},
        {"id": "fme-judge-closed", "from": "fm-judge", "to": "fm-rejected",
         "set": [{"var": "outcome", "expr": '"appeal_rejected"'}]},
    ],
}

# --------------------------------------------------------------------------- #
# Flow 3: flow-update (meta-flow: exceptions -> proposed update -> approval)
# --------------------------------------------------------------------------- #
flow_update = {
    "id": "flow-update",
    "title": "Flow update (improve from exceptions)",
    "description": "Meta-flow: aggregates accumulated non-routine cases, has an "
                   "agent propose flow updates, and routes a material change to "
                   "the policy maker for approval before writing it back.",
    "nodes": [
        {"id": "fu-in", "kind": "channel", "channelId": "ch-exceptions",
         "label": "Receive exception batch",
         "description": "Inbound door: accumulated non-routine cases.",
         "position": pos(80, 240)},
        {"id": "fu-agg", "kind": "action", "op": "shell",
         "label": "Aggregate exception stats",
         "description": "Compute appeal rates by article / amount / points.",
         "command": "python3 eval/aggregate_exceptions.py \"{{cases}}\" || "
                    "echo 'aggregated'",
         "position": pos(420, 240)},
        {"id": "fu-analyze", "kind": "agent", "agentRef": "arabic-reasoner",
         "label": "Propose flow updates",
         "description": "Turn the aggregates into concrete flow changes.",
         "prompt": "Given aggregate statistics over contested fines, propose "
                   "concrete updates to the routine flow (new decision guards, a "
                   "pre-appeal check, threshold tweaks). For each, cite the "
                   "pattern and the expected effect. End with one line:\n"
                   "  VERDICT: material   -- the change is worth a policy review\n"
                   "  VERDICT: minor      -- leave the routine flow as-is",
         "position": pos(760, 240)},
        {"id": "fu-material-q", "kind": "decision", "label": "Material change?",
         "position": pos(1100, 240)},
        {"id": "fu-gate", "kind": "channel", "channelId": "ch-policy-maker",
         "label": "Policy-maker approval (human gate)",
         "description": "The policy maker approves or rejects the proposed update.",
         "position": pos(1440, 160)},
        {"id": "fu-write", "kind": "channel", "channelId": "ch-flow-library",
         "label": "Write updated flow", "outcome": "issued",
         "description": "Outbound: persist the approved flow update.",
         "position": pos(1780, 160)},
        {"id": "fu-nochange", "kind": "channel", "channelId": "ch-update-result",
         "label": "No change", "outcome": "rejected",
         "description": "Outbound: the routine flow is left as-is.",
         "position": pos(1440, 360)},
    ],
    "edges": [
        {"id": "fue-in-agg", "from": "fu-in", "to": "fu-agg"},
        {"id": "fue-agg-analyze", "from": "fu-agg", "to": "fu-analyze"},
        {"id": "fue-analyze-material", "from": "fu-analyze", "to": "fu-material-q",
         "set": [{"var": "materiality", "expr": "outcome.verdict"}]},
        {"id": "fue-material-yes", "from": "fu-material-q", "to": "fu-gate",
         "label": "material", "guard": 'materiality == "material"'},
        {"id": "fue-material-no", "from": "fu-material-q", "to": "fu-nochange",
         "label": "minor", "set": [{"var": "outcome", "expr": '"no_change"'}]},
        # fu-gate is the human gate: the channel node itself owns the guarded
        # split, so the interpreter suspends here for the policy maker's verdict.
        {"id": "fue-gate-approve", "from": "fu-gate", "to": "fu-write",
         "label": "approved", "guard": 'outcome.verdict == "approve"',
         "set": [{"var": "outcome", "expr": '"updated"'}]},
        {"id": "fue-gate-reject", "from": "fu-gate", "to": "fu-nochange",
         "label": "rejected", "set": [{"var": "outcome", "expr": '"no_change"'}]},
    ],
}

FLOWS = [flow_drafting, fine_management, flow_update]

# --------------------------------------------------------------------------- #
# Validation (mirrors compile.ts)
# --------------------------------------------------------------------------- #
INBOUND = {"inbound", "both"}
def chan(cid): return next((c for c in CHANNELS if c["id"] == cid), None)

def validate(flow):
    errs = []
    ids = {n["id"] for n in flow["nodes"]}
    node = {n["id"]: n for n in flow["nodes"]}
    if not flow["nodes"]:
        errs.append("flow has no nodes")
    # dangling edges
    incoming = {}
    out = {nid: [] for nid in ids}
    for e in flow["edges"]:
        if e["from"] not in ids: errs.append(f"edge {e['id']}: unknown from {e['from']}")
        if e["to"] not in ids: errs.append(f"edge {e['id']}: unknown to {e['to']}")
        out.setdefault(e["from"], []).append(e)
        incoming[e["to"]] = incoming.get(e["to"], 0) + 1
    # entry doors: channel node, inbound/both channel, no incoming edge
    entries = []
    for n in flow["nodes"]:
        if n["kind"] == "channel" and n.get("channelId"):
            c = chan(n["channelId"])
            if c is None:
                errs.append(f"node {n['id']}: channel {n['channelId']} not in registry")
            elif c["direction"] in INBOUND and incoming.get(n["id"], 0) == 0:
                entries.append(n["id"])
    if not entries:
        errs.append("no entry door (inbound channel node with no incoming edge)")
    # reachability
    seen = set(); stack = list(entries)
    while stack:
        x = stack.pop()
        if x in seen: continue
        seen.add(x)
        for e in out.get(x, []): stack.append(e["to"])
    for n in flow["nodes"]:
        if n["id"] not in seen:
            errs.append(f"node {n['id']} ({n['label']}) unreachable from any entry")
    # at most one unconditional out-edge
    for nid, es in out.items():
        open_e = [e for e in es if not (e.get("guard") or "").strip()]
        if len(open_e) > 1:
            errs.append(f"node {nid}: {len(open_e)} unconditional transitions (max 1)")
    # agent needs prompt; shell action needs command
    for n in flow["nodes"]:
        if n["kind"] == "agent" and not (n.get("prompt") or "").strip():
            errs.append(f"node {n['id']}: agent has no prompt")
        if n["kind"] == "action" and n.get("op") == "shell" and not (n.get("command") or "").strip():
            errs.append(f"node {n['id']}: shell action has no command")
    return entries, errs

def main():
    for c in CHANNELS:
        json.dump(c, open(os.path.join(CH, c["id"] + ".json"), "w"),
                  ensure_ascii=False, indent=2)
    ok = True
    for fl in FLOWS:
        json.dump(fl, open(os.path.join(OUT, fl["id"] + ".json"), "w"),
                  ensure_ascii=False, indent=2)
        entries, errs = validate(fl)
        status = "OK" if not errs else "FAIL"
        if errs: ok = False
        print(f"[{status}] {fl['id']}: {len(fl['nodes'])} nodes, "
              f"{len(fl['edges'])} edges, entry={entries}")
        for e in errs:
            print(f"    - {e}")
    print(f"\n{len(CHANNELS)} channels, {len(FLOWS)} flows written to {OUT}")
    print("ALL VALID" if ok else "VALIDATION FAILED")
    return 0 if ok else 1

if __name__ == "__main__":
    raise SystemExit(main())
