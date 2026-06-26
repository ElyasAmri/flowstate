# Mine genuine hard Arabic-LJP cases with TWO frontier models (DeepSeek + GPT-5.5)
# over the full test set (minus the existing 50-case sample), using the fixed
# labeler. Saves all predictions and the union of genuine disagreements as the
# hard-case set, then scores both models on it.
import json, os, re, sys, urllib.request
import pyarrow.parquet as pq
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

D = "eval/data/"

def label(o):
    o = o or ""
    if re.search(r"عدم\s+ال?اختصاص|غير\s+مختص|لا\s+تختص", o): return "route"
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
def user(f):
    return LJP_SPEC + f"الوقائع:\n{f}\n\nThink in one short sentence, then a final line " \
           "exactly:\nVERDICT: accept | reject | route"

def post(base, key, model, prompt, reasoning):
    p = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    if reasoning: p["max_completion_tokens"] = 6000
    else: p["max_tokens"] = 1024; p["temperature"] = 0
    req = urllib.request.Request(base + "/chat/completions", data=json.dumps(p).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {key}"); req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)["choices"][0]["message"]["content"]

def verdict(t):
    tail = t.split("</think>")[-1]
    m = list(re.finditer(r"VERDICT\s*:\s*(accept|reject|route)", tail, re.I)) or \
        list(re.finditer(r"\b(accept|reject|route)\b", tail, re.I))
    return m[-1].group(1).lower() if m else "abstain"

MODELS = [
    ("deepseek", "https://api.deepseek.com", os.environ["DEEPSEEK_API_KEY"], "deepseek-chat", False),
    ("gpt-5.5", "https://api.openai.com/v1", os.environ["OPENAI_API_KEY"], "gpt-5.5", True),
]
rows = pq.read_table("datasets/arabic/Arabic-LJP/test.parquet").to_pylist()
already = set(json.load(open(D+"ljp_key.json")))
pool = [r for r in rows if r["id"] not in already and label(r["output"]) in ("accept","reject","route")]
print(f"pool: {len(pool)} cases")

preds = {}  # id -> {model: decision}
for name, base, key, model, reasoning in MODELS:
    def one(r):
        try: return r["id"], verdict(post(base, key, model, user(r["input"]), reasoning))
        except Exception: return r["id"], "abstain"
    with ThreadPoolExecutor(max_workers=8) as ex:
        for i, d in ex.map(one, pool):
            preds.setdefault(i, {})[name] = d
    acc = sum(1 for r in pool if preds[r["id"]].get(name) == label(r["output"])) / len(pool)
    print(f"{name}: {acc:.0%} over pool")

lab = {r["id"]: label(r["output"]) for r in pool}
hard = [r for r in pool if any(preds[r["id"]].get(m) not in (lab[r["id"]], "abstain")
                               for m in ("deepseek", "gpt-5.5"))]
print(f"\nhard cases (>=1 frontier model wrong, fixed labels): {len(hard)}")
json.dump([{"id": r["id"], "facts": r["input"]} for r in hard],
          open(D+"hard_blind.json", "w"), ensure_ascii=False, indent=2)
json.dump({r["id"]: lab[r["id"]] for r in hard}, open(D+"hard_key.json", "w"), ensure_ascii=False, indent=2)
json.dump({r["id"]: {**preds[r["id"]], "label": lab[r["id"]],
                     "ruling": r["output"][:200]} for r in hard},
          open(D+"hard_detail.json", "w"), ensure_ascii=False, indent=2)
for m in ("deepseek", "gpt-5.5"):
    acc = sum(1 for r in hard if preds[r["id"]].get(m) == lab[r["id"]]) / len(hard) if hard else 0
    print(f"  {m} on hard set: {acc:.0%}")
print("DONE")
