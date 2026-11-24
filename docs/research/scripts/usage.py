"""Summarise token usage per Claude Code session transcript (main + subagents)."""

import json
import sys
from collections import Counter
from pathlib import Path

root = Path(sys.argv[1])


def scan(path: Path) -> dict:
    seen = set()
    tot = Counter()
    models = Counter()
    ctx = []
    skills = Counter()
    agents = Counter()
    compacts = 0
    first = last = None
    user_prompts = 0
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = rec.get("timestamp")
            if ts:
                first = first or ts
                last = ts
            if rec.get("isCompactSummary") or rec.get("type") == "summary":
                compacts += 1
            if rec.get("type") == "user" and not rec.get("isMeta"):
                content = rec.get("message", {}).get("content")
                if isinstance(content, str) and not content.startswith("<"):
                    user_prompts += 1
                elif isinstance(content, list) and any(
                    c.get("type") == "text" for c in content if isinstance(c, dict)
                ):
                    user_prompts += 1
            if rec.get("type") != "assistant":
                continue
            msg = rec.get("message", {})
            for c in msg.get("content", []) or []:
                if isinstance(c, dict) and c.get("type") == "tool_use":
                    if c.get("name") == "Skill":
                        skills[c.get("input", {}).get("skill", "?")] += 1
                    if c.get("name") in ("Agent", "Task"):
                        agents[c.get("input", {}).get("subagent_type", "general")] += 1
            mid = msg.get("id")
            if not mid or mid in seen:
                continue
            seen.add(mid)
            u = msg.get("usage") or {}
            models[msg.get("model", "?")] += 1
            for k in (
                "input_tokens",
                "cache_creation_input_tokens",
                "cache_read_input_tokens",
                "output_tokens",
            ):
                tot[k] += u.get(k, 0) or 0
            ctx.append(
                (u.get("input_tokens", 0) or 0)
                + (u.get("cache_creation_input_tokens", 0) or 0)
                + (u.get("cache_read_input_tokens", 0) or 0)
            )
    return {
        "calls": len(seen),
        "tot": tot,
        "models": models,
        "ctx_avg": sum(ctx) / len(ctx) if ctx else 0,
        "ctx_max": max(ctx) if ctx else 0,
        "skills": skills,
        "agents": agents,
        "compacts": compacts,
        "first": first,
        "last": last,
        "prompts": user_prompts,
    }


def fmt(n: float) -> str:
    return f"{n / 1e6:.2f}M" if n >= 1e6 else f"{n / 1e3:.0f}k"


for main in sorted(root.glob("*.jsonl")):
    sid = main.stem
    m = scan(main)
    subs = list((root / sid / "subagents").glob("*.jsonl")) if (root / sid).exists() else []
    sub_tot = Counter()
    sub_calls = 0
    sub_models = Counter()
    for s in subs:
        r = scan(s)
        sub_tot.update(r["tot"])
        sub_calls += r["calls"]
        sub_models.update(r["models"])
    print(f"=== {sid[:8]}  {m['first']} -> {m['last']}")
    print(f"  user prompts~{m['prompts']}  main API calls {m['calls']}  compactions {m['compacts']}")
    t = m["tot"]
    print(
        f"  MAIN  in {fmt(t['input_tokens'])}  cache_write {fmt(t['cache_creation_input_tokens'])}"
        f"  cache_read {fmt(t['cache_read_input_tokens'])}  out {fmt(t['output_tokens'])}"
        f"  ctx avg {fmt(m['ctx_avg'])} max {fmt(m['ctx_max'])}"
    )
    print(f"  models {dict(m['models'])}")
    t = sub_tot
    print(
        f"  SUBAGENTS x{len(subs)} calls {sub_calls}  in {fmt(t['input_tokens'])}"
        f"  cache_write {fmt(t['cache_creation_input_tokens'])}"
        f"  cache_read {fmt(t['cache_read_input_tokens'])}  out {fmt(t['output_tokens'])}"
    )
    print(f"  sub models {dict(sub_models)}")
    print(f"  skills {dict(m['skills'])}")
    print(f"  agents {dict(m['agents'])}")
