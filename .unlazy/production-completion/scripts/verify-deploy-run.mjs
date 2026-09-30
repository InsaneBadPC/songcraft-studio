#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const repo = process.env.GITHUB_REPOSITORY || "InsaneBadPC/songcraft-studio";
const branch = "dev/ai-manager-studio";
const localHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const raw = execFileSync("gh", ["run", "list", "--repo", repo, "--workflow", "deploy-agent-orchestrator.yml", "--branch", branch, "--limit", "1", "--json", "status,conclusion,headSha,event"], { encoding: "utf8" });
const runs = JSON.parse(raw);
const run = runs[0];
if (!run || run.status !== "completed" || run.conclusion !== "success") {
  console.error(`Latest edge workflow is not successful: ${run ? `${run.status}/${run.conclusion}` : "not found"}`);
  process.exit(1);
}
if (run.headSha !== localHead) {
  console.error("Latest edge workflow does not match the local HEAD");
  process.exit(1);
}
console.log("edge deployment workflow verification passed");
