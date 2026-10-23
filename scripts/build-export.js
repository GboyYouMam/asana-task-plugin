#!/usr/bin/env node
// Builds export/ from the canonical skill: a Codex-compatible skill folder (hook-dependent
// sentences removed) and a Cursor-compatible hooks snippet. The plugin is the source of truth;
// never edit export/ by hand.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "<!-- hooks-only -->";
const SPAN_RE = /\s*<!-- hooks-only -->[\s\S]*?<!-- \/hooks-only -->/g;

function copyTree(from, to, onFile) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst, onFile);
    else onFile(src, dst);
  }
}

/** @returns {{ files: string[], strippedLines: number }} */
export function buildExport(skillDir, outDir) {
  const files = [];
  let strippedLines = 0;
  const codexSkill = path.join(outDir, "codex", "skills", "asana-task");
  fs.rmSync(path.join(outDir, "codex"), { recursive: true, force: true });
  copyTree(skillDir, codexSkill, (src, dst) => {
    let text = fs.readFileSync(src, "utf8");
    if (src.endsWith(".md")) {
      // Inline spans `<!-- hooks-only -->…<!-- /hooks-only -->` lose only the span; a line carrying
      // the bare marker and no closing tag is hook-only as a whole and is dropped.
      const kept = [];
      for (const line of text.split("\n")) {
        if (SPAN_RE.test(line)) {
          strippedLines++;
          kept.push(line.replace(SPAN_RE, ""));
        } else if (line.includes(MARKER)) {
          strippedLines++;
        } else {
          kept.push(line);
        }
        SPAN_RE.lastIndex = 0;
      }
      text = kept.join("\n");
    }
    fs.writeFileSync(dst, text);
    files.push(dst);
  });

  const cursorDir = path.join(outDir, "cursor");
  fs.mkdirSync(cursorDir, { recursive: true });
  const snippet = {
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "node", args: ["<path to asana-task-plugin>/hooks/guard.js"], timeout: 10 }],
        },
      ],
    },
  };
  const snippetFile = path.join(cursorDir, "claude-hooks-snippet.json");
  fs.writeFileSync(snippetFile, JSON.stringify(snippet, null, 2) + "\n");
  files.push(snippetFile);
  return { files, strippedLines };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = buildExport(path.join(root, "skills", "asana-task"), path.join(root, "export"));
  console.log(`export: ${result.files.length} files, ${result.strippedLines} hook-only lines stripped`);
}
