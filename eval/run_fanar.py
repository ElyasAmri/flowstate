#!/usr/bin/env python3
"""Run the two classification tracks against a live Fanar endpoint (the RunPod
vLLM OpenAI-compatible server), the same blind inputs the Claude run used.

Endpoint, model, and key come from the environment (with sensible defaults):
  FANAR_BASE_URL  default https://wiw9jdxx1zwtwv-8000.proxy.runpod.net/v1
  FANAR_MODEL     default: first model from {base}/models
  FANAR_API_KEY   default "EMPTY" (vLLM accepts any bearer unless configured)

Writes eval/data/classify_fanar_out.json and ljp_fanar_out.json in the same
shape as the Claude outputs, so eval/score.py can score them against the keys.
"""
import json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "data")
BASE = os.environ.get("FANAR_BASE_URL",
                      "https://wiw9jdxx1zwtwv-8000.proxy.runpod.net/v1").rstrip("/")
KEY = os.environ.get("FANAR_API_KEY", "EMPTY")

def http(path, payload=None):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Content-Type", "application/json")
    # RunPod's proxy/Cloudflare 403s the default python-urllib UA.
    req.add_header("User-Agent", "Mozilla/5.0 (flowstate-eval)")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def discover_model():
    m = os.environ.get("FANAR_MODEL")
    if m:
        return m
    data = http("/models")["data"]
    return data[0]["id"]

def chat(model, prompt):
    body = {"model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 512, "temperature": 0}
    return http("/chat/completions", body)["choices"][0]["message"]["content"]

def verdict(text, allowed):
    """Pull the label from a `VERDICT: <x>` line, else keyword-match."""
    m = re.search(r"VERDICT\s*:\s*([A-Za-z_]+)", text, re.I)
    cand = (m.group(1).lower() if m else "")
    if cand in allowed:
        return cand
    low = text.lower()
    for a in allowed:
        if a in low:
            return a
    return allowed[0]  # fallback to first label

# --- prompts (mirror the Claude agent prompts) --------------------------------
RTF_SPEC = (
    "You are the agent node in a Flowstate flow for municipal road-traffic fine "
    "management. Decide whether a case followed the ROUTINE process or is an "
    "EXCEPTION needing a human decision.\n\n"
    "ROUTINE (fully automatable): a fine is created (amount, article, points); "
    "it may be sent and a notification recorded; the offender pays and it closes; "
    "or, if unpaid, a penalty is added and it is AUTOMATICALLY forwarded for "
    "credit collection. Credit collection is ROUTINE, not an exception.\n"
    "EXCEPTION (non_routine): the case is contested/adjudicated (an appeal).\n\n")
def rtf_prompt(c):
    return (RTF_SPEC + f"Case history: {' -> '.join(c['case_history'])}\n"
            f"Attributes: {json.dumps(c['attrs'])}\n\n"
            "Answer with one line exactly:\n  VERDICT: routine\n  or\n  VERDICT: non_routine")

LJP_SPEC = (
    "You are an Arabic legal agent for a Saudi commercial court. Read the case "
    "facts (الوقائع) and predict the court's decision class:\n"
    "- accept: the court grants the claim (إلزام/بإلزام to pay or act)\n"
    "- reject: the court rejects the claim (رفض / عدم قبول / صرف النظر)\n"
    "- route: the court lacks jurisdiction (عدم اختصاص), route elsewhere\n\n")
def ljp_prompt(c):
    return (LJP_SPEC + f"الوقائع:\n{c['facts']}\n\n"
            "Answer with one line exactly:\n  VERDICT: accept | reject | route")

def run_track(infile, outfile, allowed, prompt_fn, model):
    cases = json.load(open(os.path.join(D, infile), encoding="utf-8"))
    def one(c):
        try:
            txt = chat(model, prompt_fn(c))
            return {"id": c["id"], "decision": verdict(txt, allowed),
                    "reason": txt.strip().replace("\n", " ")[:160]}
        except Exception as e:
            return {"id": c["id"], "decision": allowed[0], "reason": f"ERROR {e}"}
    with ThreadPoolExecutor(max_workers=6) as ex:
        out = list(ex.map(one, cases))
    json.dump(out, open(os.path.join(D, outfile), "w"),
              ensure_ascii=False, indent=2)
    from collections import Counter
    print(f"{outfile}: {len(out)} cases, {dict(Counter(o['decision'] for o in out))}")

def main():
    model = discover_model()
    print(f"endpoint: {BASE}\nmodel: {model}\n")
    run_track("sample_blind.json", "classify_fanar_out.json",
              ["routine", "non_routine"], rtf_prompt, model)
    run_track("ljp_blind.json", "ljp_fanar_out.json",
              ["accept", "reject", "route"], ljp_prompt, model)

if __name__ == "__main__":
    main()
