// @ts-nocheck -- tato část se kompiluje Deno runtimem Supabase, nikoli bundlerem Expo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ImageMagick, MagickFormat, initializeImageMagick } from "npm:@imagemagick/magick-wasm@0.0.42";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const truncate = (value: string | null | undefined, limit: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "cover";
const xml = (value: string) => value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] ?? character);
const textLine = (value: string, length: number) => { const normalized = truncate(value, length + 1); return normalized.length > length ? `${normalized.slice(0, Math.max(0, length - 1)).trimEnd()}…` : normalized || "Bez alba"; };

const wasmBytes = await Deno.readFile(new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42")));
await initializeImageMagick(wasmBytes);

type ImageAsset = { bytes: Uint8Array; mime: string };

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function readGeneratedImage(value: string): Promise<ImageAsset> {
  const dataUri = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(value);
  if (dataUri) return { mime: dataUri[1], bytes: decodeBase64(dataUri[2]) };
  if (!/^https:\/\//i.test(value)) return { mime: "image/webp", bytes: decodeBase64(value) };
  const response = await fetch(value);
  const mime = response.headers.get("content-type")?.split(";")[0] || "image/webp";
  if (!response.ok || !mime.startsWith("image/")) throw new Error("Výsledný obrázek z bezplatné fronty se nepodařilo načíst.");
  return { mime, bytes: new Uint8Array(await response.arrayBuffer()) };
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function renderYoutubeCover(image: ImageAsset, albumName: string, songTitle: string): Uint8Array {
  const embedded = toBase64(image.bytes);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><filter id="blur"><feGaussianBlur stdDeviation="28"/></filter><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="0.53" stop-color="#000000" stop-opacity="0.12"/><stop offset="1" stop-color="#05060b" stop-opacity="0.96"/></linearGradient></defs><image href="data:${image.mime};base64,${embedded}" x="-80" y="-80" width="1760" height="1060" preserveAspectRatio="xMidYMid slice" filter="url(#blur)"/><rect width="1600" height="900" fill="#071017" fill-opacity="0.22"/><image href="data:${image.mime};base64,${embedded}" x="350" y="0" width="900" height="900" preserveAspectRatio="xMidYMid slice"/><rect width="1600" height="900" fill="url(#shade)"/><rect x="70" y="670" width="7" height="154" rx="3" fill="#f1ad4e"/><text x="102" y="704" font-family="DejaVu Sans, Arial, sans-serif" font-size="29" font-weight="700" letter-spacing="8" fill="#f1ad4e">TEMNEY</text><text x="102" y="752" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="600" fill="#f6f4ef" opacity="0.92">${xml(textLine(albumName, 54))}</text><text x="98" y="809" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="800" fill="#ffffff">${xml(textLine(songTitle, 45))}</text></svg>`;
  return ImageMagick.read(new TextEncoder().encode(svg), (canvas) => {
    canvas.resize(1600, 900);
    canvas.quality = 92;
    return canvas.write(MagickFormat.Jpeg, (data) => data);
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Použij POST požadavek." }, 405);
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !url || !anonKey) return json({ error: "Chybí bezpečné připojení k externímu cloudu." }, 401);
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Neplatné přihlášení." }, 401);

  const input = await request.json().catch(() => null) as { action?: "create" | "check"; entityType?: "song" | "lyric" | "album"; entityId?: string; jobId?: string; format?: "youtube_16_9"; userNote?: string | null } | null;
  if (!input?.action || !input.entityType || !input.entityId) return json({ error: "Chybí skladba nebo akce." }, 400);
  const isAlbum = input.entityType === "album";
  const table = input.entityType === "song" ? "sc_songs" : input.entityType === "album" ? "sc_albums" : "sc_lyrics";
  const { data: entity, error: entityError } = await supabase.from(table).select(isAlbum ? "id,name,title:description,cover_path" : "id,title,style_prompt,lyrics,album_id").eq("id", input.entityId).eq("user_id", user.id).single();
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
    const { data: album } = (entity as any).album_id ? await supabase.from("sc_albums").select("name").eq("id", (entity as any).album_id).eq("user_id", user.id).maybeSingle() : { data: null };
    albumName = album?.name || "Bez alba";
  }
  const youtubeCover = input.format === "youtube_16_9";

  if (input.action === "create") {
    const formatInstruction = youtubeCover ? "Create a cinematic square music visual with a strong centered subject; the app will turn it into a wide 16:9 YouTube cover and add a title." : isAlbum ? "Create a square music album cover with strong artistic identity for the release." : "Create a square album cover.";
    const subjectLine = isAlbum
      ? `Czech music album by Temney. Album title: "${entityTitle}". Creative direction: ${truncate(stylePrompt, 600) || "instrumental collection without lyrics"}. Optional creative direction: ${truncate(input.userNote, 600) || "none"}.`
      : `Czech song by Temney. Song title: "${entityTitle}". Album: "${truncate(albumName, 120)}". Mood and music direction: ${truncate(stylePrompt, 600) || "original Czech song"}. Lyrical atmosphere: ${truncate(lyrics, 1200)}. Optional creative direction: ${truncate(input.userNote, 600) || "none"}.`;
    const prompt = `${formatInstruction} ${subjectLine} Premium expressive artwork, one clear visual subject, rich texture, no lettering, no words, no logos, no watermark.`;
    const response = await fetch("https://aihorde.net/api/v2/generate/async", { method: "POST", headers: { "Content-Type": "application/json", apikey: "0000000000", "Client-Agent": "SongCraftStudio:1.1" }, body: JSON.stringify({ prompt, params: { width: youtubeCover ? 512 : 512, height: youtubeCover ? 512 : 512, steps: 16, cfg_scale: 6.5, n: 1 }, nsfw: false, censor_nsfw: true, trusted_workers: false, shared: false, r2: true }) });
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
    try {
      const generated = await readGeneratedImage(source);
      const output = youtubeCover ? renderYoutubeCover(generated, isAlbum ? "Album" : albumName, entityTitle) : generated.bytes;
      const contentType = youtubeCover ? "image/jpeg" : generated.mime;
      const extension = youtubeCover ? "jpg" : contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : "webp";
      const path = `${user.id}/covers/generated/${input.entityType}-${safe(entityTitle)}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("songcraft").upload(path, output, { contentType, upsert: false });
      if (uploadError) return json({ status: "failed", error: uploadError.message });
      const { error: updateError } = await supabase.from(table).update({ cover_path: path }).eq("id", input.entityId).eq("user_id", user.id);
      if (updateError) return json({ status: "failed", error: updateError.message });
      return json({ status: "completed", coverPath: path });
    } catch (error) {
      return json({ status: "failed", error: error instanceof Error ? error.message : "Finální 16:9 obal se nepodařilo vytvořit." });
    }
  }

  return json({ error: "Neznámá akce." }, 400);
});
