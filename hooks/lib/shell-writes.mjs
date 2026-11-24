// A heuristic, documented as one: finds shell and PowerShell commands that write to a protected
// path. It does not follow `cd`, command substitution or scripts that write files; CI is the
// backstop for those.
import { toProjectRelative } from "./paths.mjs";

const MAX_DEPTH = 3;

// Splits a command line into words and operators. Quotes are removed and backslashes become "/",
// so Windows and POSIX paths compare alike.
function lex(command) {
  const tokens = [];
  let word = null;
  const add = (s) => {
    word = (word ?? "") + s;
  };
  const flush = () => {
    if (word !== null) tokens.push({ type: "word", value: word });
    word = null;
  };
  const op = (value) => {
    flush();
    tokens.push({ type: "op", value });
  };
  const n = command.length;
  let i = 0;
  while (i < n) {
    const c = command[i];
    const next = command[i + 1];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      const stop = end === -1 ? n : end;
      add(command.slice(i + 1, stop).replace(/\\/g, "/"));
      i = stop + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < n && command[j] !== '"') {
        if ((command[j] === "\\" || command[j] === "`") && command[j + 1] === '"') {
          s += '"';
          j += 2;
        } else {
          s += command[j] === "\\" ? "/" : command[j];
          j += 1;
        }
      }
      add(s);
      i = j + 1;
    } else if (c === " " || c === "\t" || c === "\r") {
      flush();
      i += 1;
    } else if (c === "\n" || c === ";") {
      op(";");
      i += 1;
    } else if (c === "&" && next === "&") {
      op("&&");
      i += 2;
    } else if (c === "|" && next === "|") {
      op("||");
      i += 2;
    } else if (c === "|") {
      op("|");
      i += 1;
    } else if (c === ">" || (c === "&" && next === ">")) {
      // A descriptor written just before ">" (2>, 1>) belongs to the operator.
      if (word !== null && /^\d$/.test(word)) word = null;
      else flush();
      let j = c === "&" ? i + 2 : i + 1;
      if (command[j] === ">" || command[j] === "|") j += 1;
      if (command[j] === "&") {
        // >&1 duplicates a descriptor; it writes no file.
        j += 1;
        while (j < n && /[\d-]/.test(command[j])) j += 1;
      } else {
        tokens.push({ type: "redirect" });
      }
      i = j;
    } else if (c === "&") {
      op("&");
      i += 1;
    } else if (c === "<") {
      flush();
      tokens.push({ type: "read" });
      i += next === "<" ? 2 : 1;
    } else if (c === "\\") {
      add("/");
      i += 1;
    } else {
      add(c);
      i += 1;
    }
  }
  flush();
  return tokens;
}

// Groups tokens into simple commands: their words, and the files they redirect output to.
function segments(tokens) {
  const out = [];
  let current = { words: [], targets: [] };
  let pending = null;
  for (const t of tokens) {
    if (t.type === "op") {
      out.push(current);
      current = { words: [], targets: [] };
      pending = null;
    } else if (t.type === "redirect" || t.type === "read") {
      pending = t.type;
    } else {
      if (pending === "redirect") current.targets.push(t.value);
      else if (pending !== "read") current.words.push(t.value);
      pending = null;
    }
  }
  out.push(current);
  return out;
}

