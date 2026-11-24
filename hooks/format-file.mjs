// PostToolUse hook on Edit and Write: runs the project's format command on the edited file,
// silently, so the stop check rarely fails on formatting alone.
import path from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { compileGlob } from "./lib/glob.mjs";
import { projectDirFrom, readHookInput, runHook } from "./lib/io.mjs";
import { toProjectRelative } from "./lib/paths.mjs";
import { fillTemplate, runCommand } from "./lib/run.mjs";

const FORMAT_TIMEOUT_MS = 60_000;

await runHook("format-file", async () => {
  const input = await readHookInput();
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return "";
  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath === "") return "";
  const projectDir = projectDirFrom(input);
  const loaded = loadConfig(projectDir);
  if (loaded.status !== "ok" || !loaded.config.format) return "";
  const rel = toProjectRelative(projectDir, filePath);
  if (rel === null || !loaded.config.formatGlobs.some((g) => compileGlob(g)(rel))) return "";
  const absolute = path.resolve(projectDir, filePath);
  await runCommand(fillTemplate(loaded.config.format, "file", absolute), { cwd: projectDir, timeoutMs: FORMAT_TIMEOUT_MS });
  return "";
});
