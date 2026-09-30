#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const video = path.resolve(root, "../ai-video-generator");
function run(name, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe", timeout: 180_000 });
  if (result.error || result.status !== 0) throw new Error(`${name} failed`);
}
const edgeSource = (await import("node:fs/promises")).readFile;
const edgeText = await edgeSource(path.join(root, "supabase/functions/agent-orchestrator/index.ts"), "utf8");
for (const required of ["SONGCRAFT_SUPABASE_URL", "SONGCRAFT_SUPABASE_ANON_KEY", "SONGCRAFT_SERVICE_ROLE_KEY", "if (!authorization) return json({ error: \"Neplatné přihlášení.\" }, 401);"]) {
  if (!edgeText.includes(required)) throw new Error(`edge source contract missing ${required}`);
}
const migration = await edgeSource(path.join(root, "supabase/migrations/20260925000000_agent_video_render_types.sql"), "utf8");
for (const required of ["image_animation", "full_scenes", "agent_videos_type_check"]) if (!migration.includes(required)) throw new Error(`migration contract missing ${required}`);
run("worker syntax", "node", ["--check", "workers/video-renderer/worker.mjs"], root);
run("dashboard syntax", "python", ["-m", "py_compile", "dashboard/server.py"], video);
run("dashboard diff", "git", ["diff", "--check"], video);
run("studio diff", "git", ["diff", "--check"], root);
run("studio typecheck", "pnpm", ["check"], root);
run("studio focused tests", "pnpm", ["exec", "vitest", "run", "tests/songcraft-schema.test.ts", "tests/assistant-chat.test.ts", "tests/czech-rhymes.test.ts"], root);
run("video pipeline tests", "python", ["-m", "pytest", "-q", "tests/test_pipeline.py"], video);
console.log("source verification passed");
