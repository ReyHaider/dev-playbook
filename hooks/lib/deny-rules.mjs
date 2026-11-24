import { readFileSync } from "node:fs";
import path from "node:path";
import { compileContainer, compileGlob } from "./glob.mjs";

const SETTINGS_FILES = [".claude/settings.json", ".claude/settings.local.json"];
const EDIT_RULE = /^Edit\((.+)\)$/;

function denyList(file) {
  try {
    const deny = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""))?.permissions?.deny;
    return Array.isArray(deny) ? deny : [];
  } catch {
    return [];
  }
}

// The project's Edit(...) deny rules, the single list of paths that must never be hand-edited.
// "/x", "./x" and "x" are all anchored at the project root: an approximation of Claude Code,
// which reads "x" relative to the current folder. Absolute ("//x") and home ("~/x") rules are skipped.
export function loadProtectedRules(projectDir) {
  const rules = [];
  for (const name of SETTINGS_FILES) {
    for (const entry of denyList(path.join(projectDir, name))) {
      if (typeof entry !== "string") continue;
      const m = EDIT_RULE.exec(entry.trim());
      if (!m) continue;
      const pattern = m[1];
      if (pattern.startsWith("//") || pattern.startsWith("~/")) continue;
      const anchored = pattern.startsWith("/") || pattern.startsWith("./") ? pattern : `/${pattern}`;
      rules.push({ rule: entry.trim(), match: compileGlob(anchored), under: compileContainer(anchored) });
    }
  }
  return rules;
}
