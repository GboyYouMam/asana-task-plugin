import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildExport } from "../scripts/build-export.js";

test("buildExport strips hook-only lines and inline spans, copies references, writes the cursor snippet", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "asana-task-src-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "asana-task-out-"));
  fs.mkdirSync(path.join(src, "references"));
  fs.writeFileSync(
    path.join(src, "SKILL.md"),
    "---\nname: asana-task\n---\nkeep\n- the hook blocks it <!-- hooks-only -->\n- Do not push until told.<!-- hooks-only --> The guard enforces this.<!-- /hooks-only -->\nalso keep\n",
  );
  fs.writeFileSync(path.join(src, "references", "a.md"), "ref\n");

  const result = buildExport(src, out);

  const skill = fs.readFileSync(path.join(out, "codex", "skills", "asana-task", "SKILL.md"), "utf8");
  assert.equal(skill, "---\nname: asana-task\n---\nkeep\n- Do not push until told.\nalso keep\n");
  assert.equal(fs.readFileSync(path.join(out, "codex", "skills", "asana-task", "references", "a.md"), "utf8"), "ref\n");
  const snippet = JSON.parse(fs.readFileSync(path.join(out, "cursor", "claude-hooks-snippet.json"), "utf8"));
  assert.ok(snippet.hooks.PreToolUse, "PreToolUse present");
  assert.match(JSON.stringify(snippet), /guard\.js/);
  assert.equal(result.strippedLines, 2);
  assert.ok(result.files.length >= 3);
});

test("the real export keeps the push gate, the git add rule and the PR-body rule", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "asana-task-real-"));
  buildExport(path.resolve("skills/asana-task"), out);
  const skill = fs.readFileSync(path.join(out, "codex", "skills", "asana-task", "SKILL.md"), "utf8");
  assert.match(skill, /Do not push until the user says so/);
  assert.match(skill, /explicit paths only/);
  assert.match(skill, /Body = ticket link only/);
  assert.match(skill, /Scripts live in the plugin/);
  assert.doesNotMatch(skill, /hooks-only/);
});
