# Exhaustive lever sweep for Fanar on Arabic-LJP (the task with room to improve).
# Configs: baseline brief-reasoning, few-shot, full(untruncated) facts,
# self-consistency (n samples + majority vote), and the best-of combo.
# Robust verdict extraction: take the LAST verdict signal; unparsed -> "abstain"
# (counted wrong, NOT defaulted to accept, so no bias).
import json, sys, re, urllib.request
import pyarrow.parquet as pq
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "eval"); import run_fanar as rf
D = "eval/data/"; model = rf.discover_model()

blind = json.load(open(D+"ljp_blind.json", encoding="utf-8"))
key = json.load(open(D+"ljp_key.json"))
fs = json.load(open(D+"ljp_fewshot.json", encoding="utf-8"))
# full untruncated facts, by id, from the test parquet
full = {r["id"]: r["input"] for r in pq.read_table(
        "datasets/arabic/Arabic-LJP/test.parquet").to_pylist()}

def post(messages, mt=1200, temp=0, n=1):
    body = {"model": model, "messages": messages, "max_tokens": mt, "temperature": temp}
    if n > 1: body["n"] = n
    req = urllib.request.Request(rf.BASE+"/chat/completions",
            data=json.dumps(body).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {rf.KEY}")
    req.add_header("Content-Type","application/json")
    req.add_header("User-Agent","Mozilla/5.0")
    with urllib.request.urlopen(req, timeout=300) as r:
        return [c["message"]["content"] for c in json.load(r)["choices"]]

def extract(text):
    # prefer an explicit final VERDICT line; else the last keyword after </think>
    tail = text.split("</think>")[-1]
    m = list(re.finditer(r"VERDICT\s*:\s*(accept|reject|route)", tail, re.I))
    if m: return m[-1].group(1).lower()
    m = list(re.finditer(r"\b(accept|reject|route)\b", tail, re.I))
    if m: return m[-1].group(1).lower()
    return "abstain"

INSTR = ("\n\nThink in one short sentence, then end with a line exactly:\n"
         "VERDICT: accept | reject | route")
def fewshot_block():
    b = "Examples:\n"
    for k in ["accept","reject","route"]:
        b += f"الوقائع: {fs[k]['facts'][:400]}\nVERDICT: {k}\n\n"
    return b

def build(cfg, c, facts):
    sys_proc = ("Saudi commercial courts often reject on procedure/standing/jurisdiction "
                "or insufficient proof even when documents are submitted.")
    user = rf.LJP_SPEC
    if cfg.get("procedural"): user += sys_proc + "\n\n"
    if cfg.get("fewshot"): user += fewshot_block()
    user += f"الوقائع:\n{facts}{INSTR}"
    return [{"role":"user","content":user}]

def run(cfg):
    def one(c):
        facts = full.get(c["id"], c["facts"]) if cfg.get("full") else c["facts"]
        msgs = build(cfg, c, facts)
        try:
            outs = post(msgs, mt=cfg.get("mt",1200), temp=cfg.get("temp",0), n=cfg.get("n",1))
            votes = [extract(o) for o in outs]
            votes = [v for v in votes if v != "abstain"] or ["abstain"]
            return c["id"], Counter(votes).most_common(1)[0][0]
        except Exception as e:
            return c["id"], "abstain"
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = dict(ex.map(one, blind))
    acc = sum(1 for i in key if res[i]==key[i])/len(key)
    errs = Counter(f"{key[i]}->{res[i]}" for i in key if res[i]!=key[i])
    rec = {L: f"{sum(1 for i in key if key[i]==L and res[i]==L)}/{sum(1 for i in key if key[i]==L)}"
           for L in ["accept","reject","route"]}
    return acc, dict(errs), rec, res

CONFIGS = {
    "baseline (brief reasoning)":        {},
    "few-shot":                          {"fewshot": True},
    "full untruncated facts":            {"full": True},
    "self-consistency (n=5, t=0.6)":     {"n":5, "temp":0.6, "mt":1400},
    "combo: few-shot+full+self-consist": {"fewshot":True, "full":True, "n":5, "temp":0.6, "mt":1600},
}
results = {}
for name, cfg in CONFIGS.items():
    acc, errs, rec, res = run(cfg)
    results[name] = {"accuracy": round(acc,3), "recall": rec, "errors": errs}
    print(f"{acc:.0%}  {name}")
    print(f"      recall {rec}  errors {errs}")
json.dump(results, open(D+"ljp_sweep.json","w"), ensure_ascii=False, indent=2)
print("\nbaseline-to-best:", f"{min(r['accuracy'] for r in results.values()):.0%} -> {max(r['accuracy'] for r in results.values()):.0%}")
print("DONE")
