// Reading hook input and finding the project.
import { internalError } from "./messages.mjs";

export async function readHookInput(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "").trim();
  return text === "" ? {} : JSON.parse(text);
}

// $CLAUDE_PROJECT_DIR stays fixed when Claude works in a subfolder, so it wins over the input's cwd.
export function projectDirFrom(input) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

// Runs a hook's body; whatever happens, prints at most one output and leaves exit code 0.
export async function runHook(name, body) {
  let stdout;
  try {
    stdout = await body();
  } catch (err) {
    stdout = JSON.stringify({ systemMessage: internalError(name, err?.message ?? String(err)) });
  }
  if (stdout) process.stdout.write(stdout);
  process.exitCode = 0;
}
