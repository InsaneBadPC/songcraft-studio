import { writeFile } from "node:fs/promises";

const source = `import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const apiKey = "ffmpeg_site_default_key_KMjbZwflfRk4tarLAf7gQHGg";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const rendererError = (status: number, data: { error?: string; message?: string } | null, fallback: string) => json({ error: data?.error || data?.message || fallback }, status);
const apiHeaders = { "Content-Type": "application/json", "X-API-Key": apiKey };

async function addTitle(videoUrl: string, title: string) {
  const response = await fetch("https://ffmpegapi.net/api/videos/add-text-overlay-captions", { method: "POST", headers: apiHeaders, body: JSON.stringify({ video_url: videoUrl, text: "Temney\\n" + title.slice(0, 150), subtitle_style: "plain-white", aspect_ratio: "16:9", position: "bottom", duration_per_line: 999 }) });
  const data = await response.json().catch(() => null) as { success?: boolean; download_url?: string; error?: string; message?: string } | null;
  if (!response.ok || !data?.success || !data.download_url) throw new Error(data?.error || data?.message || "Cloudový renderer nedokončil titulkovou vrstvu.");
  return data.download_url;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Použij POST požadavek." }, 405);
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL"); const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !url || !anonKey) return json({ error: "Chybí bezpečné připojení k externímu cloudu." }, 401);
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Neplatné přihlášení." }, 401);
  const input = await request.json().catch(() => null) as { action?: "create" | "check"; songId?: string; versionId?: string; jobId?: string } | null;
  if (!input?.action || !input.songId || !input.versionId) return json({ error: "Chybí skladba, finální MP3 nebo akce." }, 400);
  const { data: song, error: songError } = await supabase.from("sc_songs").select("id,title,cover_path,album_id").eq("id", input.songId).single();
  const { data: version, error: versionError } = await supabase.from("sc_audio_versions").select("id,song_id,storage_path,tagged_storage_path,is_final").eq("id", input.versionId).single();
  if (songError || !song || versionError || !version || version.song_id !== song.id) return json({ error: "Skladba nebo její MP3 verze nebyla nalezena." }, 404);
  if (!version.is_final) return json({ error: "Pro YouTube video nejdřív označ verzi jako finální." }, 400);
  let coverPath = song.cover_path as string | null;
  if (!coverPath && song.album_id) { const { data: album } = await supabase.from("sc_albums").select("cover_path").eq("id", song.album_id).single(); coverPath = album?.cover_path ?? null; }
  if (!coverPath) return json({ error: "Skladba ani album nemají přiřazený obrázek pro video." }, 400);

  if (input.action === "create") {
    const audioPath = (version.tagged_storage_path || version.storage_path) as string;
    const [coverResult, audioResult] = await Promise.all([supabase.storage.from("songcraft").createSignedUrl(coverPath, 3600), supabase.storage.from("songcraft").createSignedUrl(audioPath, 3600)]);
    if (coverResult.error || !coverResult.data?.signedUrl || audioResult.error || !audioResult.data?.signedUrl) return json({ error: coverResult.error?.message || audioResult.error?.message || "Nepodařilo se bezpečně připravit cover nebo MP3." }, 502);
    const response = await fetch("https://ffmpegapi.net/api/merge_image_audio", { method: "POST", headers: apiHeaders, body: JSON.stringify({ image_urls: [coverResult.data.signedUrl], audio_urls: [audioResult.data.signedUrl], dimensions: "1920x1080", zoom_effect: false, async: true }) });
    const data = await response.json().catch(() => null) as { success?: boolean; job_id?: string; download_url?: string; error?: string; message?: string } | null;
    if (!response.ok || !data?.success) return rendererError(response.status === 429 ? 429 : 502, data, "Cloudový renderer nyní nemůže přijmout video.");
    if (data.download_url) { try { return json({ status: "completed", url: await addTitle(data.download_url, song.title) }); } catch (error) { return json({ status: "failed", error: error instanceof Error ? error.message : "Titulkovou vrstvu se nepodařilo vytvořit." }); } }
    if (!data.job_id) return json({ error: "Cloudový renderer nevrátil identifikátor úlohy." }, 502);
    return json({ status: "processing", jobId: data.job_id, message: "Cloudový renderer vytváří Full HD MP4." });
  }

  if (input.action === "check") {
    if (!input.jobId) return json({ error: "Chybí identifikátor exportní úlohy." }, 400);
    const response = await fetch("https://ffmpegapi.net/api/job/" + encodeURIComponent(input.jobId) + "/status", { headers: { "X-API-Key": apiKey } });
    const data = await response.json().catch(() => null) as { success?: boolean; status?: string; download_url?: string; error?: string; message?: string } | null;
    if (!response.ok || !data?.success) return rendererError(response.status === 429 ? 429 : 502, data, "Stav cloudového videa se nepodařilo načíst.");
    if (data.status === "failed") return json({ status: "failed", error: data.error || data.message || "Cloudový renderer video nedokončil." });
    if (data.status !== "completed" || !data.download_url) return json({ status: "processing", message: "Cloudový renderer stále připravuje MP4." });
    try { return json({ status: "completed", url: await addTitle(data.download_url, song.title) }); }
    catch (error) { return json({ status: "failed", error: error instanceof Error ? error.message : "Titulkovou vrstvu se nepodařilo vytvořit." }); }
  }
  return json({ error: "Neznámá akce exportu." }, 400);
});`;

const definition = { project_id: "hfykngbhcxmnpxvjagoj", name: "songcraft-youtube", verify_jwt: true, entrypoint_path: "index.ts", files: [{ name: "index.ts", content: source }] };
await writeFile(new URL("../supabase_songcraft_youtube_function.json", import.meta.url), `${JSON.stringify(definition, null, 2)}\n`);
console.log("Definice cloudového YouTube exportu je připravena.");
