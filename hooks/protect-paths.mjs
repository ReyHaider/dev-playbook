// PreToolUse hook on Bash and PowerShell: refuses shell writes to the project's protected paths.
import { loadConfig } from "./lib/config.mjs";
import { loadProtectedRules } from "./lib/deny-rules.mjs";
import { projectDirFrom, readHookInput, runHook } from "./lib/io.mjs";
import { protectedPath } from "./lib/messages.mjs";
import { findProtectedWrite } from "./lib/shell-writes.mjs";

await runHook("protect-paths", async () => {
  const input = await readHookInput();
  if (input.tool_name !== "Bash" && input.tool_name !== "PowerShell") return "";
  const command = input.tool_input?.command;
  if (typeof command !== "string") return "";
  const projectDir = projectDirFrom(input);
  if (loadConfig(projectDir).status === "absent") return "";
  const finding = findProtectedWrite(command, loadProtectedRules(projectDir), projectDir);
  if (finding === null) return "";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: protectedPath(finding.path, finding.rule),
    },
  });
});
