/**
 * Bezplatný renderer YouTube videa pro SongCraft Studio.
 * Spouští se v GitHub Actions: stáhne finální MP3 a cover z Supabase Storage,
 * sestaví 1920×1080 MP4 (statický obrázek + hudba + titulek) a nahraje
 * výsledek zpět do soukromého úložiště uživatele. Žádné externí placené API.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const SUPABASE_URL = process.env.SONGCRAFT_SUPABASE_URL;
const SERVICE_KEY = process.env.SONGCRAFT_SERVICE_ROLE_KEY;
const JOB_ID = process.env.JOB_ID;
const SONG_ID = process.env.SONG_ID;
const VERSION_ID = process.env.VERSION_ID;
const BUCKET = "songcraft";

if (!SUPABASE_URL || !SERVICE_KEY || !JOB_ID || !SONG_ID || !VERSION_ID) {
  throw new Error("Chybí vstupní parametry renderu.");
}

const rest = (path) => `${SUPABASE_URL}/rest/v1/${path}`;
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function fail(message) {
  console.error(message);
  await fetch(`${rest("sc_video_jobs")}?id=eq.${JOB_ID}`, { method: "PATCH", headers, body: JSON.stringify({ status: "failed", error: message.slice(0, 400), updated_at: new Date().toISOString() }) }).catch(() => {});
  process.exit(1);
}

const songResponse = await fetch(`${rest("sc_songs")}?select=id,title,cover_path,album_id,user_id&id=eq.${SONG_ID}`, { headers });
const [song] = await songResponse.json();
if (!song) await fail("Skladba nebyla nalezena.");

const versionResponse = await fetch(`${rest("sc_audio_versions")}?select=id,song_id,storage_path,tagged_storage_path,is_final&id=eq.${VERSION_ID}`, { headers });
const [version] = await versionResponse.json();
if (!version || version.song_id !== song.id) await fail("MP3 verze nebyla nalezena.");

let coverPath = song.cover_path;
if (!coverPath && song.album_id) {
  const albumResponse = await fetch(`${rest("sc_albums")}?select=cover_path&id=eq.${song.album_id}`, { headers });
  const [album] = await albumResponse.json();
  coverPath = album?.cover_path ?? null;
}
if (!coverPath) await fail("Skladba ani album nemají obrázek pro video.");

const signed = async (path) => {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!response.ok) throw new Error(`Nepodařilo se podepsat ${path}: ${await response.text()}`);
  const { signedURL } = await response.json();
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
};

const downloadTo = async (url, destination) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Stažení ${destination} selhalo (${response.status}).`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
};

const safeTitle = (song.title ?? "Skladba").replace(/["'\\\\:]/g, "").slice(0, 150);

const audioPath = version.tagged_storage_path || version.storage_path;
const work = "/tmp/songcraft-render";
await run("mkdir", ["-p", work]);
console.log("Stahuji cover a MP3…");
await downloadTo(await signed(coverPath), `${work}/cover`);
await downloadTo(await signed(audioPath), `${work}/audio.mp3`);

// Titulek do samostatného souboru, aby nevadily uvozovky ani diakritika.
await writeFile(`${work}/title.txt`, `Temney\n${safeTitle}`);

const EFFECTS = ["static", "zoom", "wave", "zoom_wave", "blur"];
const effect = EFFECTS.includes(process.env.EFFECT) ? process.env.EFFECT : "zoom_wave";
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FPS = 12;
const withWaves = effect === "wave" || effect === "zoom_wave";

let baseChain;
if (effect === "blur") {
  // Rozmazané pozadí z coveru + ostrý obrázek přes celou výšku uprostřed.
  baseChain = [
    "[0:v]split[bgsrc][ctsrc]",
    "[bgsrc]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=28,eq=brightness=-0.07[bgb]",
    "[ctsrc]scale=-2:1010[ctr]",
    "[bgb][ctr]overlay=(W-w)/2:(H-h)/2",
  ].join(";");
} else if (effect === "zoom" || effect === "zoom_wave") {
  // Jemný pomalý přiblížení – celý 16:9 cover zůstane vidět, jen 6% zoom.
  // Původní 3840:-2 + 1.14 ořezávalo okraje, teď 1920×1080 bez ořezu.
  baseChain = [
    "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
    `zoompan=z='min(1+0.00004*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS}`,
  ].join(",");
} else {
  baseChain = "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black";
}

const titlePosition = withWaves ? "y=64" : "y=h-text_h-70";
const titled = `${baseChain},drawtext=fontfile=${FONT}:textfile=/tmp/songcraft-render/title.txt:fontcolor=white:borderw=3:bordercolor=black:line_spacing=14:fontsize=52:x=(w-text_w)/2:${titlePosition}`;

let filterComplex;
let maps;
if (withWaves) {
  // Audio-reaktivní waveform pruk dole nad titulkem.
  filterComplex = `${titled}[base];[1:a]asplit=2[aw][ws];[ws]showwaves=s=1920x170:mode=cline:colors=#E39A5B@0.85:rate=${FPS}[wv];[base][wv]overlay=x=0:y=H-h-34,format=yuv420p[v]`;
  maps = ["-map", "[v]", "-map", "[aw]"];
} else {
  filterComplex = `${titled},format=yuv420p[v]`;
  maps = ["-map", "[v]", "-map", "1:a"];
}

console.log(`Renderuji 1920×1080 MP4 (efekt: ${effect})…`);
// Explicitní délka z audio stopy: -shortest sám nezastaví nekonečný smyčený
// obrazový vstup u všech verzí ffmpeg.
const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${work}/audio.mp3`]);
const durationSeconds = Number.parseFloat(probe.stdout.trim());
if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) await fail("Nepodařilo se zjistit délku MP3.");
await run("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-loop", "1", "-i", `${work}/cover`,
  "-i", `${work}/audio.mp3`,
  "-filter_complex", filterComplex,
  ...maps,
  "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-crf", "28",
  "-maxrate", "1200k", "-bufsize", "2400k",
  "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
  "-t", durationSeconds.toFixed(2),
  "-r", String(FPS), "-movflags", "+faststart",
  `${work}/video.mp4`,
]);

const videoBytes = await readFile(`${work}/video.mp4`);
const videoPath = `${song.user_id}/videos/${JOB_ID}.mp4`;
console.log(`Nahrávám výsledek (${(videoBytes.length / 1048576).toFixed(1)} MB) do úložiště…`);
const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${videoPath.split("/").map(encodeURIComponent).join("/")}`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "video/mp4", "x-upsert": "true" },
  body: videoBytes,
});
if (!uploadResponse.ok) await fail(`Nahrání videa selhalo: ${await uploadResponse.text()}`);

const finalize = await fetch(`${rest("sc_video_jobs")}?id=eq.${JOB_ID}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ status: "completed", video_path: videoPath, error: null, updated_at: new Date().toISOString() }),
});
if (!finalize.ok) await fail(`Výsledek se nepodařilo zapsat: ${await finalize.text()}`);

await Promise.all([unlink(`${work}/cover`), unlink(`${work}/audio.mp3`), unlink(`${work}/title.txt`), unlink(`${work}/video.mp4`)]);
console.log("Hotovo.");
