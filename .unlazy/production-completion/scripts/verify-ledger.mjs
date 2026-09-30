#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const checker = "/data/data/com.termux/files/home/.opencode/skills/unlazy/scripts/gate-check.mjs";
const ledger = path.join(root, ".unlazy/production-completion/GATES.md");
const result = spawnSync("node", [checker, "--status", ledger], { cwd: root, encoding: "utf8" });
const output = `${result.stdout || ""}${result.stderr || ""}`;
if (result.error || ![0, 1].includes(result.status) || !/GATES\.md: \d+ gates/.test(output)) {
  process.exit(1);
}
console.log("gate ledger validation passed");
