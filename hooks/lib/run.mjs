import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Only the end of the output is ever shown, so older bytes are dropped past this size.
const MAX_OUTPUT_BYTES = 1024 * 1024;
// After killing the tree, stop waiting for the pipes to close after this long.
const DRAIN_MS = 2000;

const windows = process.platform === "win32";

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

    let settled = false;
    let timedOut = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let child;
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
    child.on("close", (code) => {
      if (timedOut) finish({ status: "timeout", exitCode: null, output: output() });
      else finish({ status: code === 0 ? "passed" : "failed", exitCode: code, output: output() });
    });
    timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      setTimeout(() => finish({ status: "timeout", exitCode: null, output: output() }), DRAIN_MS).unref();
    }, timeoutMs);
  });
}

const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

// The last `lines` lines of text, without ANSI escape sequences or trailing blank lines.
export function tail(text, lines) {
  const clean = text.replace(ANSI, "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
  // A carriage return inside a line is a progress bar redrawing itself: keep the last state.
  const all = clean.split("\n").map((line) => line.slice(line.lastIndexOf("\r") + 1));
  return all.slice(-lines).join("\n");
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
