#!/usr/bin/env python3
"""Run both eval tracks against DeepSeek (deepseek-chat) via its OpenAI-compatible
API. Same blind inputs as Fanar/Claude; Arabic-LJP uses the FULL untruncated
facts (to match the fair head-to-head). Writes *_deepseek_out.json and scores
against the held-out keys.

Env: DEEPSEEK_API_KEY (required), DEEPSEEK_MODEL (default deepseek-chat).
"""
import json, os, re, sys, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(HERE, "data")
BASE = "https://api.deepseek.com"
KEY = os.environ["DEEPSEEK_API_KEY"]
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

def chat(prompt, mt=1024):
    body = json.dumps({"model": MODEL, "messages": [{"role": "user", "content": prompt}],
                       "max_tokens": mt, "temperature": 0}).encode()
    req = urllib.request.Request(BASE + "/chat/completions", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)["choices"][0]["message"]["content"]

def verdict(text, allowed):
    tail = text.split("</think>")[-1]
    m = list(re.finditer(r"VERDICT\s*:\s*([A-Za-z_]+)", tail, re.I))
    if m and m[-1].group(1).lower() in allowed:
        return m[-1].group(1).lower()
    m = list(re.finditer(r"\b(%s)\b" % "|".join(allowed), tail, re.I))
    return m[-1].group(1).lower() if m else allowed[0]

RTF_SPEC = (
    "You are the agent node in a Flowstate flow for municipal road-traffic fine "
    "management. Decide whether a case followed the ROUTINE process or is an "
    "EXCEPTION needing a human decision.\n\n"
    "ROUTINE (automatable): a fine is created; maybe sent + notification recorded; "
    "the offender pays; or if unpaid, a penalty is added and it is AUTOMATICALLY "
    "forwarded for credit collection (credit collection is ROUTINE, not an "
    "exception).\nEXCEPTION (non_routine): the case is contested/adjudicated (an appeal).\n\n")
def rtf_prompt(c):
    return (RTF_SPEC + f"Case history: {' -> '.join(c['case_history'])}\nAttributes: "
            f"{json.dumps(c['attrs'])}\n\nAnswer with one line exactly:\n"
            "VERDICT: routine | non_routine")

LJP_SPEC = (
    "You are an Arabic legal agent for a Saudi commercial court. Read the case "
    "facts (الوقائع) and predict the court's decision class:\n"
    "- accept: the court grants the claim (إلزام/بإلزام to pay or act)\n"
    "- reject: the court rejects the claim (رفض / عدم قبول / صرف النظر)\n"
    "- route: the court lacks jurisdiction (عدم اختصاص), route elsewhere\n"
    "Saudi commercial courts often reject on procedure/standing/jurisdiction or "
    "insufficient proof even when documents were submitted.\n\n")
def ljp_prompt(c):
    return (LJP_SPEC + f"الوقائع:\n{c['facts']}\n\nThink in one short sentence, then a "
            "final line exactly:\nVERDICT: accept | reject | route")

def run(infile, outfile, allowed, prompt_fn):
    cases = json.load(open(os.path.join(D, infile), encoding="utf-8"))
    def one(c):
        try:
            return {"id": c["id"], "decision": verdict(chat(prompt_fn(c)), allowed)}
        except Exception as e:
            return {"id": c["id"], "decision": allowed[0], "reason": f"ERR {e}"}
    with ThreadPoolExecutor(max_workers=8) as ex:
        out = list(ex.map(one, cases))
    json.dump(out, open(os.path.join(D, outfile), "w"), ensure_ascii=False, indent=2)
    return out

def score(out, keyfile, allowed, label):
    key = json.load(open(os.path.join(D, keyfile)))
    o = {x["id"]: x["decision"] for x in out}
    acc = sum(1 for i in key if o[i] == key[i]) / len(key)
    rec = {L: f"{sum(1 for i in key if key[i]==L and o[i]==L)}/{sum(1 for i in key if key[i]==L)}"
           for L in allowed}
    print(f"{label}: accuracy {acc:.0%}  recall {rec}")

if __name__ == "__main__":
    print(f"model: {MODEL}")
    rtf = run("sample_blind.json", "classify_deepseek_out.json", ["routine", "non_routine"], rtf_prompt)
    score(rtf, "sample_key.json", ["routine", "non_routine"], "RTF conformance")
    ljp = run("ljp_blind_full.json", "ljp_deepseek_out.json", ["accept", "reject", "route"], ljp_prompt)
    score(ljp, "ljp_key.json", ["accept", "reject", "route"], "Arabic-LJP (full facts)")
    print("DONE")
