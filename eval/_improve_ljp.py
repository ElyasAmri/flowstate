import json, sys, re, urllib.request
sys.path.insert(0, "eval"); import run_fanar as rf
D = "eval/data/"; model = rf.discover_model()
cases = json.load(open(D+"ljp_blind.json", encoding="utf-8"))
key = json.load(open(D+"ljp_key.json"))
SPEC = (rf.LJP_SPEC +
"Before deciding, check in order: (1) Jurisdiction: right court (عدم اختصاص)? if not -> route. "
"(2) Standing/admissibility: proper صفة, mediation prerequisite, well-formed claim. "
"(3) Proof: is the claim actually PROVEN, not merely asserted with a document? "
"Saudi commercial courts often REJECT (رفض) on procedure or insufficient proof even when documents were submitted. "
"Documentary evidence does NOT imply the claim is granted.\n\n")
def call(p):
    body = json.dumps({"model": model, "messages":[{"role":"user","content":p}],
                       "max_tokens":4096, "temperature":0}).encode()
    req = urllib.request.Request(rf.BASE+"/chat/completions", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {rf.KEY}"); req.add_header("Content-Type","application/json")
    req.add_header("User-Agent","Mozilla/5.0 (flowstate-eval)")
    with urllib.request.urlopen(req, timeout=300) as r:
        ch = json.load(r)["choices"][0]; return ch["message"]["content"], ch.get("finish_reason")
def prompt(c): return SPEC+f"الوقائع:\n{c['facts']}\n\nThink, then end with a line exactly: VERDICT: accept | reject | route"
from concurrent.futures import ThreadPoolExecutor
def one(c):
    try:
        txt, fin = call(prompt(c)); m = re.search(r"VERDICT\s*:\s*(accept|reject|route)", txt, re.I)
        return {"id":c["id"], "decision":(m.group(1).lower() if m else None), "finish":fin}
    except Exception as e:
        return {"id":c["id"], "decision":None, "finish":f"err:{type(e).__name__}"}
with ThreadPoolExecutor(max_workers=8) as ex: out = list(ex.map(one, cases))
o = {x["id"]: x for x in out}
trunc = sum(1 for x in out if x["finish"]=="length"); none = sum(1 for x in out if x["decision"] is None)
correct = sum(1 for i in key if o[i]["decision"]==key[i])
from collections import Counter
print(f"improved (4096+procedural): accuracy={correct/len(key):.0%}  truncated={trunc}  no_verdict={none}")
print("errors:", dict(Counter(f"{key[i]}->{o[i]['decision']}" for i in key if o[i]['decision']!=key[i])))
for L in ["accept","reject","route"]:
    sup = sum(1 for i in key if key[i]==L); rec = sum(1 for i in key if key[i]==L and o[i]["decision"]==L)
    print(f"  {L}: recall {rec}/{sup}")
json.dump(out, open(D+"ljp_fanar_improved.json","w"), ensure_ascii=False, indent=2)
print("DONE")
