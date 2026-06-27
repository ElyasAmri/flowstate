# Real Fanar facts-only Arabic-LJP run (the sweep's best config, but persisting
# per-case predictions this time), scored against the corrected key.
import json, sys, re, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "eval"); import run_fanar as rf
D = "eval/data/"; model = rf.discover_model()
cases = json.load(open(D+"ljp_factsonly.json", encoding="utf-8"))
key = json.load(open(D+"ljp_key.json"))

def call(p):
    body = json.dumps({"model": model, "messages":[{"role":"user","content":p}],
                       "max_tokens":1400, "temperature":0}).encode()
    req = urllib.request.Request(rf.BASE+"/chat/completions", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {rf.KEY}"); req.add_header("Content-Type","application/json")
    req.add_header("User-Agent","Mozilla/5.0")
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)["choices"][0]["message"]["content"]

def prompt(c):
    return (rf.LJP_SPEC + f"الوقائع:\n{c['facts']}\n\nThink in one short sentence, then a "
            "final line exactly:\nVERDICT: accept | reject | route")

def extract(t):
    tail = t.split("</think>")[-1]
    m = list(re.finditer(r"VERDICT\s*:\s*(accept|reject|route)", tail, re.I)) or \
        list(re.finditer(r"\b(accept|reject|route)\b", tail, re.I))
    return m[-1].group(1).lower() if m else "abstain"

def one(c):
    try: return {"id": c["id"], "decision": extract(call(prompt(c)))}
    except Exception as e: return {"id": c["id"], "decision": "abstain"}

with ThreadPoolExecutor(max_workers=8) as ex:
    out = list(ex.map(one, cases))
json.dump(out, open(D+"ljp_factsonly_fanar_out.json","w"), ensure_ascii=False, indent=2)
o = {x["id"]: x["decision"] for x in out}
acc = sum(1 for i in key if o[i]==key[i])/len(key)
errs = Counter(f"{key[i]}->{o[i]}" for i in key if o[i]!=key[i])
print(f"Fanar facts-only (corrected key): {acc:.0%}  errors={dict(errs)}")
for L in ["accept","reject","route"]:
    sup=sum(1 for i in key if key[i]==L); rec=sum(1 for i in key if key[i]==L and o[i]==L)
    print(f"  {L}: {rec}/{sup}")
print("DONE")
