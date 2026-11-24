import { test } from "node:test";
import assert from "node:assert/strict";
import { compileGlob } from "../hooks/lib/glob.mjs";

const cases = [
  ["*.py", "a/b/c.py", undefined, true],
  ["*.py", "a/b/c.pyc", undefined, false],
  ["/results/**", "results/run-1.json", undefined, true],
  ["/results/**", "results", undefined, true],
  ["/results/**", "data/results/x.json", undefined, false],
  ["results/**", "results/x", undefined, true],
  ["tests/**", "tests/unit/test_a.py", undefined, true],
  ["**/*.py", "x.py", undefined, true],
  ["data/test.lock", "data/test.lock", undefined, true],
  ["data/test.lock", "data/test.lockx", undefined, false],
  ["pyproject.toml", "sub/pyproject.toml", undefined, true],
  ["src/*.ts", "src/a/b.ts", undefined, false],
  ["/Results/**", "results/a", { caseInsensitive: true }, true],
  ["/Results/**", "results/a", { caseInsensitive: false }, false],
  // Beyond the plan's table: the other gitignore forms the hooks will meet.
  ["./data/test.lock", "data/test.lock", undefined, true],
  ["./data/test.lock", "sub/data/test.lock", undefined, false],
  ["a/**/b.txt", "a/b.txt", undefined, true],
  ["a/**/b.txt", "a/x/y/b.txt", undefined, true],
  ["?.md", "a.md", undefined, true],
  ["?.md", "ab.md", undefined, false],
  ["results/", "results/a.json", undefined, true],
  ["results/", "x/results/a.json", undefined, true],
  ["data.json", "data_json", undefined, false],
];

for (const [pattern, relPath, opts, expected] of cases) {
  test(`compileGlob(${JSON.stringify(pattern)}${opts ? ", " + JSON.stringify(opts) : ""}) on ${relPath} is ${expected}`, () => {
    assert.equal(compileGlob(pattern, opts)(relPath), expected);
  });
}

test("caseInsensitive defaults to the platform", () => {
  const match = compileGlob("/Results/**");
  assert.equal(match("results/a"), process.platform === "win32");
});
