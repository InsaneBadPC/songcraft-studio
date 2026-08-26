// @ts-nocheck -- tato část se kompiluje Deno runtimem Supabase, nikoli bundlerem Expo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const truncate = (value: string | null | undefined, limit: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "cover";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Použij POST požadavek." }, 405);
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !url || !anonKey) return json({ error: "Chybí bezpečné připojení k externímu cloudu." }, 401);
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? anonKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Neplatné přihlášení." }, 401);

  const input = await request.json().catch(() => null) as { action?: "create" | "check"; entityType?: "song" | "lyric" | "album"; entityId?: string; jobId?: string; format?: "youtube_16_9"; userNote?: string | null } | null;
  if (!input?.action || !input.entityType || !input.entityId) return json({ error: "Chybí skladba nebo akce." }, 400);
  const isAlbum = input.entityType === "album";
  const table = input.entityType === "song" ? "sc_songs" : input.entityType === "album" ? "sc_albums" : "sc_lyrics";
  const { data: entity, error: entityError } = await admin.from(table).select(isAlbum ? "id,name,title:description,cover_path" : "id,title,style_prompt,lyrics,album_id").eq("id", input.entityId).eq("user_id", user.id).single();
  if (entityError || !entity) return json({ error: "Položka nebyla nalezena." }, 404);
  let entityTitle: string;
  let stylePrompt: string | null = null;
  let lyrics: string | null = null;
  let albumName: string;
  if (isAlbum) {
    entityTitle = truncate((entity as any).name ?? (entity as any).title, 150) || "Album";
    stylePrompt = truncate((entity as any).title ?? "", 600) || null; // u alba nese description kreativní zadání
    lyrics = null;
    albumName = entityTitle;
  } else {
    entityTitle = truncate(entity.title, 150);
    stylePrompt = truncate(entity.style_prompt, 600);
    lyrics = entity.lyrics;
    const { data: album } = (entity as any).album_id ? await admin.from("sc_albums").select("name").eq("id", (entity as any).album_id).maybeSingle() : { data: null };
    albumName = album?.name || "Bez alba";
  }
  const youtubeCover = input.format === "youtube_16_9";

  // Kontrola stavu existující úlohy skládání (po předání do GitHub Actions).
  if (input.action === "check" && input.jobId) {
    const { data: job } = await admin.from("sc_cover_jobs").select("id,user_id,status,cover_path,error").eq("id", input.jobId).single();
    if (job && job.user_id === user.id) {
      if (job.status === "failed") return json({ status: "failed", error: job.error || "Skládání obalu selhalo." });
      if (job.status !== "completed" || !job.cover_path) return json({ status: "processing", message: "Bezplatný renderer skládá 16:9 obal…" });
      return json({ status: "completed", coverPath: job.cover_path });
    }
    // jinak jde o první kontrolu AI Horde úlohy
  }

  if (input.action === "create") {
    const formatInstruction = youtubeCover ? "Create a cinematic square music visual with a strong centered subject; the app will turn it into a wide 16:9 YouTube cover and add a title." : isAlbum ? "Create a square music album cover with strong artistic identity for the release." : "Create a square album cover.";
    const subjectLine = isAlbum
      ? `Czech music album by Temney. Album title: "${entityTitle}". Creative direction: ${truncate(stylePrompt, 600) || "instrumental collection without lyrics"}. Optional creative direction: ${truncate(input.userNote, 600) || "none"}.`
      : `Czech song by Temney. Song title: "${entityTitle}". Album: "${truncate(albumName, 120)}". Mood and music direction: ${truncate(stylePrompt, 600) || "original Czech song"}. Lyrical atmosphere: ${truncate(lyrics, 1200)}. Optional creative direction: ${truncate(input.userNote, 600) || "none"}.`;
    const prompt = `${formatInstruction} ${subjectLine} Premium expressive artwork, one clear visual subject, rich texture, no lettering, no words, no logos, no watermark.`;
    const response = await fetch("https://aihorde.net/api/v2/generate/async", { method: "POST", headers: { "Content-Type": "application/json", apikey: "0000000000", "Client-Agent": "SongCraftStudio:1.1" }, body: JSON.stringify({ prompt, params: { width: 512, height: 512, steps: 16, cfg_scale: 6.5, n: 1 }, nsfw: false, censor_nsfw: true, trusted_workers: false, shared: false, r2: true }) });
    const data = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (!response.ok || !data?.id) return json({ error: data?.message || "Bezplatná AI nyní nemůže přijmout generování." }, 502);
    return json({ jobId: data.id, message: "Obal se připravuje v bezplatné cloudové frontě." });
  }

  if (input.action === "check") {
    if (!input.jobId) return json({ error: "Chybí identifikátor generování." }, 400);
    const response = await fetch(`https://aihorde.net/api/v2/generate/status/${encodeURIComponent(input.jobId)}`, { headers: { apikey: "0000000000", "Client-Agent": "SongCraftStudio:1.1" } });
    const data = await response.json().catch(() => null) as { done?: boolean; faulted?: boolean; generations?: Array<{ img?: string }> } | null;
    if (!response.ok || !data) return json({ error: "Stav generování se nepodařilo načíst." }, 502);
    if (data.faulted) return json({ status: "failed", error: "Bezplatná AI generování nedokončila. Zkus ho spustit znovu." });
    if (!data.done) return json({ status: "processing" });
    const source = data.generations?.[0]?.img;
    if (!source) return json({ status: "failed", error: "Bezplatná AI nevrátila obrázek." });

    let imageBytes: Uint8Array;
    let imageMime = "image/webp";
    try {
      const dataUri = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(source);
      if (dataUri) {
        imageMime = dataUri[1];
        imageBytes = Uint8Array.from(atob(dataUri[2]), (character) => character.charCodeAt(0));
      } else if (/^https:\/\//i.test(source)) {
        const imageResponse = await fetch(source);
        const mime = imageResponse.headers.get("content-type")?.split(";")[0] || "image/webp";
        if (!imageResponse.ok || !mime.startsWith("image/")) throw new Error("download");
        imageMime = mime;
        imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
      } else {
        imageBytes = Uint8Array.from(atob(source), (character) => character.charCodeAt(0));
      }
    } catch {
      return json({ status: "failed", error: "Výsledný obrázek se nepodařilo načíst." });
    }

    // Čtvercový formát: uložit rovnou.
    if (!youtubeCover) {
      const path = `${user.id}/covers/generated/${input.entityType}-${safe(entityTitle)}-${crypto.randomUUID()}.${imageMime.includes("png") ? "png" : imageMime.includes("jpeg") ? "jpg" : "webp"}`;
      const { error: uploadError } = await supabase.storage.from("songcraft").upload(path, imageBytes, { contentType: imageMime, upsert: false });
      if (uploadError) return json({ status: "failed", error: uploadError.message });
      const { error: updateError } = await admin.from(table).update({ cover_path: path }).eq("id", input.entityId).eq("user_id", user.id);
      if (updateError) return json({ status: "failed", error: updateError.message });
      return json({ status: "completed", coverPath: path });
    }

    // 16:9: surový obrázek uložíme a složení přenecháme bezplatnému GitHub rendereru.
    const rawPath = `${user.id}/covers/raw/${safe(entityTitle)}-${crypto.randomUUID()}.${imageMime.includes("png") ? "png" : imageMime.includes("jpeg") ? "jpg" : "webp"}`;
    const { error: rawUploadError } = await supabase.storage.from("songcraft").upload(rawPath, imageBytes, { contentType: imageMime, upsert: false });
    if (rawUploadError) return json({ status: "failed", error: rawUploadError.message });

    const githubToken = Deno.env.get("GH_DISPATCH_TOKEN");
    if (!githubToken) return json({ status: "failed", error: "Renderer obalů není správně nakonfigurován." });

    await admin.from("sc_cover_jobs").upsert({ id: input.jobId, user_id: user.id, entity_type: input.entityType, entity_id: input.entityId, title: entityTitle, album_name: albumName, status: "processing", updated_at: new Date().toISOString() });

    const dispatch = await fetch(`https://api.github.com/repos/InsaneBadPC/songcraft-studio/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({
        event_type: "compose-cover",
        client_payload: { jobId: input.jobId, entityType: input.entityType, entityId: input.entityId, title: entityTitle, albumName, rawPath },
      }),
    });
    if (!dispatch.ok && dispatch.status !== 204) {
      await admin.from("sc_cover_jobs").update({ status: "failed", error: `Skládání se nepodařilo spustit (${dispatch.status}).` }).eq("id", input.jobId);
      return json({ status: "failed", error: `Skládání obalu se nepodařilo spustit (${dispatch.status}).` });
    }
    return json({ status: "processing", message: "Bezplatný renderer skládá 16:9 obal…" });
  }

  return json({ error: "Neznámá akce." }, 400);
});
