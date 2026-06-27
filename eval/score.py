#!/usr/bin/env python3
"""Score the model-in-the-loop classifications against the held-out keys.
Scoring is done here (not by the model) to keep it honest."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "data")

def load(n): return json.load(open(os.path.join(D, n), encoding="utf-8"))

def metrics(preds, key, positive):
    tp=fp=tn=fn=0
    rows=[]
    for p in preds:
        y = key[p["id"]]; yh = p["decision"]
        ok = (y==yh)
        if yh==positive and y==positive: tp+=1
        elif yh==positive and y!=positive: fp+=1
        elif yh!=positive and y!=positive: tn+=1
        else: fn+=1
        if not ok: rows.append((p["id"], y, yh, p.get("reason","")[:80]))
    n=len(preds); acc=(tp+tn)/n if positive else None
    return tp,fp,tn,fn,rows,n

def binary(track, predf, keyf, positive):
    preds=load(predf); key=load(keyf)
    correct=sum(1 for p in preds if p["decision"]==key[p["id"]])
    n=len(preds); acc=correct/n
    tp=sum(1 for p in preds if p["decision"]==positive and key[p["id"]]==positive)
    fp=sum(1 for p in preds if p["decision"]==positive and key[p["id"]]!=positive)
    fn=sum(1 for p in preds if p["decision"]!=positive and key[p["id"]]==positive)
    prec=tp/(tp+fp) if tp+fp else 0
    rec=tp/(tp+fn) if tp+fn else 0
    f1=2*prec*rec/(prec+rec) if prec+rec else 0
    print(f"\n=== {track} (positive='{positive}') ===")
    print(f"n={n}  accuracy={acc:.1%}  precision={prec:.1%}  recall={rec:.1%}  F1={f1:.1%}")
    print(f"  TP={tp} FP={fp} FN={fn}")
    errs=[(p['id'],key[p['id']],p['decision']) for p in preds if p['decision']!=key[p['id']]]
    print(f"  misclassified ({len(errs)}): " + ", ".join(f"{i}:{y}->{yh}" for i,y,yh in errs[:12]))
    return {"track":track,"n":n,"accuracy":acc,"precision":prec,"recall":rec,"f1":f1,
            "tp":tp,"fp":fp,"fn":fn,"errors":errs}

def multiclass(track, predf, keyf):
    preds=load(predf); key=load(keyf)
    n=len(preds); correct=sum(1 for p in preds if p["decision"]==key[p["id"]])
    acc=correct/n
    labels=sorted(set(key.values()))
    print(f"\n=== {track} (multiclass) ===")
    print(f"n={n}  accuracy={acc:.1%}")
    per={}
    for L in labels:
        tp=sum(1 for p in preds if p["decision"]==L and key[p["id"]]==L)
        fp=sum(1 for p in preds if p["decision"]==L and key[p["id"]]!=L)
        fn=sum(1 for p in preds if p["decision"]!=L and key[p["id"]]==L)
        prec=tp/(tp+fp) if tp+fp else 0; rec=tp/(tp+fn) if tp+fn else 0
        f1=2*prec*rec/(prec+rec) if prec+rec else 0
        per[L]={"precision":prec,"recall":rec,"f1":f1,"support":sum(1 for v in key.values() if v==L)}
        print(f"  {L:8} prec={prec:.1%} rec={rec:.1%} f1={f1:.1%} support={per[L]['support']}")
    errs=[(p['id'],key[p['id']],p['decision']) for p in preds if p['decision']!=key[p['id']]]
    print(f"  misclassified ({len(errs)}): " + ", ".join(f"{y}->{yh}" for i,y,yh in errs[:20]))
    return {"track":track,"n":n,"accuracy":acc,"per_class":per,"errors":errs}

def have(n): return os.path.exists(os.path.join(D, n))

if __name__=="__main__":
    out={}
    out["rtf"]=binary("Road-Traffic Fines: routine vs non-routine [Claude]",
                      "classify_out.json","sample_key.json","non_routine")
    out["ljp"]=multiclass("Arabic-LJP: accept/reject/route [Claude]",
                          "ljp_out.json","ljp_key.json")
    if have("classify_fanar_out.json"):
        out["rtf_fanar"]=binary("Road-Traffic Fines: routine vs non-routine [Fanar]",
                          "classify_fanar_out.json","sample_key.json","non_routine")
    if have("ljp_fanar_out.json"):
        out["ljp_fanar"]=multiclass("Arabic-LJP: accept/reject/route [Fanar]",
                          "ljp_fanar_out.json","ljp_key.json")
    json.dump(out, open(os.path.join(D,"scores.json"),"w"),
              ensure_ascii=False, indent=2, default=str)
    print("\nwrote scores.json")
