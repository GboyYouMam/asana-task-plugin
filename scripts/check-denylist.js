#!/usr/bin/env node
// Fails CI when any denylisted word appears in the repository.
// The denylist itself lives outside the repo (ASANA_TASK_DENYLIST = path to a
// newline-separated file) so the list of words never becomes a leak on its own.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRS = new Set([".git", "node_modules", ".superpowers"]);

export function scan(words, files) {
  const needles = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (needles.length === 0) return [];
  const hits = [];
  for (const [file, content] of Object.entries(files)) {
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      for (const needle of needles) {
        if (lower.includes(needle)) hits.push(`${file}:${i + 1} ${needle}`);
      }
    });
  }
  return hits;
}

function collectFiles(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(root, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  };
  walk(root);
  return out;
}

function main() {
  const listPath = process.env.ASANA_TASK_DENYLIST;
  if (!listPath) {
    console.log("denylist: skipped (ASANA_TASK_DENYLIST not set)");
    return 0;
  }
  const words = fs.readFileSync(listPath, "utf8").split(/\r?\n/);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const hits = scan(words, collectFiles(root));
  if (hits.length === 0) {
    console.log("denylist: clean");
    return 0;
  }
  for (const hit of hits) console.error(hit);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
