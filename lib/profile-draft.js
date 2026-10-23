import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_MAP = {
  test: "test",
  typecheck: "typecheck",
  "check-types": "typecheck",
  lint: "lint",
  start: "dev server",
  dev: "dev server",
};
const UI_DEPS = ["react", "vue", "next", "svelte", "@angular/core"];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function branches(cwd) {
  const r = spawnSync("git", ["-C", cwd, "branch", "-a", "--format=%(refname:short)"], { encoding: "utf8" });
  if (r.status !== 0) return [];
  return r.stdout.split(/\r?\n/).map((b) => b.replace(/^origin\//, "").trim()).filter(Boolean);
}

function hooksMentionNpmCi(cwd) {
  const dir = path.join(cwd, ".husky");
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((f) => {
    const full = path.join(dir, f);
    return fs.statSync(full).isFile() && /npm ci/.test(fs.readFileSync(full, "utf8"));
  });
}

/** Builds a best-effort profile from what the repository itself reveals. Never writes. */
export function draftProfile(cwd) {
  const pkg = readJson(path.join(cwd, "package.json")) ?? {};
  const scripts = pkg.scripts ?? {};
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const all = branches(cwd);

  const commands = [];
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) commands.push("install: npm ci");
  else if (pkg.name) commands.push("install: npm install");
  for (const [script, label] of Object.entries(SCRIPT_MAP)) {
    if (!(script in scripts)) continue;
    const cmd = script === "test" || script === "start" ? `npm ${script}` : `npm run ${script}`;
    if (!commands.some((c) => c.startsWith(`${label}:`))) commands.push(`${label}: ${cmd}`);
  }

  const base = all.includes("main") ? "main" : all.includes("master") ? "master" : "main";
  const repo = [`default base: ${base}`];
  const clientPrefixes = new Set(all.map((b) => b.match(/^([a-z]+)\/.+-uat$/)?.[1]).filter(Boolean));
  for (const prefix of clientPrefixes) repo.push(`client branches: ${prefix}/<name>-uat (map the ticket's client field to <name>)`);

  const routing = [];
  for (const f of ["AGENTS.md", "CLAUDE.md"]) if (fs.existsSync(path.join(cwd, f))) routing.push(`read ${f} first`);
  if (fs.existsSync(path.join(cwd, "docs", "agent-routing.md"))) routing.push("code path → docs: docs/agent-routing.md");

  const qa = UI_DEPS.some((d) => d in deps) ? "browser" : "query-path";
  const forbidden = hooksMentionNpmCi(cwd) || "lint-staged" in pkg ? ["package-lock.json"] : [];

  const sections = {
    Repo: repo.join("\n") + "\n",
    Commands: commands.join("\n") + "\n",
    Routing: (routing.join("\n") || "(none found)") + "\n",
    QA: `${qa}\n`,
    "Forbidden diffs": (forbidden.join("\n") || "(none)") + "\n",
    "Deploy check": "(fill in: how to tell a base branch is deployed)\n",
  };
  return { sections, traps: [], order: ["Repo", "Commands", "Routing", "QA", "Forbidden diffs", "Traps", "Deploy check"] };
}
