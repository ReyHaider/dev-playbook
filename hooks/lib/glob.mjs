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

export function compileGlob(pattern, opts = {}) {
  const caseInsensitive = opts.caseInsensitive ?? process.platform === "win32";
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
  const prefix = anchored ? "^" : "^(?:.*/)?";
  const re = new RegExp(`${prefix}${toRegExpSource(body)}$`, caseInsensitive ? "i" : "");
  return (relPath) => re.test(relPath);
}
