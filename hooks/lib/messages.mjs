// Every user-facing string the hooks print. Tests pin the exact text.

export const absent = () => "dev-playbook: no .claude/dev-playbook.json in this project; checks are off.";

export const invalid = (error) => `dev-playbook: .claude/dev-playbook.json is invalid (${error}); checks are off.`;

export const block = (label, command, tail) =>
  `dev-playbook: the ${label} check failed (${command}). Fix it before finishing. Last 60 lines:\n${tail}`;

export const giveUp = () => "dev-playbook: checks are still failing on this change after 3 attempts. This is not done.";

export const couldNotCheck = (reason) => `dev-playbook: could not check (${reason}). The change is unverified.`;

export const redByDesign = (sha7) => `dev-playbook: tests from ${sha7} are red by design, awaiting code.`;

export const protectedPath = (path, rule) =>
  `dev-playbook: ${path} is protected by ${rule} in the project's Claude settings. Change it through the project's own tooling, or ask the person.`;

export const internalError = (hook, message) => `dev-playbook: the ${hook} hook failed (${message}); it did nothing.`;
