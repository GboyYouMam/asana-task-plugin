#!/usr/bin/env node
// First-run setup: detect tools, report blockers, write the machine config.
// Idempotent: with an existing config it only prints it.
import path from "node:path";
import { loadConfig, saveConfig, configPath } from "../lib/config.js";
import { detectTools } from "../lib/detect.js";

const existing = loadConfig();
if (existing) {
  console.log(`config: ${configPath()}`);
  console.log(JSON.stringify(existing, null, 2));
  process.exit(0);
}

const tools = detectTools();
console.log("tool        found");
for (const [name, found] of Object.entries(tools)) {
  console.log(`${name.padEnd(11)} ${found ? "yes" : "no"}`);
}

const blockers = [];
if (!tools.git) blockers.push("git is not installed: install git and re-run");
if (!tools.gh) blockers.push("gh is not installed: install the GitHub CLI and run gh auth login");
else if (!tools.ghLoggedIn) blockers.push("gh is not logged in: run gh auth login");
console.log("Asana connector: enable the Asana MCP connector in Claude settings (cannot be detected here)");

if (blockers.length > 0) {
  for (const line of blockers) console.error(`blocker: ${line}`);
  process.exit(1);
}

const config = {
  worktreeRoot: path.join(process.cwd(), "..", ".worktrees"),
  worktreeBackend: tools.orca ? "orca" : "git",
  workerBackend: "claude",
  devPortStart: 8082,
  repos: {},
};
saveConfig(config);
console.log(`config written: ${configPath()}`);
console.log(JSON.stringify(config, null, 2));
