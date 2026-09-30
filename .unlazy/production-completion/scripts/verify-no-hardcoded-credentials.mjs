#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "../../..");
const tempRoots = [
  "/data/data/com.termux/files/usr/tmp/opencode/stack",
  "/data/data/com.termux/files/usr/tmp/opencode/deploy-songcraft",
];
const extensions = new Set([".py", ".mjs", ".js", ".sh", ".ts", ".tsx", ".yml", ".yaml"]);
const rules = [
  ["embedded Supabase personal access token", /\bsbp_[A-Za-z0-9_-]{20,}\b/],
  ["literal account password", /\b(?:password|PASSWORD)\s*[:=]\s*["'][^"']{6,}["']/],
  ["embedded service-role key", /\b(?:SUPABASE_SERVICE_ROLE_KEY|service_role)\s*[:=]\s*["']eyJ[A-Za-z0-9_-]{20,}/],
];

function walk(root) {
  const result = [];
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    if ([".git", "node_modules", ".csweb-test", "__pycache__"].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (extensions.has(path.extname(entry.name))) result.push(full);
  }
  return result;
}

function files() {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" })
    .split("\0").filter(Boolean).filter((file) => extensions.has(path.extname(file)))
    .map((file) => path.join(repo, file));
  return [...new Set([...tracked, ...tempRoots.flatMap(walk)])];
}

function scan(paths) {
  const violations = [];
  for (const file of paths) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const [name, expression] of rules) {
      if (expression.test(text)) violations.push(`${file}: ${name}`);
    }
  }
  return violations;
}

if (process.argv.includes("--self-test")) {
  const fixture = "/data/data/com.termux/files/usr/tmp/opencode/credential-scan-fixture.py";
  writeFileSync(fixture, `TOKEN = "sbp_${"Z".repeat(24)}"\npassword = "fixture-password"\n`);
  const detected = scan([fixture]).length >= 2;
  unlinkSync(fixture);
  if (!detected) throw new Error("credential scanner positive control failed");
  console.log("credential scanner positive control passed");
  process.exit(0);
}

const violations = scan(files());
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("credential hygiene verification passed");
