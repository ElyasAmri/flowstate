# Test 2: run the two META-FLOW agent steps on Fanar (the Claude run did these).
#   - mining:      variant stats -> routine path + exception forks + draft nodes
#   - improvement: exception aggregates -> concrete flow updates
import json, sys, subprocess, urllib.request
sys.path.insert(0, "eval"); import run_fanar as rf
D = "eval/data/"; model = rf.discover_model()

def call(p, mt=4096):
    body = json.dumps({"model": model, "messages":[{"role":"user","content":p}],
                       "max_tokens": mt, "temperature":0}).encode()
    req = urllib.request.Request(rf.BASE+"/chat/completions", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {rf.KEY}"); req.add_header("Content-Type","application/json")
    req.add_header("User-Agent","Mozilla/5.0 (flowstate-eval)")
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)["choices"][0]["message"]["content"].strip()

stats = json.load(open(D+"stats.json"))
variants = "\n".join(f"- {v['variant']} ({v['pct']}%)" for v in stats["top_variants"])
ACTS = ("Create Fine, Send Fine, Insert Fine Notification, Add penalty, Payment, "
        "Send for Credit Collection, Insert Date Appeal to Prefecture, Send Appeal "
        "to Prefecture, Receive Result Appeal from Prefecture, Notify Result Appeal "
        "to Offender, Appeal to Judge")

mine = call(
    "You mine a deterministic government workflow from process data. Activities: "
    f"{ACTS}.\nTop variants of {stats['total_cases']} fine cases "
    f"({stats['routine_pct']}% routine, {stats['non_routine_pct']}% exceptions):\n"
    f"{variants}\n\nIdentify (1) the dominant deterministic routine path, (2) where "
    "the exception (appeal) branch forks, and (3) list the flow nodes as "
    "channel/agent/action/decision with their role. Be concise.")

agg = subprocess.run([sys.executable, "eval/aggregate_exceptions.py"],
                     capture_output=True, text=True).stdout.strip()
improve = call(
    "You improve a deterministic fine-management flow from its accumulated "
    f"exceptions (appeals). Aggregates over all cases:\n{agg}\n\nPropose 3-5 "
    "concrete flow updates (new decision guards, a pre-appeal check, thresholds), "
    "each tied to a number above and its expected effect. Be concise.")

open(D+"fanar_mined.md","w").write("# Fanar: mined flow\n\n"+mine+"\n")
open(D+"fanar_improvements.md","w").write("# Fanar: proposed improvements\n\n"+improve+"\n")
print("=== MINING ===\n", mine[:1400])
print("\n=== IMPROVEMENT ===\n", improve[:1400])
print("\nDONE")
