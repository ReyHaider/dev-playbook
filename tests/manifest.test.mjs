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

test("the plugin is MIT licensed, in the manifest and in a LICENSE file", () => {
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  assert.equal(manifest.license, "MIT");
  const licence = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
  assert.match(licence, /^MIT License\n\nCopyright \(c\) 2026 /);
});
