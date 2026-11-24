import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileContainer, compileGlob } from "../hooks/lib/glob.mjs";
import { findProtectedWrite } from "../hooks/lib/shell-writes.mjs";

const rules = ["/results/**", "/data/test.lock"].map((p) => ({
  rule: `Edit(${p})`,
  match: compileGlob(p, { caseInsensitive: false }),
  under: compileContainer(p, { caseInsensitive: false }),
}));

const caught = [
  "echo x > results/a.json",
  "echo x >> results/a.json",
  "cat n.json | tee results/a.json",
  "rm -rf results",
  "rm results/a.json",
  "mv tmp.json results/a.json",
  "mv results/a.json /tmp/x",
  "cp tmp.json results/a.json",
  "sed -i 's/1/2/' results/a.json",
  "git checkout -- results/a.json",
  "git restore data/test.lock",
  "Set-Content -Path results\\a.json -Value x",
  "Remove-Item results -Recurse",
  '"x" | Out-File results/a.json',
  `python -c "open('results/a.json','w').write('x')"`,
  `uv run python -c "import os; os.unlink('data/test.lock')"`,
  // Beyond the plan's table.
  "echo x >results/a.json",
  "make 2> results/err.log",
  "echo x &> results/a.json",
  "echo ok && echo x > results/a.json",
  "npm test; rm data/test.lock",
  "perl -pi -e 's/a/b/' results/a.json",
  "git clean -fd results",
  "git rm --cached data/test.lock",
  'bash -c "rm results/a.json"',
  "cmd /c del results\\a.json",
  'powershell -Command "Remove-Item results/a.json"',
  "echo x > $CLAUDE_PROJECT_DIR/results/a.json",
  "Copy-Item tmp.json -Destination results/a.json",
  `node -e "require('fs').writeFileSync('results/a.json','x')"`,
  "remove-item ./results/a.json",
  `python3 -c "import os; os.remove('results/a.json')"`,
  `python -c "open('results/a.json', 'a+').close()"`,
  // From the final review: keywords and brackets in front of a write.
  "if [ -f x ]; then rm results/a.json; fi",
  "if [ -f x ]; then echo; else rm results/a.json; fi",
  "for i in 1; do rm results/a.json; done",
  "(rm -rf results)",
  "{ rm results/a.json; }",
  "! rm results/a.json",
  "echo $(rm results/a.json)",
  "if (Test-Path x) { Remove-Item results/a.json }",
  "foreach ($f in 1) { Set-Content results/a.json x }",
  // From the final review: a folder or the root that holds a protected file.
  "rm -rf data",
  "rm -rf data/",
  "Remove-Item data -Recurse",
  "git restore data",
  "git checkout -- data",
  "git checkout .",
  "git restore .",
  "rm -rf .",
  "git clean -fd",
  "mv data /tmp/data",
  "cp /tmp/test.lock data/",
  "echo x > ${CLAUDE_PROJECT_DIR}/results/a.json",
];

for (const command of caught) {
  test(`caught: ${command}`, () => {
    const finding = findProtectedWrite(command, rules, "/repo");
    assert.notEqual(finding, null);
    assert.match(finding.rule, /^Edit\(/);
  });
}

test("a finding names the path and the rule", () => {
  assert.deepEqual(findProtectedWrite("rm results/a.json", rules, "/repo"), {
    path: "results/a.json",
    rule: "Edit(/results/**)",
  });
});

test("a Windows path with spaces is caught", () => {
  const finding = findProtectedWrite('echo x > "C:\\dev\\My Repo\\results\\a.json"', rules, "C:\\dev\\My Repo");
  assert.deepEqual(finding, { path: "results/a.json", rule: "Edit(/results/**)" });
});

test("a Git Bash path with escaped spaces is caught", () => {
  const finding = findProtectedWrite("echo x > /c/dev/My\\ Repo/results/a.json", rules, "C:\\dev\\My Repo");
  assert.deepEqual(finding, { path: "results/a.json", rule: "Edit(/results/**)" });
});

test("copying into a folder that exists is checked by the file it writes", () => {
  const project = mkdtempSync(path.join(tmpdir(), "dp writes "));
  mkdirSync(path.join(project, "data"));
  mkdirSync(path.join(project, "docs"));
  assert.deepEqual(findProtectedWrite("cp /tmp/test.lock data", rules, project), {
    path: "data/test.lock",
    rule: "Edit(/data/test.lock)",
  });
  assert.equal(findProtectedWrite("cp /tmp/test.lock docs", rules, project), null);
  rmSync(project, { recursive: true, force: true });
});

test("a Git Bash drive path is caught", () => {
  const finding = findProtectedWrite('rm "/c/dev/My Repo/data/test.lock"', rules, "C:\\dev\\My Repo");
  assert.deepEqual(finding, { path: "data/test.lock", rule: "Edit(/data/test.lock)" });
});

const allowed = [
  "cat results/a.json",
  "git diff results/a.json",
  "cp results/a.json /tmp/copy.json",
  "grep -r x results",
  "uv run python -m evals.run --out results/run-1.json",
  "echo x > results.md",
  "ls data/test.lock",
  // Beyond the plan's table.
  "echo x 2>&1",
  "cat < results/a.json",
  "sed 's/1/2/' results/a.json",
  "git checkout main",
  `python -c "print(open('results/a.json').read())"`,
  "echo results/a.json > notes.txt",
  "rm notes.txt",
  "",
  // From the final review's fixes: these must stay allowed.
  "git checkout main",
  "git checkout -b feature",
  "rm -rf build",
  "cp a.txt docs/",
  "mv notes.txt data/",
  "git add .",
  "git diff -- .",
  "if [ -f results/a.json ]; then cat results/a.json; fi",
  "Get-ChildItem results | ForEach-Object { $_.Name }",
  "(cd results && ls)",
];

for (const command of allowed) {
  test(`allowed: ${command || "(empty)"}`, () => {
    assert.equal(findProtectedWrite(command, rules, "/repo"), null);
  });
}

test("no rules means nothing is caught", () => {
  assert.equal(findProtectedWrite("rm -rf results", [], "/repo"), null);
});
