import { test } from "node:test";
import assert from "node:assert/strict";
import { compileContainer, compileGlob } from "../hooks/lib/glob.mjs";

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

// compileContainer(pattern)(dir): can a path strictly inside dir ("" is the root) match?
const containerCases = [
  ["/results/**", "", true],
  ["/results/**", "results", true],
  ["/results/**", "results/a", true],
  ["/results/**", "data", false],
  ["/data/test.lock", "", true],
  ["/data/test.lock", "data", true],
  ["/data/test.lock", "data/test.lock", false],
  ["/data/test.lock", "dat", false],
  ["/data/test.lock", "data/sub", false],
  ["/a/**/b.txt", "a/x/y", true],
  ["/a/**/b.txt", "b", false],
  ["/src/*.ts", "src", true],
  ["/src/*.ts", "src/a", false],
  ["*.py", "any/folder", true],
];

for (const [pattern, dir, expected] of containerCases) {
  test(`compileContainer(${JSON.stringify(pattern)}) on folder ${JSON.stringify(dir)} is ${expected}`, () => {
    assert.equal(compileContainer(pattern, { caseInsensitive: false })(dir), expected);
  });
}

test("compileContainer honours caseInsensitive", () => {
  assert.equal(compileContainer("/Data/test.lock", { caseInsensitive: true })("data"), true);
  assert.equal(compileContainer("/Data/test.lock", { caseInsensitive: false })("data"), false);
});

test("caseInsensitive defaults to the platform", () => {
  const match = compileGlob("/Results/**");
  assert.equal(match("results/a"), process.platform === "win32");
});
