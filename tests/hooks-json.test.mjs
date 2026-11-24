import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";

const expected = {
  SessionStart: { matcher: undefined, script: "session-start", timeout: 10 },
  Stop: { matcher: undefined, script: "stop-check", timeout: 1800 },
  PreToolUse: { matcher: "Bash|PowerShell", script: "protect-paths", timeout: 10 },
  PostToolUse: { matcher: "Edit|Write", script: "format-file", timeout: 90 },
};

const hooksJson = () => JSON.parse(readFileSync(new URL("../hooks/hooks.json", import.meta.url), "utf8"));

test("hooks.json registers exactly the four events", () => {
  assert.deepEqual(Object.keys(hooksJson().hooks).sort(), Object.keys(expected).sort());
});

for (const [event, want] of Object.entries(expected)) {
  test(`${event} runs ${want.script} with a ${want.timeout} s timeout`, () => {
    const groups = hooksJson().hooks[event];
    assert.equal(groups.length, 1);
    assert.equal(groups[0].matcher, want.matcher);
    assert.equal(groups[0].hooks.length, 1);
    assert.deepEqual(groups[0].hooks[0], {
      type: "command",
      command: "node",
      args: [`${ROOT_VAR}/hooks/${want.script}.mjs`],
      timeout: want.timeout,
    });
  });
}

test("every registered script exists", () => {
  for (const groups of Object.values(hooksJson().hooks)) {
    for (const hook of groups.flatMap((g) => g.hooks)) {
      assert.ok(hook.args[0].startsWith(`${ROOT_VAR}/hooks/`), hook.args[0]);
      const file = hook.args[0].replace(ROOT_VAR, root);
      assert.ok(existsSync(file), file);
    }
  }
});
