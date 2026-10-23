import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildExport } from "../scripts/build-export.js";

test("buildExport strips hooks-only lines, copies references, writes the cursor snippet", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "asana-task-src-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "asana-task-out-"));
  fs.mkdirSync(path.join(src, "references"));
  fs.writeFileSync(path.join(src, "SKILL.md"), "---\nname: asana-task\n---\nkeep\n- the hook blocks it <!-- hooks-only -->\nalso keep\n");
  fs.writeFileSync(path.join(src, "references", "a.md"), "ref\n");

  const result = buildExport(src, out);

  const skill = fs.readFileSync(path.join(out, "codex", "skills", "asana-task", "SKILL.md"), "utf8");
  assert.equal(skill, "---\nname: asana-task\n---\nkeep\nalso keep\n");
  assert.equal(fs.readFileSync(path.join(out, "codex", "skills", "asana-task", "references", "a.md"), "utf8"), "ref\n");
  const snippet = JSON.parse(fs.readFileSync(path.join(out, "cursor", "claude-hooks-snippet.json"), "utf8"));
  assert.ok(snippet.hooks.PreToolUse, "PreToolUse present");
  assert.match(JSON.stringify(snippet), /guard\.js/);
  assert.equal(result.strippedLines, 1);
  assert.ok(result.files.length >= 3);
});
