# Mine genuine hard Arabic-LJP cases: run a frontier model (DeepSeek) over the
# WHOLE test set with corrected labels, collect disagreements (candidate hard
# cases) with the actual ruling for verification. Excludes cases already in the
# 50-case sample so we find NEW edge cases.
import json, os, re, sys, urllib.request
import pyarrow.parquet as pq
from concurrent.futures import ThreadPoolExecutor

D = "eval/data/"
KEY = os.environ["DEEPSEEK_API_KEY"]; MODEL = "deepseek-chat"
BASE = "https://api.deepseek.com"

def label(o):  # corrected labeler (accept/obligation wins over partial-reject)
    o = o or ""
    if "عدم اختصاص" in o or "غير مختصة" in o: return "route"
    if "بإلزام" in o or "إلزام" in o or "الزام" in o or "بقبول" in o: return "accept"
    if "رفض" in o or "عدم قبول" in o or "صرف النظر" in o: return "reject"
    return "other"

LJP_SPEC = (
    "You are an Arabic legal agent for a Saudi commercial court. Read the case "
    "facts (الوقائع) and predict the court's decision class:\n"
    "- accept: the court grants the claim (إلزام/بإلزام to pay or act)\n"
    "- reject: the court rejects the claim (رفض / عدم قبول / صرف النظر)\n"
    "- route: the court lacks jurisdiction (عدم اختصاص), route elsewhere\n"
    "Saudi commercial courts often reject on procedure/standing/jurisdiction or "
    "insufficient proof even when documents were submitted.\n\n")

def chat(p):
    body = json.dumps({"model": MODEL, "messages":[{"role":"user","content":p}],
                       "max_tokens":1024, "temperature":0}).encode()
    req = urllib.request.Request(BASE+"/chat/completions", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {KEY}"); req.add_header("Content-Type","application/json")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["choices"][0]["message"]["content"]

def predict(facts):
    t = chat(LJP_SPEC + f"الوقائع:\n{facts}\n\nThink in one short sentence, then a final "
             "line exactly:\nVERDICT: accept | reject | route")
    tail = t.split("</think>")[-1]
    m = list(re.finditer(r"VERDICT\s*:\s*(accept|reject|route)", tail, re.I)) or \
        list(re.finditer(r"\b(accept|reject|route)\b", tail, re.I))
    return m[-1].group(1).lower() if m else "abstain"

rows = pq.read_table("datasets/arabic/Arabic-LJP/test.parquet").to_pylist()
already = set(json.load(open(D+"ljp_key.json")))
pool = [r for r in rows if r["id"] not in already and label(r["output"]) in ("accept","reject","route")]
print(f"mining {len(pool)} confidently-labeled cases not in the existing sample")

def one(r):
    try: return (r, predict(r["input"]))
    except Exception: return (r, "abstain")

with ThreadPoolExecutor(max_workers=10) as ex:
    res = list(ex.map(one, pool))

disag = [(r, p) for r, p in res if p != "abstain" and p != label(r["output"])]
print(f"DeepSeek disagreements (candidate hard cases): {len(disag)} / {len(pool)}")
out = []
for r, p in disag:
    out.append({"id": r["id"], "label": label(r["output"]), "deepseek": p,
                "ruling": r["output"][:240], "facts_tail": r["input"][-300:]})
json.dump(out, open(D+"hard_candidates.json","w"), ensure_ascii=False, indent=2)
from collections import Counter
print("disagreement types:", dict(Counter(f"{label(r['output'])}->{p}" for r,p in disag)))
print("DONE")
