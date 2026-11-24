import { readFileSync } from "node:fs";
import path from "node:path";

export const CONFIG_PATH = ".claude/dev-playbook.json";

const KEYS = new Set(["static", "test", "exclude", "testGlobs", "watch", "timeoutSeconds", "format", "formatGlobs"]);

const isCommand = (v) => typeof v === "string" && v.trim() !== "";
const isGlobList = (v) => Array.isArray(v) && v.length > 0 && v.every(isCommand);

// Returns the reason the config is invalid, or null.
function problem(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "it must be a JSON object";
  for (const key of Object.keys(raw)) {
    if (!KEYS.has(key)) return `unknown key: ${key}`;
  }
  for (const key of ["static", "test", "exclude", "format"]) {
    if (key in raw && !isCommand(raw[key])) return `${key} must be a non-empty string`;
  }
  if (!("static" in raw) && !("test" in raw)) return "it needs static or test";
  if (!isGlobList(raw.watch)) return "watch must be a non-empty list of globs";
  for (const key of ["testGlobs", "formatGlobs"]) {
    if (key in raw && !isGlobList(raw[key])) return `${key} must be a non-empty list of globs`;
  }
  if ("timeoutSeconds" in raw) {
    const t = raw.timeoutSeconds;
    if (!Number.isInteger(t) || t < 1 || t > 1500) return "timeoutSeconds must be a whole number from 1 to 1500";
  }
  if ("exclude" in raw && !raw.exclude.includes("{file}")) return "exclude must contain {file}";
  if (raw.test?.includes("{exclude}") && !("exclude" in raw)) return "test uses {exclude}, so exclude is required";
  if ("format" in raw) {
    if (!raw.format.includes("{file}")) return "format must contain {file}";
    if (!("formatGlobs" in raw)) return "format is set, so formatGlobs is required";
  }
  return null;
}

export function loadConfig(projectDir) {
  let text;
  try {
    text = readFileSync(path.join(projectDir, CONFIG_PATH), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { status: "absent" };
    return { status: "invalid", error: `cannot read it: ${err.message}` };
  }
  let raw;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch (err) {
    return { status: "invalid", error: `not valid JSON: ${err.message}` };
  }
  const error = problem(raw);
  if (error) return { status: "invalid", error };
  return { status: "ok", config: { testGlobs: ["tests/**"], timeoutSeconds: 600, ...raw } };
}
