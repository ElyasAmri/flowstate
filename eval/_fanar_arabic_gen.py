# Test 1: Arabic generation/parsing (Fanar's strength). For a few Saudi-court
# cases: (a) parse the Arabic facts into structured fields, (b) draft a short
# Arabic citizen-facing decision letter for the true outcome. Qualitative.
import json, sys, urllib.request
sys.path.insert(0, "eval"); import run_fanar as rf
D = "eval/data/"; model = rf.discover_model()
cases = json.load(open(D+"ljp_blind.json", encoding="utf-8"))
key = json.load(open(D+"ljp_key.json"))
sample = cases[:3] + cases[20:22]  # a few accept + reject

def call(p, mt=7000):
    body = json.dumps({"model": model, "messages":[{"role":"user","content":p}],
                       "max_tokens": mt, "temperature":0}).encode()
    req = urllib.request.Request(rf.BASE+"/chat/completions", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {rf.KEY}"); req.add_header("Content-Type","application/json")
    req.add_header("User-Agent","Mozilla/5.0 (flowstate-eval)")
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)["choices"][0]["message"]["content"].strip()

OUT_AR = {"accept": "قبول الدعوى وإلزام المدعى عليه", "reject": "رفض الدعوى",
          "route": "عدم الاختصاص وإحالة الدعوى"}
res = []
for c in sample:
    parse = call("استخرج من وقائع القضية التالية حقولاً بصيغة JSON فقط: "
                 "{المدعي, المدعى عليه, نوع الدعوى, المبلغ, أبرز الأدلة}.\n\n" + c["facts"])
    outcome = OUT_AR.get(key[c["id"]], "قرار")
    letter = call("اكتب خطاباً رسمياً قصيراً وباللغة العربية يبلغ المدعي بنتيجة دعواه. "
                  f"النتيجة: {outcome}. اجعله مهذباً وواضحاً ولا تتجاوز خمس جمل. أعد نص الخطاب فقط.")
    res.append({"id": c["id"], "true": key[c["id"]], "parsed": parse, "letter": letter})
    print(f"=== {c['id']} (true={key[c['id']]}) ===")
    print("PARSED:\n", parse[:500])
    print("LETTER:\n", letter[:700])
    print()
json.dump(res, open(D+"fanar_arabic_gen.json","w"), ensure_ascii=False, indent=2)
print("DONE")
