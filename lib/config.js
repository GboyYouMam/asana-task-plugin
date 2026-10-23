import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./data-dir.js";

/**
 * @typedef {{ checkoutPath?: string, devPort?: number, workspaceMode?: "worktree"|"single-checkout" }} RepoConfig
 * @typedef {{ worktreeRoot: string, worktreeBackend: "git"|"orca", workerBackend: "claude"|"codex", devPortStart: number, repos: Record<string, RepoConfig> }} Config
 */

export function configPath() {
  return path.join(dataDir(), "config.json");
}

/** @returns {Config | null} */
export function loadConfig() {
  const file = configPath();
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** @param {Config} config */
export function saveConfig(config) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
}
