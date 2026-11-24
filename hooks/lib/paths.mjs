import path from "node:path";

const DRIVE = /^[A-Za-z]:/;
const GIT_BASH_DRIVE = /^\/([A-Za-z])(?=\/|$)/;

// The path relative to projectDir, with forward slashes, or null when it lies outside.
// Windows rules apply when projectDir starts with a drive letter, so they can be tested on Linux.
export function toProjectRelative(projectDir, p) {
  const windows = DRIVE.test(projectDir);
  const lib = windows ? path.win32 : path.posix;
  let target = p;
  if (windows) target = target.replace(GIT_BASH_DRIVE, "$1:");
  const rel = lib.relative(projectDir, lib.resolve(projectDir, target));
  if (rel === ".." || rel.startsWith(`..${lib.sep}`) || lib.isAbsolute(rel)) return null;
  return rel.split(lib.sep).join("/");
}
