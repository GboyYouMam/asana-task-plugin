import { spawnSync } from "node:child_process";

const WIN = process.platform === "win32";

/** Runs a command and reports only whether it exited 0. Never throws. */
export function commandOk(cmd, args = []) {
  try {
    const result = WIN
      ? spawnSync([cmd, ...args].join(" "), { shell: true, stdio: "ignore", timeout: 15000 })
      : spawnSync(cmd, args, { stdio: "ignore", timeout: 15000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

/** @typedef {{ git: boolean, gh: boolean, ghLoggedIn: boolean, node: boolean, orca: boolean, codex: boolean }} Tools */

/** @returns {Tools} */
export function detectTools() {
  const gh = commandOk("gh", ["--version"]);
  return {
    git: commandOk("git", ["--version"]),
    gh,
    ghLoggedIn: gh && commandOk("gh", ["auth", "status"]),
    node: commandOk("node", ["--version"]),
    orca: commandOk("orca", ["--version"]),
    codex: commandOk("codex", ["--version"]),
  };
}
