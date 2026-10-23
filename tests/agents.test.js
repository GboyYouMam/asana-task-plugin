import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const AGENTS = path.resolve("agents");

function load(name) {
  const text = fs.readFileSync(path.join(AGENTS, `${name}.md`), "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${name}: frontmatter`);
  const fm = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  return { fm, body: m[2] };
}
const tools = (fm) => fm.tools.split(",").map((t) => t.trim());

test("scout: read-only git/gh tools and the verdict headings", () => {
  const { fm, body } = load("scout");
  assert.equal(fm.name, "scout");
  assert.ok(fm.description);
  for (const t of tools(fm)) assert.ok(["Bash", "Read", "Grep", "Glob"].includes(t), t);
  for (const h of ["## Existing PRs", "## Commits on suspect files", "## Client vs main verdict", "## Recommendation"]) assert.ok(body.includes(h), h);
  assert.match(body, /client-only \| shared \| already-fixed-on-main/);
});

test("reviewer: read tools and ranked headings", () => {
  const { fm, body } = load("reviewer");
  for (const t of tools(fm)) assert.ok(["Read", "Grep", "Glob", "Bash"].includes(t), t);
  for (const h of ["## Blockers", "## Should fix", "## Cosmetic", "## Environment noise"]) assert.ok(body.includes(h), h);
});

test("qa: sonnet model and verdict contract", () => {
  const { fm, body } = load("qa");
  assert.equal(fm.model, "sonnet");
  for (const h of ["## Verdicts", "## Regression pass", "## Console/network errors"]) assert.ok(body.includes(h), h);
  assert.match(body, /QA SKIPPED:/);
});
