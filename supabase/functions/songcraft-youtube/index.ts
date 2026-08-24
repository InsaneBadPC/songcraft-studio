import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const GITHUB_REPO = "InsaneBadPC/songcraft-studio";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Použij POST požadavek." }, 405);
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const githubToken = Deno.env.get("GH_DISPATCH_TOKEN");
  if (!authorization || !url || !anonKey || !serviceKey) return json({ error: "Chybí bezpečné připojení k externímu cloudu." }, 401);
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Neplatné přihlášení." }, 401);
  const input = await request.json().catch(() => null) as { action?: "create" | "check"; songId?: string; versionId?: string; jobId?: string } | null;
  if (!input?.action || !input.songId || !input.versionId) return json({ error: "Chybí skladba, finální MP3 nebo akce." }, 400);
  const admin = createClient(url, serviceKey);

  const { data: song, error: songError } = await admin.from("sc_songs").select("id,title,cover_path,album_id,user_id").eq("id", input.songId).single();
  const { data: version, error: versionError } = await admin.from("sc_audio_versions").select("id,song_id,storage_path,tagged_storage_path,is_final").eq("id", input.versionId).single();
  if (songError || !song || versionError || !version || version.song_id !== song.id) return json({ error: "Skladba nebo její MP3 verze nebyla nalezena." }, 404);
  if (song.user_id !== user.id) return json({ error: "Skladba nebo její MP3 verze nebyla nalezena." }, 404);
  if (!version.is_final) return json({ error: "Pro YouTube video nejdřív označ verzi jako finální." }, 400);
  let coverPath = song.cover_path as string | null;
  if (!coverPath && song.album_id) { const { data: album } = await admin.from("sc_albums").select("cover_path").eq("id", song.album_id).single(); coverPath = album?.cover_path ?? null; }
  if (!coverPath) return json({ error: "Skladba ani album nemají přiřazený obrázek pro video." }, 400);

  if (input.action === "create") {
    if (!githubToken) return json({ error: "Bezplatný renderer není správně nakonfigurován." }, 503);
    const jobId = crypto.randomUUID();
    const videoPath = `${user.id}/videos/${jobId}.mp4`;
    const { error: jobError } = await admin.from("sc_video_jobs").insert({ id: jobId, user_id: user.id, song_id: song.id, version_id: version.id, status: "processing", video_path: videoPath });
    if (jobError) return json({ error: `Renderovací úlohu se nepodařilo založit: ${jobError.message}` }, 502);
    const dispatch = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ event_type: "render-youtube", client_payload: { jobId, songId: song.id, versionId: version.id } }),
    });
    if (!dispatch.ok && dispatch.status !== 204) {
      await admin.from("sc_video_jobs").update({ status: "failed", error: `Render se nepodařilo spustit (${dispatch.status}).` }).eq("id", jobId);
      return json({ error: `Bezplatný renderer se nepodařilo spustit (${dispatch.status}).` }, 502);
    }
    return json({ status: "processing", jobId, message: "Bezplatný GitHub renderer vytváří Full HD MP4." });
  }

  if (input.action === "check") {
    if (!input.jobId) return json({ error: "Chybí identifikátor exportní úlohy." }, 400);
    const { data: job, error: jobError } = await admin.from("sc_video_jobs").select("id,user_id,status,video_path,error,created_at").eq("id", input.jobId).single();
    if (jobError || !job || job.user_id !== user.id) return json({ error: "Exportní úloha nebyla nalezena." }, 404);
    if (job.status === "failed") return json({ status: "failed", error: job.error || "Renderer video nedokončil." });
    if (job.status !== "completed" || !job.video_path) {
      const ageMinutes = (Date.now() - new Date(job.created_at).getTime()) / 60_000;
      if (ageMinutes > 20) return json({ status: "failed", error: "Renderer video v rozumné době nedokončil. Zkus export spustit znovu." });
      return json({ status: "processing", jobId: job.id, message: "Bezplatný renderer stále připravuje MP4." });
    }
    const signed = await admin.storage.from("songcraft").createSignedUrl(job.video_path, 3600);
    if (signed.error || !signed.data?.signedUrl) return json({ status: "failed", error: signed.error?.message || "Hotové video se nepodařilo otevřít." });
    return json({ status: "completed", url: signed.data.signedUrl });
  }

  return json({ error: "Neznámá akce exportu." }, 400);
});
