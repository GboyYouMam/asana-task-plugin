import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILL = path.resolve("skills/asana-task/SKILL.md");
const REFS = path.resolve("skills/asana-task/references");

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "frontmatter present");
  return Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
}

test("SKILL.md frontmatter names the skill and triggers on Asana links", () => {
  const fm = frontmatter(fs.readFileSync(SKILL, "utf8"));
  assert.equal(fm.name, "asana-task");
  assert.match(fm.description, /app\.asana\.com/);
});

test("SKILL.md references every bin script", () => {
  const text = fs.readFileSync(SKILL, "utf8");
  for (const bin of ["asana-task-setup.js", "asana-task-profile.js", "asana-task-brief.js", "asana-task-allow-push.js"]) {
    assert.ok(text.includes(bin), bin);
  }
});

test("skill text carries no machine paths or tool UUIDs", () => {
  const files = [SKILL, ...fs.readdirSync(REFS).map((f) => path.join(REFS, f))];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /C:\/Users\//, file);
    assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-/, file);
  }
});

test("every hooks-only span is closed and mentions the guard or hook", () => {
  const lines = fs.readFileSync(SKILL, "utf8").split("\n").filter((l) => l.includes("<!-- hooks-only -->"));
  assert.ok(lines.length >= 3, "at least three hooks-only lines");
  for (const l of lines) {
    assert.ok(l.includes("<!-- /hooks-only -->"), `unclosed span: ${l}`);
    assert.match(l.slice(l.indexOf("<!-- hooks-only -->")), /guard|hook/i, l);
  }
});

test("references exist: profile-schema, fallback-rules, backends", () => {
  for (const f of ["profile-schema.md", "fallback-rules.md", "backends.md"]) {
    assert.ok(fs.existsSync(path.join(REFS, f)), f);
  }
  const fallback = fs.readFileSync(path.join(REFS, "fallback-rules.md"), "utf8").split("\n").length;
  assert.ok(fallback <= 60, `fallback-rules.md is ${fallback} lines, max 60`);
});