const WRAPPERS = new Set(["sudo", "env", "command", "builtin", "nohup", "time", "exec", "xargs"]);
// Every argument of these is written, moved or deleted.
const ANY_ARG = new Set([
  "rm", "rmdir", "unlink", "truncate", "touch", "tee", "mv", "move",
  "remove-item", "ri", "del", "erase", "rd", "clear-content", "clc", "new-item", "ni",
  "set-content", "sc", "add-content", "ac", "out-file", "tee-object", "move-item", "mi",
]);
// Only the destination, the last argument, of these is written.
const LAST_ARG = new Set(["cp", "copy", "copy-item", "cpi"]);
const GIT_WRITES = new Set(["checkout", "restore", "rm", "mv", "clean"]);
const PYTHON = /^(python[\d.]*|py)$/;
const CODE_WRITES = /write|append|unlink|rmtree|rmSync|\.rm\(|remove\(|rename/;
const OPEN_FOR_WRITE = /open\(\s*[^,()]+,\s*(?:mode\s*=\s*)?['"][rbt]*[wax+]|\.open\(\s*['"][rbt]*[wax+]/;
const STRING_LITERAL = /'([^']*)'|"([^"]*)"|`([^`]*)`/g;

const commandName = (word) => word.split("/").pop().replace(/\.exe$/i, "").toLowerCase();
const plain = (args) => args.filter((a) => !a.startsWith("-"));

function hit(candidate, rules, projectDir) {
  const expanded = candidate.replace(
    /^(\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR|\$env:CLAUDE_PROJECT_DIR)(?=\/|$)/i,
    () => projectDir.replace(/\\/g, "/"),
  );
  const rel = toProjectRelative(projectDir, expanded);
  if (rel === null) return null;
  const clean = rel.replace(/\/+$/, "");
  if (clean === "" || clean === ".") return null;
  const rule = rules.find((r) => r.match(clean));
  return rule ? { path: clean, rule: rule.rule } : null;
}

function firstHit(candidates, rules, projectDir) {
  for (const c of candidates) {
    const found = hit(c, rules, projectDir);
    if (found) return found;
  }
  return null;
}

// Inline code that mentions a protected path in a string literal and writes something.
function codeHit(code, rules, projectDir) {
  if (!CODE_WRITES.test(code) && !OPEN_FOR_WRITE.test(code)) return null;
  const literals = [...code.matchAll(STRING_LITERAL)].map((m) => m[1] ?? m[2] ?? m[3]);
  return firstHit(literals, rules, projectDir);
}

function analyse(words, rules, projectDir, depth) {
  let w = words;
  for (;;) {
    while (w.length > 0 && /^[A-Za-z_]\w*=/.test(w[0])) w = w.slice(1);
    if (w.length === 0) return null;
    const name = commandName(w[0]);
    if (WRAPPERS.has(name)) w = w.slice(1);
    else if (name === "uv" && w[1] === "run") w = w.slice(2);
    else break;
    while (w.length > 0 && w[0].startsWith("-")) w = w.slice(1);
  }
  const name = commandName(w[0]);
  const args = w.slice(1);

  if (ANY_ARG.has(name)) return firstHit(plain(args), rules, projectDir);
  if (LAST_ARG.has(name)) return firstHit(plain(args).slice(-1), rules, projectDir);
  if (name === "sed" || name === "perl") {
    const inPlace = args.some((a) => /^-[^-]*i/.test(a) || a === "--in-place" || a.startsWith("--in-place="));
    return inPlace ? firstHit(plain(args), rules, projectDir) : null;
  }
  if (name === "git") {
    const sub = args.findIndex((a) => GIT_WRITES.has(a));
    return sub === -1 ? null : firstHit(plain(args.slice(sub + 1)), rules, projectDir);
  }
  if (PYTHON.test(name) || name === "node") {
    const flag = args.findIndex((a) => (PYTHON.test(name) ? a === "-c" : a === "-e" || a === "--eval"));
    return flag === -1 || flag + 1 >= args.length ? null : codeHit(args[flag + 1], rules, projectDir);
  }
  if (depth < MAX_DEPTH) {
    let inner = null;
    if (["bash", "sh", "zsh"].includes(name)) {
      const flag = args.findIndex((a) => /^-[a-z]*c$/.test(a));
      if (flag !== -1) inner = args[flag + 1] ?? null;
    } else if (name === "cmd") {
      const flag = args.findIndex((a) => /^\/[ck]$/i.test(a));
      if (flag !== -1) inner = args.slice(flag + 1).join(" ");
    } else if (name === "powershell" || name === "pwsh") {
      const flag = args.findIndex((a) => /^-(c|command)$/i.test(a));
      if (flag !== -1) inner = args.slice(flag + 1).join(" ");
    }
    if (inner) return scan(inner, rules, projectDir, depth + 1);
  }
  return null;
}

function scan(command, rules, projectDir, depth) {
  for (const segment of segments(lex(command))) {
    const found = firstHit(segment.targets, rules, projectDir) ?? analyse(segment.words, rules, projectDir, depth);
    if (found) return found;
  }
  return null;
}

// The first protected path the command writes, as {path, rule}, or null.
export function findProtectedWrite(command, rules, projectDir) {
  if (!command || rules.length === 0) return null;
  return scan(command, rules, projectDir, 0);
}
