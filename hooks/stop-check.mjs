// Stop hook: blocks a finished turn while the project's checks fail.
import { projectDirFrom, readHookInput, runHook } from "./lib/io.mjs";
import { runStopCheck } from "./lib/stop.mjs";

await runHook("stop-check", async () => {
  const input = await readHookInput();
  const { stdout } = await runStopCheck({ projectDir: projectDirFrom(input) });
  return stdout;
});
