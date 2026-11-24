// A heuristic, documented as one: finds shell and PowerShell commands that write to a protected
// path. It does not follow `cd` or scripts that write files; CI is the backstop for those.
import { statSync } from "node:fs";
import path from "node:path";
import { toProjectRelative } from "./paths.mjs";

const MAX_DEPTH = 3;
// After a backslash outside quotes, these are a POSIX escape (a literal character); after any
// other character the backslash is a Windows path separator.
const ESCAPABLE = new Set([" ", "\t", ";", "&", "|", "<", ">", "(", ")", "{", "}", '"', "'", "$", "`", "!"]);

// Splits a command line into words and operators. Quotes are removed and backslashes become "/",
// so Windows and POSIX paths compare alike. Brackets and braces separate commands, so a write
// inside a subshell, a group or a PowerShell block is its own command.
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
    } else if (c === "\\") {
      if (next !== undefined && ESCAPABLE.has(next)) {
        add(next);
        i += 2;
      } else {
        add("/");
        i += 1;
      }
    } else if (c === "{" && word?.endsWith("$")) {
      // ${NAME} stays part of the word.
      const end = command.indexOf("}", i);
      const stop = end === -1 ? n : end + 1;
      add(command.slice(i, stop));
      i = stop;
    } else if (c === " " || c === "\t" || c === "\r") {
      flush();
      i += 1;
    } else if (c === "\n" || c === ";" || c === "(" || c === ")" || c === "{" || c === "}") {
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

// Words that start a command without being one.
const PREFIXES = new Set([
  "sudo", "env", "command", "builtin", "nohup", "time", "exec", "xargs",
  "if", "then", "else", "elif", "do", "while", "until", "!",
]);
// These delete their arguments: a folder that holds a protected path counts too.
const REMOVE = new Set(["rm", "rmdir", "unlink", "remove-item", "ri", "del", "erase", "rd"]);
// These write the file named by each argument.
const WRITE = new Set([
  "truncate", "touch", "tee", "tee-object", "clear-content", "clc", "new-item", "ni",
  "set-content", "sc", "add-content", "ac", "out-file",
]);
// These move every argument but the last into the last; that copy only the last.
const MOVE = new Set(["mv", "move", "move-item", "mi"]);
const COPY = new Set(["cp", "copy", "copy-item", "cpi"]);
const GIT_WRITES = new Set(["checkout", "restore", "rm", "mv", "clean"]);
const PYTHON = /^(python[\d.]*|py)$/;
const CODE_WRITES = /write|append|unlink|rmtree|rmSync|\.rm\(|remove\(|rename/;
const OPEN_FOR_WRITE = /open\(\s*[^,()]+,\s*(?:mode\s*=\s*)?['"][rbt]*[wax+]|\.open\(\s*['"][rbt]*[wax+]/;
const STRING_LITERAL = /'([^']*)'|"([^"]*)"|`([^`]*)`/g;

const commandName = (word) => word.split("/").pop().replace(/\.exe$/i, "").toLowerCase();
const plain = (args) => args.filter((a) => !a.startsWith("-"));

function relative(candidate, projectDir) {
  const expanded = candidate.replace(
    /^(\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR|\$env:CLAUDE_PROJECT_DIR)(?=\/|$)/i,
    () => projectDir.replace(/\\/g, "/"),
  );
  const rel = toProjectRelative(projectDir, expanded);
  if (rel === null) return null;
  const clean = rel.replace(/\/+$/, "");
  return clean === "." ? "" : clean;
}

// The rule the candidate path breaks, if any. With `tree`, a folder (or the root) that holds a
// protected path counts as well, for commands that delete, move or restore whole folders.
function hit(candidate, rules, projectDir, tree) {
  const rel = relative(candidate, projectDir);
  if (rel === null) return null;
  const rule = rules.find((r) => (rel !== "" && r.match(rel)) || (tree && r.under(rel)));
  return rule ? { path: rel === "" ? "." : rel, rule: rule.rule } : null;
}

function firstHit(candidates, rules, projectDir, tree = false) {
  for (const c of candidates) {
    const found = hit(c, rules, projectDir, tree);
    if (found) return found;
  }
  return null;
}

// The files a copy or move writes: into a folder, each source keeps its name there.
function destinations(dest, sources, projectDir) {
  const rel = relative(dest, projectDir);
  let folder = dest.endsWith("/") || rel === "";
  if (!folder && rel !== null) {
    try {
      folder = statSync(path.join(projectDir, rel)).isDirectory();
    } catch {
      folder = false;
    }
  }
  if (!folder || sources.length === 0) return [dest];
  return sources.map((s) => `${dest.replace(/\/+$/, "")}/${s.replace(/\/+$/, "").split("/").pop()}`);
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
    if (PREFIXES.has(name)) w = w.slice(1);
    else if (name === "uv" && w[1] === "run") w = w.slice(2);
    else break;
    while (w.length > 0 && w[0].startsWith("-")) w = w.slice(1);
  }
  const name = commandName(w[0]);
  const args = w.slice(1);
  const paths = plain(args);

  if (REMOVE.has(name)) return firstHit(paths, rules, projectDir, true);
  if (WRITE.has(name)) return firstHit(paths, rules, projectDir);
  if (MOVE.has(name) || COPY.has(name)) {
    const sources = paths.length > 1 ? paths.slice(0, -1) : [];
    const dest = paths.at(-1);
    const moved = MOVE.has(name) ? firstHit(paths.length > 1 ? sources : paths, rules, projectDir, true) : null;
    if (moved || dest === undefined || paths.length < 2) return moved;
    return firstHit(destinations(dest, sources, projectDir), rules, projectDir);
  }
  if (name === "sed" || name === "perl") {
    const inPlace = args.some((a) => /^-[^-]*i/.test(a) || a === "--in-place" || a.startsWith("--in-place="));
    return inPlace ? firstHit(paths, rules, projectDir) : null;
  }
  if (name === "git") {
    const sub = args.findIndex((a) => GIT_WRITES.has(a));
    if (sub === -1) return null;
    const targets = plain(args.slice(sub + 1));
    // git clean with no path cleans the whole tree.
    if (args[sub] === "clean" && targets.length === 0) targets.push(".");
    return firstHit(targets, rules, projectDir, true);
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
