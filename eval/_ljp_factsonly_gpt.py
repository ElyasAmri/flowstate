import json, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "eval"); import run_openai as oa
D = "eval/data/"
cases = json.load(open(D+"ljp_factsonly.json", encoding="utf-8"))
key = json.load(open(D+"ljp_key.json"))
def one(c):
    try: return {"id": c["id"], "decision": oa.verdict(oa.chat(oa.ljp_prompt(c)), ["accept","reject","route"])}
    except Exception as e: return {"id": c["id"], "decision": "accept", "err": str(e)}
with ThreadPoolExecutor(max_workers=6) as ex:
    out = list(ex.map(one, cases))
json.dump(out, open(D+"ljp_factsonly_openai_out.json","w"), ensure_ascii=False, indent=2)
o = {x["id"]: x["decision"] for x in out}
acc = sum(1 for i in key if o[i]==key[i])/len(key)
print(f"{oa.MODEL} FACTS-ONLY: {acc:.0%}")
print("errors:", dict(Counter(f"{key[i]}->{o[i]}" for i in key if o[i]!=key[i])))
for L in ["accept","reject","route"]:
    print(f"  {L}: {sum(1 for i in key if key[i]==L and o[i]==L)}/{sum(1 for i in key if key[i]==L)}")
print("DONE")
