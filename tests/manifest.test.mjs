import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifestUrl = new URL("../.claude-plugin/plugin.json", import.meta.url);

test("manifest names the plugin", () => {
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  assert.equal(manifest.name, "dev-playbook");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.description, "string");
  assert.ok(manifest.description.length > 0);
});
