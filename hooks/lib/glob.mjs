// Gitignore-style glob matching for project-relative paths.
//
// - A leading "/" or "./" anchors the pattern at the project root.
// - A pattern with no "/" except a trailing one matches at any depth.
// - "*" and "?" never cross "/"; "**" spans folders.
// - "x/**" also matches "x" itself; a trailing "/" means the folder and everything in it.

const SPECIAL = /[.+^${}()|[\]\\]/g;

function toRegExpSource(body) {
  let re = "";
  let i = 0;
  while (i < body.length) {
    const atSegmentStart = i === 0 || body[i - 1] === "/";
    if (atSegmentStart && body.startsWith("**/", i)) {
      re += "(?:.*/)?";
      i += 3;
    } else if (body.startsWith("/**", i) && i + 3 === body.length) {
      re += "(?:/.*)?";
      i += 3;
    } else if (body.startsWith("**", i)) {
      re += ".*";
      i += 2;
    } else if (body[i] === "*") {
      re += "[^/]*";
      i += 1;
    } else if (body[i] === "?") {
      re += "[^/]";
      i += 1;
    } else {
      re += body[i].replace(SPECIAL, "\\$&");
      i += 1;
    }
  }
  return re;
}

// The pattern without its anchor, and whether it is anchored at the root.
function normalise(pattern) {
  let body = pattern;
  let anchored = false;
  if (body.startsWith("./")) {
    body = body.slice(2);
    anchored = true;
  } else if (body.startsWith("/")) {
    body = body.slice(1);
    anchored = true;
  }
  if (body.endsWith("/")) {
    body = body.slice(0, -1);
    if (body.includes("/")) anchored = true;
    body += "/**";
  } else if (body.includes("/")) {
    anchored = true;
  }
  return { body, anchored };
}

const flagsFor = (opts) => ((opts.caseInsensitive ?? process.platform === "win32") ? "i" : "");

export function compileGlob(pattern, opts = {}) {
  const { body, anchored } = normalise(pattern);
  const prefix = anchored ? "^" : "^(?:.*/)?";
  const re = new RegExp(`${prefix}${toRegExpSource(body)}$`, flagsFor(opts));
  return (relPath) => re.test(relPath);
}

// Whether some path strictly inside the folder dir ("" is the root) could match the pattern:
// deleting, moving or restoring that folder would touch a match.
export function compileContainer(pattern, opts = {}) {
  const { body, anchored } = normalise(pattern);
  if (!anchored) return () => true;
  const segments = body.split("/");
  const matchers = segments.map((s) => (s === "**" ? null : new RegExp(`^${toRegExpSource(s)}$`, flagsFor(opts))));
  return (dir) => {
    const parts = dir === "" ? [] : dir.split("/");
    const fits = (si, pi) => {
      if (pi === parts.length) return si < segments.length;
      if (si === segments.length) return false;
      if (segments[si] === "**") return fits(si + 1, pi) || fits(si, pi + 1);
      return matchers[si].test(parts[pi]) && fits(si + 1, pi + 1);
    };
    return fits(0, 0);
  };
}
