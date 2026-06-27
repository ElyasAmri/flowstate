# Proper abstention: sampling-agreement as a model-derived confidence signal.
# Self-report failed (Fanar says "high" on everything). Here we sample N times
# at temperature>0; the majority vote is the decision and the agreement fraction
# is the confidence. Escalating low-agreement cases to the human gate should
# remove the model's errors -- the real test of the gate thesis.
import json, sys, re, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "eval"); import run_fanar as rf
D = "eval/data/"; model = rf.discover_model()
blind = json.load(open(D+"ljp_blind.json", encoding="utf-8"))
key = json.load(open(D+"ljp_key.json"))
N = 8

def sample(c):
    user = (rf.LJP_SPEC + f"الوقائع:\n{c['facts']}\n\n"
            "Think in one short sentence, then end with a line exactly:\n"
            "VERDICT: accept | reject | route")
    body = {"model": model, "messages":[{"role":"user","content":user}],
            "max_tokens":1200, "temperature":0.7, "n":N}
    req = urllib.request.Request(rf.BASE+"/chat/completions",
            data=json.dumps(body).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {rf.KEY}"); req.add_header("Content-Type","application/json")
    req.add_header("User-Agent","Mozilla/5.0")
    with urllib.request.urlopen(req, timeout=300) as r:
        outs = [ch["message"]["content"] for ch in json.load(r)["choices"]]
    def ex(t):
        tail = t.split("</think>")[-1]
        m = list(re.finditer(r"VERDICT\s*:\s*(accept|reject|route)", tail, re.I)) or \
            list(re.finditer(r"\b(accept|reject|route)\b", tail, re.I))
        return m[-1].group(1).lower() if m else None
    votes = [v for v in (ex(o) for o in outs) if v]
    cnt = Counter(votes)
    top, n_top = cnt.most_common(1)[0]
    return c["id"], top, n_top/len(votes), dict(cnt)

with ThreadPoolExecutor(max_workers=6) as ex:
    rows = list(ex.map(sample, blind))
res = {i:(d,ag,c) for i,d,ag,c in rows}
json.dump({i:{"decision":d,"agreement":round(ag,2),"votes":c} for i,(d,ag,c) in res.items()},
          open(D+"ljp_agreement.json","w"), ensure_ascii=False, indent=2)

base = sum(1 for i in key if res[i][0]==key[i])/len(key)
print(f"majority-vote accuracy (N={N}): {base:.0%}")
for thr in [1.0, 0.875, 0.75, 0.625]:
    auto = [i for i in key if res[i][1] >= thr]
    esc = [i for i in key if res[i][1] < thr]
    accA = sum(1 for i in auto if res[i][0]==key[i])/len(auto) if auto else 0
    esc_wrong = sum(1 for i in esc if res[i][0]!=key[i])
    print(f"  gate @agreement>={thr:.3f}: auto {len(auto)}/{len(key)} at {accA:.0%}; "
          f"escalate {len(esc)} ({esc_wrong} were model-wrong)")
print("DONE")
