"""Weight each API call by API list price (proxy for plan usage); bucket by context size."""
import json, sys
from pathlib import Path
from collections import defaultdict
P = {"opus": (4.0, 5.0, 0.20, 20.0), "sonnet": (2.0, 2.5, 0.10, 10.0), "haiku": (0.10, 0.125, 0.01, 0.50)}
def price(model):
    for k, v in P.items():
        if k in model: return v
    return None
def calls(path):
    seen = set()
    for line in path.open(encoding="utf-8"):
        try: r = json.loads(line)
        except: continue
        if r.get("type") != "assistant": continue
        m = r.get("message", {}); mid = m.get("id")
        if not mid or mid in seen: continue
        seen.add(mid); u = m.get("usage") or {}; p = price(m.get("model", ""))
        if not p: continue
        i, cw, cr, o = (u.get(k, 0) or 0 for k in ("input_tokens","cache_creation_input_tokens","cache_read_input_tokens","output_tokens"))
        yield i + cw + cr, (i*p[0] + cw*p[1] + cr*p[2] + o*p[3]) / 1e6, (cr*p[2])/1e6, (o*p[3])/1e6
root = Path(sys.argv[1])
B = [(0,50e3,"<50k"),(50e3,100e3,"50-100k"),(100e3,200e3,"100-200k"),(200e3,400e3,"200-400k"),(400e3,1e9,">400k")]
grand = defaultdict(float)
for main in sorted(root.glob("*.jsonl")):
    sid = main.stem; cs = list(calls(main))
    if len(cs) < 20: continue
    sub = []
    sd = root / sid / "subagents"
    if sd.exists():
        for s in sd.glob("*.jsonl"): sub += list(calls(s))
    tm = sum(c[1] for c in cs); ts = sum(c[1] for c in sub)
    print(f"=== {sid[:8]}  main ${tm:.0f}  subagents ${ts:.0f} ({100*ts/(tm+ts):.0f}% of session)")
    print(f"   main: re-reading context (cache reads) ${sum(c[2] for c in cs):.0f}, output+thinking ${sum(c[3] for c in cs):.0f}")
    for lo, hi, name in B:
        sel = [c for c in cs if lo <= c[0] < hi]
        if sel:
            v = sum(c[1] for c in sel); grand[name] += v
            print(f"   ctx {name:>9}: {len(sel):4d} calls  ${v:6.1f}  ({100*v/tm:3.0f}% of main)  ${v/len(sel):.3f}/call")
tot = sum(grand.values())
print("ALL MAIN SESSIONS by context size:", {k: f"{100*v/tot:.0f}%" for k, v in grand.items()}, f"total ${tot:.0f}")
