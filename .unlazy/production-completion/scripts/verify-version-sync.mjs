#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";

const songcraft = path.resolve(import.meta.dirname, "../../..");
const video = path.resolve(songcraft, "../ai-video-generator");
function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }
function assertSync(cwd) {
  const head = git(cwd, ["rev-parse", "HEAD"]);
  const upstream = git(cwd, ["rev-parse", "@{upstream}"]);
  if (head !== upstream) throw new Error(`un synchronized HEAD in ${cwd}`);
  return head;
}
const allowedUntracked = new Set([".csweb-test/", ".supa.py", ".unlazy/"]);
const status = git(songcraft, ["status", "--porcelain=v1"]).split("\n").filter(Boolean);
const unexpected = status.filter((line) => ![...allowedUntracked].some((allowed) => line.endsWith(` ${allowed}`) || line.endsWith(` ${allowed}/`)));
if (unexpected.length) throw new Error(`unexpected tracked/untracked changes: ${unexpected.join(" | ")}`);
const videoStatus = git(video, ["status", "--porcelain=v1"]);
if (videoStatus) throw new Error("ai-video-generator has unexpected changes");
const songHead = assertSync(songcraft);
const videoHead = assertSync(video);
const workflow = git(songcraft, ["show", "HEAD:.github/workflows/deploy-agent-orchestrator.yml"]);
if (!workflow.includes("supabase functions deploy agent-orchestrator")) throw new Error("edge workflow is not committed");
if (!git(songcraft, ["show", "HEAD:supabase/functions/agent-orchestrator/index.ts"]).includes('"image_animation"')) throw new Error("orchestrator animation support is not committed");
if (!git(video, ["show", "HEAD:deploy/video-agent-dashboard.service"]).includes("ReadWritePaths=/opt/video-agent/queue /opt/video-agent/state /opt/video-agent/logs /tmp")) throw new Error("VM service fix is not committed");
console.log(`repository synchronization verification passed songcraft=${songHead.slice(0, 7)} video=${videoHead.slice(0, 7)}`);
