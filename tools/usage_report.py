"""Usage per Claude Code session, weighted by API list price.

Anthropic does not publish how the Pro plan weights tokens, so list prices stand in for usage.
Run: python tools/usage_report.py <transcripts_dir> [--since YYYY-MM-DD]

<transcripts_dir> is a project folder under ~/.claude/projects/. Each <session>.jsonl there is a
main session; its subagents are in <session>/subagents/*.jsonl.
"""

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

PRICES_DATED = "2026-11-03"
# $ per million tokens: input, output, cache read. Matched by substring of the model id.
PRICES = {
    "opus": (4.00, 20.00, 0.20),
    "sonnet": (2.00, 10.00, 0.10),
    "haiku": (0.10, 0.50, 0.01),
}
# Cache writes cost this multiple of input: main sessions use the 1-hour cache, subagents 5 minutes.
MAIN_WRITE = 2.0
SUBAGENT_WRITE = 1.25

BUCKETS = [(50_000, "<50k"), (100_000, "50-100k"), (200_000, "100-200k"), (400_000, "200-400k")]
BUCKET_NAMES = [name for _, name in BUCKETS] + [">400k"]


@dataclass(frozen=True)
class Call:
    model: str
    input: int
    cache_write: int
    cache_read: int
    output: int

    @property
    def context(self) -> int:
        return self.input + self.cache_write + self.cache_read


@dataclass(frozen=True)
class Cost:
    input: float
    write: float
    read: float
    output: float

    @property
    def total(self) -> float:
        return self.input + self.write + self.read + self.output

    def __add__(self, other: "Cost") -> "Cost":
        return Cost(self.input + other.input, self.write + other.write, self.read + other.read, self.output + other.output)


ZERO = Cost(0.0, 0.0, 0.0, 0.0)


class Calls(list[Call]):
    """The priced calls of one transcript, plus how many calls had no price."""

    unpriced: int = 0


def price(model: str) -> tuple[float, float, float] | None:
    for key, value in PRICES.items():
        if key in model:
            return value
    return None


def load_calls(path: Path, since: str | None = None) -> Calls:
    """One Call per distinct message id; streamed chunks of one message repeat its id."""
    calls = Calls()
    seen: set[str] = set()
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(rec, dict) or rec.get("type") != "assistant":
                continue
            if since and str(rec.get("timestamp", ""))[:10] < since:
                continue
            msg = rec.get("message") or {}
            mid = msg.get("id")
            if not mid or mid in seen:
                continue
            seen.add(mid)
            model = str(msg.get("model", ""))
            if price(model) is None:
                calls.unpriced += 1
                continue
            u = msg.get("usage") or {}
            calls.append(
                Call(
                    model,
                    u.get("input_tokens") or 0,
                    u.get("cache_creation_input_tokens") or 0,
                    u.get("cache_read_input_tokens") or 0,
                    u.get("output_tokens") or 0,
                )
            )
    return calls


def cost(call: Call, write_multiplier: float) -> Cost:
    p = price(call.model)
    if p is None:
        raise ValueError(f"no price for {call.model}")
    inp, out, read = (x / 1e6 for x in p)
    return Cost(call.input * inp, call.cache_write * inp * write_multiplier, call.cache_read * read, call.output * out)


def bucket(context: int) -> str:
    for upper, name in BUCKETS:
        if context < upper:
            return name
    return ">400k"


def tokens(n: float) -> str:
    return f"{n / 1e6:.2f}M" if n >= 1e6 else f"{n / 1e3:.0f}k"


def split(c: Cost) -> str:
    if c.total == 0:
        return "no usage"
    pct = lambda v: f"{100 * v / c.total:.0f}%"  # noqa: E731
    return f"re-reading {pct(c.read)}, writing {pct(c.write + c.input)}, output {pct(c.output)}"


def first_and_last(path: Path) -> tuple[str, str]:
    first = last = ""
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                ts = json.loads(line).get("timestamp")
            except (json.JSONDecodeError, AttributeError):
                continue
            if ts:
                first = first or ts
                last = ts
    return first, last


def report(root: Path, since: str | None) -> None:
    grand_main = grand_sub = ZERO
    grand_buckets: Counter[str] = Counter()
    sessions = 0
    for main_file in sorted(root.glob("*.jsonl")):
        calls = load_calls(main_file, since)
        sub_files = sorted((root / main_file.stem / "subagents").glob("*.jsonl"))
        sub_calls = [c for f in sub_files for c in load_calls(f, since)]
        if not calls and not sub_calls:
            continue
        sessions += 1
        main_cost = sum((cost(c, MAIN_WRITE) for c in calls), ZERO)
        sub_cost = sum((cost(c, SUBAGENT_WRITE) for c in sub_calls), ZERO)
        by_bucket: Counter[str] = Counter()
        for c in calls:
            by_bucket[bucket(c.context)] += cost(c, MAIN_WRITE).total
        contexts = [c.context for c in calls] or [0]
        models = Counter(c.model for c in calls)
        first, last = first_and_last(main_file)

        print(f"=== {main_file.stem[:8]}  {first} -> {last}")
        print(
            f"  main: {len(calls)} calls, ${main_cost.total:.2f} ({split(main_cost)}); "
            f"context avg {tokens(sum(contexts) / len(contexts))}, max {tokens(max(contexts))}"
        )
        if main_cost.total:
            parts = [f"{n} {100 * by_bucket[n] / main_cost.total:.0f}%" for n in BUCKET_NAMES if by_bucket[n]]
            print(f"  main by context: {', '.join(parts)}")
        print(f"  models: {dict(models)}")
        plural = "" if len(sub_files) == 1 else "s"
        share = 100 * sub_cost.total / (main_cost.total + sub_cost.total) if (main_cost.total + sub_cost.total) else 0
        print(f"  subagents: {len(sub_files)} file{plural}, {len(sub_calls)} calls, ${sub_cost.total:.2f} ({share:.0f}% of session)")
        unpriced = calls.unpriced + sum(load_calls(f, since).unpriced for f in sub_files)
        if unpriced:
            print(f"  unpriced calls: {unpriced}")
        grand_main += main_cost
        grand_sub += sub_cost
        grand_buckets.update(by_bucket)

    print(f"TOTAL {sessions} sessions: main ${grand_main.total:.2f} ({split(grand_main)}), subagents ${grand_sub.total:.2f}")
    if grand_main.total:
        parts = [f"{n} {100 * grand_buckets[n] / grand_main.total:.0f}%" for n in BUCKET_NAMES if grand_buckets[n]]
        print(f"  main by context: {', '.join(parts)}")
    print(f"  prices as of {PRICES_DATED}; cache writes x{MAIN_WRITE} main, x{SUBAGENT_WRITE} subagents")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Usage per Claude Code session, weighted by API list price.")
    parser.add_argument("transcripts_dir", type=Path)
    parser.add_argument("--since", help="only calls on or after this date, YYYY-MM-DD")
    args = parser.parse_args(argv)
    if not args.transcripts_dir.is_dir():
        print(f"not a folder: {args.transcripts_dir}", file=sys.stderr)
        return 2
    report(args.transcripts_dir, args.since)
    return 0


if __name__ == "__main__":
    sys.exit(main())
