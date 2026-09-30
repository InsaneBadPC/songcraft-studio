#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const workflowPath = path.join(root, ".github/workflows/deploy-agent-orchestrator.yml");
const sourcePath = path.join(root, "supabase/functions/agent-orchestrator/index.ts");
const workflow = readFileSync(workflowPath, "utf8");
const source = readFileSync(sourcePath, "utf8");
const requiredWorkflow = [
  "supabase/setup-cli@v3",
  "supabase functions deploy agent-orchestrator",
  "database/query",
  "20260925000000_agent_video_render_types.sql",
  "secrets.SUPABASE_ACCESS_TOKEN",
  "vars.SUPABASE_PROJECT_ID",
  "supabase/migrations/**",
  "vars.SUPABASE_URL",
  "vars.SUPABASE_ANON_KEY",
  "secrets.SUPABASE_SERVICE_ROLE_KEY",
  "secrets.GOOGLE_AI_STUDIO_KEY",
  "SONGCRAFT_SUPABASE_URL",
  "SONGCRAFT_SUPABASE_ANON_KEY",
  "SONGCRAFT_SERVICE_ROLE_KEY",
  "supabase secrets set",
  "supabase secrets list",
  "version: 2.117.0",
  "workflow_dispatch",
];
const requiredSource = [
  "Deno.serve",
  'name: "render_video"',
  '"image_animation"',
  '"full_scenes"',
];
const missing = [
  ...requiredWorkflow.filter((value) => !workflow.includes(value)),
  ...requiredSource.filter((value) => !source.includes(value)),
];
if (/\bsbp_[A-Za-z0-9_-]{20,}\b/.test(workflow)) missing.push("workflow contains an access-token literal");
if (missing.length) {
  console.error(`Missing deploy contract: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("edge deployment contract verification passed");
