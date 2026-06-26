# Test 3: calibrated abstention. Re-run the Arabic-LJP track with brief
# reasoning AND a self-reported confidence, then measure whether escalating the
# low-confidence cases to a human gate removes the model's errors.
import json, sys, re, urllib.request
sys.path.insert(0, "eval"); import run_fanar as rf
D = "eval/data/"; model = rf.discover_model()
cases = json.load(open(D+"ljp_blind.json", encoding="utf-8"))
key = json.load(open(D+"ljp_key.json"))

def call(p, mt=1024):
    body = json.dumps({"model": model, "messages":[{"role":"user","content":p}],
                       "max_tokens": mt, "temperature":0}).encode()
    req = urllib.request.Request(rf.BASE+"/chat/completions", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {rf.KEY}"); req.add_header("Content-Type","application/json")
    req.add_header("User-Agent","Mozilla/5.0 (flowstate-eval)")
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.load(r)["choices"][0]["message"]["content"]

def prompt(c):
    return (rf.LJP_SPEC + f"الوقائع:\n{c['facts']}\n\n"
            "Think in ONE short sentence, then two final lines exactly:\n"
            "VERDICT: accept | reject | route\nCONFIDENCE: high | medium | low")

from concurrent.futures import ThreadPoolExecutor
def one(c):
    try:
        t = call(prompt(c))
        v = re.search(r"VERDICT\s*:\s*(accept|reject|route)", t, re.I)
        cf = re.search(r"CONFIDENCE\s*:\s*(high|medium|low)", t, re.I)
        return {"id":c["id"], "decision":(v.group(1).lower() if v else None),
                "confidence":(cf.group(1).lower() if cf else "low")}
    except Exception as e:
        return {"id":c["id"], "decision":None, "confidence":"low"}
with ThreadPoolExecutor(max_workers=8) as ex:
    out = list(ex.map(one, cases))
json.dump(out, open(D+"ljp_fanar_abstain.json","w"), ensure_ascii=False, indent=2)
o = {x["id"]: x for x in out}

def report(escalate_set, label):
    auto = [i for i in key if o[i]["confidence"] not in escalate_set]
    esc = [i for i in key if o[i]["confidence"] in escalate_set]
    corr = sum(1 for i in auto if o[i]["decision"] == key[i])
    acc = corr/len(auto) if auto else 0
    # how many of the escalated were ones the model would have gotten wrong
    esc_wrong = sum(1 for i in esc if o[i]["decision"] != key[i])
    print(f"  {label}: auto-decided {len(auto)}/{len(key)} at {acc:.0%} acc; "
          f"escalated {len(esc)} ({esc_wrong} of which model had wrong)")

base_corr = sum(1 for i in key if o[i]["decision"] == key[i])
from collections import Counter
print(f"baseline (decide all): {base_corr}/{len(key)} = {base_corr/len(key):.0%}")
print("confidence dist:", dict(Counter(o[i]["confidence"] for i in key)))
report({"low"}, "escalate low only")
report({"low","medium"}, "escalate low+medium")
print("DONE")
