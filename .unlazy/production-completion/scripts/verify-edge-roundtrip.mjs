#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
function localEnv() {
  const result = { ...process.env };
  try {
    for (const line of readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match) continue;
      const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
      if (!result[match[1]]) result[match[1]] = value;
    }
  } catch {}
  return result;
}
const env = localEnv();
const url = env.SUPABASE_URL || readFileSync(path.join(root, "lib/supabase.ts"), "utf8").match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0];
const anon = env.SUPABASE_ANON_KEY || readFileSync(path.join(root, "lib/supabase.ts"), "utf8").match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
const password = env.SONGCRAFT_TEMNEY_PASSWORD;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !password || !service) throw new Error("required local Supabase configuration is missing");

const unauthorized = await fetch(`${url}/functions/v1/agent-orchestrator`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ message: "health check" }),
});
if (unauthorized.status !== 401) throw new Error(`unauthenticated edge status ${unauthorized.status}`);

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: env.SONGCRAFT_TEST_EMAIL || "temney@songcraft.test", password }),
});
if (!login.ok) throw new Error(`login status ${login.status}`);
const session = await login.json();
const userHeaders = { apikey: anon, Authorization: `Bearer ${session.access_token}` };
const response = await fetch(`${url}/functions/v1/agent-orchestrator`, {
  method: "POST",
  headers: { ...userHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Použij nástroj list_songs a vrať mi jen stručný počet skladeb." }),
  signal: AbortSignal.timeout(120_000),
});
if (!response.ok) throw new Error(`edge status ${response.status}`);
const body = await response.json();
if (typeof body.answer !== "string" || body.answer.length < 1) throw new Error("edge response has no answer");
const rest = `${url}/rest/v1/agent_action_log?action_type=eq.list_songs&user_id=eq.${encodeURIComponent(session.user.id)}&order=created_at.desc&limit=1`;
const logResponse = await fetch(rest, { headers: userHeaders });
if (!logResponse.ok) throw new Error(`action log status ${logResponse.status}`);
const logs = await logResponse.json();
if (!Array.isArray(logs) || logs[0]?.result !== "success") throw new Error("list_songs tool was not logged as successful");
console.log(`production edge roundtrip verification passed answer_chars=${body.answer.length}`);
