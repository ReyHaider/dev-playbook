import { test } from "node:test";
import assert from "node:assert/strict";
import { toProjectRelative } from "../hooks/lib/paths.mjs";

const cases = [
  ["C:\\dev\\My Repo", "C:\\dev\\My Repo\\results\\a.json", "results/a.json"],
  ["C:\\dev\\My Repo", "c:/dev/my repo/results/a.json", "results/a.json"],
  ["C:\\dev\\My Repo", "D:\\x\\a.json", null],
  ["/home/u/repo", "/home/u/repo/data/x", "data/x"],
  ["/home/u/repo", "./results/a.json", "results/a.json"],
  // Beyond the plan's table: bare relative paths, Git Bash drive paths, and escapes.
  ["/home/u/repo", "results/a.json", "results/a.json"],
  ["C:\\dev\\My Repo", "results\\a.json", "results/a.json"],
  ["C:\\dev\\My Repo", "/c/dev/My Repo/results/a.json", "results/a.json"],
  ["/home/u/repo", "../other/a.json", null],
  ["/home/u/repo", "/tmp/x", null],
];

for (const [projectDir, p, expected] of cases) {
  test(`toProjectRelative(${JSON.stringify(projectDir)}, ${JSON.stringify(p)}) is ${JSON.stringify(expected)}`, () => {
    assert.equal(toProjectRelative(projectDir, p), expected);
  });
}
