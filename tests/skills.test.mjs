import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Reads the YAML front matter's single-line `key: value` pairs, unquoting quoted values.
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  assert.ok(m, "the file starts with front matter");
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^".*"$/.test(value)) value = JSON.parse(value);
    else if (/^'.*'$/.test(value)) value = value.slice(1, -1).replace(/''/g, "'");
    fields[kv[1]] = value;
  }
  return fields;
}

const skillDirs = readdirSync(path.join(root, "skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

test("the dev-process skill exists", () => {
  assert.ok(skillDirs.includes("dev-process"));
});

for (const name of skillDirs) {
  const file = path.join(root, "skills", name, "SKILL.md");
  const text = () => readFileSync(file, "utf8");

  test(`${name}: front matter names the folder and has a description`, () => {
    const fm = frontMatter(text());
    assert.equal(fm.name, name);
    assert.ok(fm.description && fm.description.length > 0);
  });

  test(`${name}: description and when_to_use fit in 1,536 characters`, () => {
    const fm = frontMatter(text());
    const length = fm.description.length + (fm.when_to_use ?? "").length;
    assert.ok(length <= 1536, `${length} characters`);
  });

  test(`${name}: at most 300 lines`, () => {
    const lines = text().replace(/\n$/, "").split("\n").length;
    assert.ok(lines <= 300, `${lines} lines`);
  });
}

const devProcess = () => readFileSync(path.join(root, "skills", "dev-process", "SKILL.md"), "utf8");

const engineSkills = [
  "brainstorming",
  "writing-plans",
  "executing-plans",
  "test-driven-development",
  "systematic-debugging",
  "verification-before-completion",
  "requesting-code-review",
  "receiving-code-review",
  "finishing-a-development-branch",
];

for (const skill of engineSkills) {
  test(`dev-process names ${skill}`, () => {
    assert.match(devProcess(), new RegExp(`\\b${skill}\\b`));
  });
}

test("dev-process states both trailers", () => {
  assert.ok(devProcess().includes("Test-First: characterisation"));
  assert.ok(devProcess().includes("Test-Change:"));
});

test("dev-process points to the plan template, which exists", () => {
  assert.ok(devProcess().includes("references/plan-template.md"));
  assert.ok(existsSync(path.join(root, "skills", "dev-process", "references", "plan-template.md")));
});

test("dev-process names the code-intelligence plugins", () => {
  assert.match(devProcess(), /\bpyright-lsp\b/);
  assert.match(devProcess(), /\btypescript-lsp\b/);
});

const agentFiles = readdirSync(path.join(root, "agents")).filter((f) => f.endsWith(".md"));

test("the conflict-reviewer agent exists", () => {
  assert.ok(agentFiles.includes("conflict-reviewer.md"));
});

for (const file of agentFiles) {
  test(`agent ${file} has a name, a description and tools`, () => {
    const fm = frontMatter(readFileSync(path.join(root, "agents", file), "utf8"));
    assert.equal(fm.name, file.replace(/\.md$/, ""));
    assert.ok(fm.description);
    assert.ok(fm.tools);
  });
}

test("conflict-reviewer can only read", () => {
  const fm = frontMatter(readFileSync(path.join(root, "agents", "conflict-reviewer.md"), "utf8"));
  assert.equal(fm.tools, "Read, Grep, Glob");
});
