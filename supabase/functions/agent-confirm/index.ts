import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isAllowedPrivateUser, privateAccessMessage } from "../_shared/access.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

/**
 * Explicit confirmation boundary. The token is forwarded over the internal
 * Supabase Functions call but never logged, persisted, or accepted as a
 * service-role credential. The youtube-publish function performs the atomic
 * nonce claim and all ownership/metadata checks.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Použij POST." }, 405);
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("SONGCRAFT_SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SONGCRAFT_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json({ error: "Chybí konfigurace serveru (SUPABASE_URL / SUPABASE_ANON_KEY)." }, 503);
  if (!authorization) return json({ error: "Chybí přihlášení." }, 401);

  const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return json({ error: "Neplatné přihlášení." }, 401);
  if (!isAllowedPrivateUser(user, { allowedUserIds: Deno.env.get("SONGCRAFT_ALLOWED_USER_IDS") ?? undefined, allowedEmails: Deno.env.get("SONGCRAFT_ALLOWED_EMAILS") ?? undefined })) return json({ error: privateAccessMessage() }, 403);
  const input = await request.json().catch(() => null) as { action?: unknown; confirmationId?: unknown; confirmationToken?: unknown } | null;
  if (input?.action !== "publish_to_youtube") return json({ error: "Tato potvrzovací akce zatím není podporována." }, 400);
  if (typeof input.confirmationId !== "string" || typeof input.confirmationToken !== "string") return json({ error: "Chybí confirmationId nebo confirmationToken." }, 400);

  const response = await fetch(`${url}/functions/v1/youtube-publish`, {
    method: "POST",
    headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ confirmationId: input.confirmationId, confirmationToken: input.confirmationToken }),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const body = await response.json().catch(() => ({ error: "Potvrzovací služba vrátila neplatnou odpověď." }));
  return json(body, response.status);
});
