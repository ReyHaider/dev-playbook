// SessionStart hook: one line when the project's checks are off; nothing otherwise.
import { loadConfig } from "./lib/config.mjs";
import { projectDirFrom, readHookInput, runHook } from "./lib/io.mjs";
import * as messages from "./lib/messages.mjs";

await runHook("session-start", async () => {
  const loaded = loadConfig(projectDirFrom(await readHookInput()));
  if (loaded.status === "absent") return messages.absent();
  if (loaded.status === "invalid") return messages.invalid(loaded.error);
  return "";
});
