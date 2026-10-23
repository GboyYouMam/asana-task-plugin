#!/usr/bin/env node
// PreToolUse entrypoint. Reads the hook JSON on stdin, decides via lib/guard-rules.js,
// and is inert (exit 0, no output) unless a task brief exists for cwd's repo and branch.
// Any internal error also exits 0: the guard must never break the user's shell.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { repoKey } from "../lib/repo-key.js";
import { currentBranch, hasBrief } from "../lib/brief.js";
import { hasGrant, consumePush } from "../lib/grants.js";
import { loadProfile } from "../lib/profile.js";
import { evaluate } from "../lib/guard-rules.js";

function git(cwd, args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}

function main() {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const cwd = input.cwd || process.cwd();
  const branch = currentBranch(cwd);
  if (!branch) return 0;
  const key = repoKey(cwd);
  const active = hasBrief(key, branch);
  if (!active) return 0;

  const profile = loadProfile(key);
  const forbidden = (profile?.sections["Forbidden diffs"] ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("("));

  const decision = evaluate(input, {
    active,
    branch,
    hasGrant: () => hasGrant(key, branch),
    forbidden,
    stagedPaths: () => git(cwd, ["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean),
    stagedDiff: () => git(cwd, ["diff", "--cached"]),
  });

  // The grant is spent only when the whole command is allowed and contains a push.
  if (decision.kind === "allow" && decision.needsGrant) consumePush(key, branch);

  switch (decision.kind) {
    case "block":
      process.stderr.write(decision.reason + "\n");
      return 2;
    case "ask":
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: decision.reason } }));
      return 0;
    case "warn":
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: decision.context } }));
      return 0;
    default:
      return 0;
  }
}

try {
  process.exitCode = main();
} catch (error) {
  if (process.env.ASANA_TASK_DEBUG) process.stderr.write(`asana-task guard error: ${error.stack}\n`);
  process.exitCode = 0;
}
