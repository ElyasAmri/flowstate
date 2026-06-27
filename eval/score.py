#!/usr/bin/env python3
"""Score the model-in-the-loop classifications against the held-out keys.
Scoring is done here (not by the model) to keep it honest."""
import json, os, sys
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


def coru_track(track, predf, keyf):
    """CORU receipt-claims multiclass scoring with escalation safety metrics.

    Reports verdict accuracy (all verdict strings), PLUS:
    - false-auto-approve rate: non-approvable case (ESCALATE_* or REJECTED_*)
      predicted as APPROVED — the critical safety number (must be ~0).
    - escalation recall: of all ESCALATE_* cases, fraction correctly routed to
      the human gate (any ESCALATE_* prediction counts as a hit).
    """
    sys.path.insert(0, HERE)
    from policy import ESCALATE_VERDICTS, REJECTED_VERDICTS, APPROVED as _APPROVED

    preds = load(predf)
    key   = load(keyf)
    n     = len(preds)
    correct = sum(1 for p in preds if p["decision"] == key[p["id"]])
    acc = correct / n if n else 0.0

    # False-auto-approve: should have been stopped but was let through as APPROVED
    non_approvable = ESCALATE_VERDICTS | REJECTED_VERDICTS
    false_autos = [
        p for p in preds
        if key[p["id"]] in non_approvable and p["decision"] == _APPROVED
    ]
    faa_rate = len(false_autos) / n if n else 0.0

    # Escalation recall: human-gate cases that reached the human gate
    should_esc = [p for p in preds if key[p["id"]] in ESCALATE_VERDICTS]
    esc_hits   = [p for p in should_esc if p["decision"] in ESCALATE_VERDICTS]
    esc_recall = len(esc_hits) / len(should_esc) if should_esc else 0.0

    labels = sorted(set(key.values()))
    print(f"\n=== {track} (multiclass) ===")
    print(f"n={n}  accuracy={acc:.1%}")
    print(f"\n  *** FALSE-AUTO-APPROVE RATE: {faa_rate:.1%} "
          f"({len(false_autos)}/{n}) — target ~0 ***")
    print(f"  escalation recall: {esc_recall:.1%} "
          f"({len(esc_hits)}/{len(should_esc)} human-gate cases correctly routed)")
    if false_autos:
        print("  false approvals: " +
              ", ".join(f"{p['id']}({key[p['id']]})" for p in false_autos[:10]))

    per = {}
    for L in labels:
        tp   = sum(1 for p in preds if p["decision"] == L and key[p["id"]] == L)
        fp   = sum(1 for p in preds if p["decision"] == L and key[p["id"]] != L)
        fn   = sum(1 for p in preds if p["decision"] != L and key[p["id"]] == L)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec  = tp / (tp + fn) if tp + fn else 0.0
        f1   = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        per[L] = {"precision": prec, "recall": rec, "f1": f1,
                  "support": sum(1 for v in key.values() if v == L)}
        print(f"  {L:35s} prec={prec:.1%} rec={rec:.1%} f1={f1:.1%} "
              f"support={per[L]['support']}")

    errs = [(p["id"], key[p["id"]], p["decision"])
            for p in preds if p["decision"] != key[p["id"]]]
    print(f"  misclassified ({len(errs)}): " +
          ", ".join(f"{y}->{yh}" for i, y, yh in errs[:20]))

    return {
        "track": track, "n": n, "accuracy": acc,
        "false_auto_approve_rate":  faa_rate,
        "false_auto_approve_count": len(false_autos),
        "escalation_recall": esc_recall,
        "per_class": per, "errors": errs,
    }


if __name__=="__main__":
    out={}
    out["rtf"]=binary("Road-Traffic Fines: routine vs non-routine",
                      "classify_out.json","sample_key.json","non_routine")
    out["ljp"]=multiclass("Arabic-LJP: accept/reject/route",
                          "ljp_out.json","ljp_key.json")

    # CORU track — skipped gracefully if predictions have not been generated yet
    _coru_out = os.path.join(D, "coru_out.json")
    _coru_key = os.path.join(D, "coru_key.json")
    if os.path.exists(_coru_out) and os.path.exists(_coru_key):
        out["coru"] = coru_track(
            "CORU Receipt Claims: verdict multiclass",
            "coru_out.json", "coru_key.json",
        )
    else:
        print("\n=== CORU Receipt Claims ===")
        print("  (pending — run parse_coru.py, then generate coru_out.json "
              "with the agent node, then re-run score.py)")

    json.dump(out, open(os.path.join(D,"scores.json"),"w"),
              ensure_ascii=False, indent=2, default=str)
    print("\nwrote scores.json")
