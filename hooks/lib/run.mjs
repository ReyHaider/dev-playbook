import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { truncated } from "./messages.mjs";

// Only the end of the output is ever shown, so older bytes are dropped past this size.
const MAX_OUTPUT_BYTES = 1024 * 1024;
// After killing the tree, stop waiting for the pipes to close after this long.
const DRAIN_MS = 2000;
// After the shell exits, wait this long for its last output before closing the pipes, in case a
// background child it started still holds them open.
const EXIT_DRAIN_MS = 300;
// Each line of a tail is cut to this many characters.
const MAX_LINE = 400;

const windows = process.platform === "win32";

// Whether the shell could not find the command. POSIX sh exits 127. cmd.exe /c exits 1 and prints
// this message (English Windows; elsewhere the check blocks with the message instead).
function notFound(code, output) {
  if (!windows) return code === 127;
  return code !== 0 && /is not recognized as an internal or external command/.test(output);
}

function killTree(child) {
  try {
    if (windows) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    child.kill("SIGKILL");
  }
}

// Runs a command through the platform shell. Resolves, never rejects.
export function runCommand(command, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    if (!existsSync(cwd)) {
      resolve({ status: "error", exitCode: null, output: `the folder ${cwd} does not exist` });
      return;
    }
    const chunks = [];
    let size = 0;
    const collect = (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      while (size > MAX_OUTPUT_BYTES && chunks.length > 1) size -= chunks.shift().length;
    };
    const output = () => Buffer.concat(chunks).toString("utf8");

    let child;
    let settled = false;
    let timedOut = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A background child may still hold the pipes; let go of them so this process can exit.
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      child?.unref();
      resolve(result);
    };
    const exited = (code) => {
      if (timedOut) return { status: "timeout", exitCode: null, output: output() };
      const text = output();
      if (notFound(code, text)) return { status: "error", exitCode: code, output: text };
      return { status: code === 0 ? "passed" : "failed", exitCode: code, output: text };
    };

    try {
      child = spawn(command, {
        cwd,
        shell: true,
        detached: !windows,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      finish({ status: "error", exitCode: null, output: err.message });
      return;
    }
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (err) => finish({ status: "error", exitCode: null, output: err.message }));
    child.on("close", (code) => finish(exited(code)));
    child.on("exit", (code) => {
      setTimeout(() => finish(exited(code)), EXIT_DRAIN_MS).unref();
    });
    timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      setTimeout(() => finish({ status: "timeout", exitCode: null, output: output() }), DRAIN_MS).unref();
    }, timeoutMs);
  });
}

const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

// What a terminal would show for one line: trailing carriage returns dropped, and after a carriage
// return inside the line (a progress bar redrawing itself) only the last state.
function shown(line) {
  let end = line.length;
  while (end > 0 && line[end - 1] === "\r") end -= 1;
  const visible = line.slice(line.lastIndexOf("\r", end - 1) + 1, end);
  return visible.length > MAX_LINE ? visible.slice(0, MAX_LINE) + truncated(visible.length - MAX_LINE) : visible;
}

// The last `lines` lines of text, without ANSI escape sequences or trailing blank lines.
export function tail(text, lines) {
  const all = text.replace(ANSI, "").trimEnd().split("\n");
  return all.slice(-lines).map(shown).join("\n");
}

// Replaces every {name} with raw, exactly, then trims trailing whitespace.
export function replacePlaceholder(template, name, raw) {
  return template.split(`{${name}}`).join(raw).trimEnd();
}

// Replaces every {name} with value in double quotes. On POSIX shells, the characters that
// stay special inside double quotes are escaped, so a file name cannot run a command.
export function fillTemplate(template, name, value, platform = process.platform) {
  const escaped = platform === "win32" ? value : value.replace(/[\\"$`]/g, "\\$&");
  return replacePlaceholder(template, name, `"${escaped}"`);
}
