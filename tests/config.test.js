import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dataDir } from "../lib/data-dir.js";
import { loadConfig, saveConfig } from "../lib/config.js";

function tmp(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asana-task-"));
  return path.join(dir, name);
}

beforeEach(() => {
  delete process.env.ASANA_TASK_DATA;
});

test("dataDir uses ASANA_TASK_DATA when set, even with spaces", () => {
  process.env.ASANA_TASK_DATA = path.join(os.tmpdir(), "a b", "data");
  assert.equal(dataDir(), process.env.ASANA_TASK_DATA);
});

test("dataDir falls back to ~/.claude/asana-task-data", () => {
  assert.equal(dataDir(), path.join(os.homedir(), ".claude", "asana-task-data"));
});

test("saveConfig then loadConfig round-trips and creates the directory", () => {
  process.env.ASANA_TASK_DATA = tmp("with space/data");
  const config = {
    worktreeRoot: "C:/w t/.worktrees",
    worktreeBackend: "git",
    workerBackend: "claude",
    devPortStart: 8082,
    repos: { "github.com/owner/example-app": { devPort: 8090 } },
  };
  saveConfig(config);
  assert.ok(fs.existsSync(path.join(process.env.ASANA_TASK_DATA, "config.json")));
  assert.deepEqual(loadConfig(), config);
});

test("loadConfig returns null when no config.json", () => {
  process.env.ASANA_TASK_DATA = tmp("empty");
  assert.equal(loadConfig(), null);
});
