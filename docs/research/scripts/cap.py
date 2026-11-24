"""Rough what-if: main-session cache-read cost if context never exceeded CAP, paying a fresh base-context write per restart."""
import json, sys
from pathlib import Path
root = Path(sys.argv[1]); BASE = 60e3
for main in sorted(root.glob("*.jsonl")):
    seen=set(); rows=[]
    for line in main.open(encoding="utf-8"):
        try: r=json.loads(line)
        except: continue
        if r.get("type")!="assistant": continue
        m=r.get("message",{}); mid=m.get("id")
        if not mid or mid in seen or "opus" not in m.get("model",""): continue
        seen.add(mid); u=m.get("usage") or {}
        g=lambda k:(u.get(k,0) or 0)
        rows.append((g("input_tokens")+g("cache_creation_input_tokens")+g("cache_read_input_tokens"), g("cache_creation_input_tokens"), g("output_tokens"), g("input_tokens")))
    if len(rows)<20: continue
    actual=sum(c*5+ (t-c-i)*0.2 + o*20 + i*4 for t,c,o,i in rows)/1e6
    for cap in (150e3, 250e3):
        restarts=sum(max(0,t-BASE) for t,_,_,_ in rows)/len(rows)  # unused placeholder
        capped=sum(c*5 + (min(t,cap)-c-i if min(t,cap)>c+i else 0)*0.2 + o*20 + i*4 for t,c,o,i in rows)/1e6
        n_restart=len(rows)/30  # assume a /clear every ~30 calls
        capped+=n_restart*BASE*8/1e6  # 1h-TTL cache write of the base context, Opus 5.5
        print(f"{main.stem[:8]} cap {int(cap/1e3)}k: actual ${actual:.0f} -> ~${capped:.0f}  ({100*(1-capped/actual):.0f}% less)")
