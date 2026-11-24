import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tools.usage_report import Call, bucket, cost, load_calls, main  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def write_lines(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(r) + "\n" for r in records), encoding="utf-8")


def assistant(mid: str, model: str, ts: str = "2026-11-03T09:00:00Z") -> dict:
    usage = {"input_tokens": 1, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 1}
    return {"type": "assistant", "timestamp": ts, "message": {"id": mid, "model": model, "usage": usage}}


class LoadCalls(unittest.TestCase):
    def test_lines_sharing_a_message_id_are_one_call(self) -> None:
        calls = load_calls(FIXTURES / "session.jsonl")
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0], Call("claude-opus-5-5", 10, 1000, 100000, 500))
        self.assertEqual(calls[0].context, 101010)

    def test_a_model_with_no_price_is_counted_apart(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "s.jsonl"
            write_lines(path, [assistant("m1", "<synthetic>"), assistant("m2", "claude-haiku-5-5")])
            calls = load_calls(path)
            self.assertEqual([c.model for c in calls], ["claude-haiku-5-5"])
            self.assertEqual(calls.unpriced, 1)

    def test_since_skips_older_calls(self) -> None:
        calls = load_calls(FIXTURES / "session.jsonl", since="2026-11-04")
        self.assertEqual([c.model for c in calls], ["claude-sonnet-5-5"])


class Cost(unittest.TestCase):
    def test_an_opus_call_with_one_hour_cache_writes(self) -> None:
        c = cost(Call("claude-opus-5-5", 10, 1000, 100000, 500), 2.0)
        self.assertAlmostEqual(c.read, 0.02, places=7)
        self.assertAlmostEqual(c.write, 0.008, places=7)
        self.assertAlmostEqual(c.output, 0.01, places=7)
        self.assertAlmostEqual(c.input, 0.00004, places=7)
        self.assertAlmostEqual(c.total, 0.03804, places=7)

    def test_subagent_writes_use_the_five_minute_multiplier(self) -> None:
        c = cost(Call("claude-sonnet-5-5", 0, 1_000_000, 0, 0), 1.25)
        self.assertAlmostEqual(c.write, 2.5, places=7)

    def test_haiku_prices(self) -> None:
        c = cost(Call("claude-haiku-5-5", 1_000_000, 0, 1_000_000, 1_000_000), 2.0)
        self.assertAlmostEqual(c.input, 0.10, places=7)
        self.assertAlmostEqual(c.read, 0.01, places=7)
        self.assertAlmostEqual(c.output, 0.50, places=7)


class Bucket(unittest.TestCase):
    def test_buckets(self) -> None:
        self.assertEqual(bucket(0), "<50k")
        self.assertEqual(bucket(49_999), "<50k")
        self.assertEqual(bucket(50_000), "50-100k")
        self.assertEqual(bucket(101_010), "100-200k")
        self.assertEqual(bucket(200_000), "200-400k")
        self.assertEqual(bucket(400_000), ">400k")


class Report(unittest.TestCase):
    def test_one_block_per_session_and_a_total(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            sid = "abcd1234-0000-0000-0000-000000000000"
            shutil.copy(FIXTURES / "session.jsonl", root / f"{sid}.jsonl")
            (root / sid / "subagents").mkdir(parents=True)
            write_lines(root / sid / "subagents" / "agent-1.jsonl", [assistant("s1", "claude-sonnet-5-5")])
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = main([str(root)])
            self.assertEqual(code, 0)
            text = out.getvalue()
            self.assertIn("abcd1234", text)
            self.assertIn("subagents: 1 file", text)
            self.assertIn("TOTAL", text)

    def test_a_missing_folder_is_an_error(self) -> None:
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = main([str(Path(tempfile.gettempdir()) / "dp-no-such-transcripts-9c1e")])
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
