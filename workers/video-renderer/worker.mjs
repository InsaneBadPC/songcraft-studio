#!/usr/bin/env node
/**
 * Temney v3.0 ffmpeg video-renderer worker (Oracle Cloud Always Free VM, ubuntu, ffmpeg).
 *
 * Každou smyčku vezme PRVNÍ job z agent_videos (render_status=queued), zamkne ho
 * (queued→rendering) a podle job.type zpracuje právě jednu ze tří větví; výsledek je
 * vždy 16:9, nahraje se do Supabase Storage (bucket songcraft) a PATCH ready.
 *
 *   static_cover     → lokální ffmpeg (loop artwork + audio → stillimage MP4)   [výchozí]
 *   image_animation  → lokální ai-video-generator dashboard http://127.0.0.1:8080
 *                      POST /api/generate (audio + artwork + prompt + mode=image_animation)
 *                      → poll GET /api/runs → stáhne hotové mp4 z /api/runs/{id}/download
 *   full_scenes      → dashboard POST /api/generate mode=full_scenes (audio + artwork
 *                      jako referenční postava + prompt) → poll → stáhne mp4 → Storage → ready
 *
 * Dashboard (FastAPI, Basic auth z env DASHBOARD_USER/DASHBOARD_PASSWORD) běží NA STEJNÉM
 * Oracle VM jako tento worker ⇒ volá se lokálně 127.0.0.1:8080, bez otevírání portů ven.
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DASHBOARD_USER, DASHBOARD_PASSWORD.
 * Optional: DASHBOARD_URL (default http://127.0.0.1:8080), WORKER_INTERVAL_MS (30000),
 *           WORK_DIR, RUN_ONCE=1.
 */
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dashboardUrl = process.env.DASHBOARD_URL || "http://127.0.0.1:8080";
const dashboardUser = process.env.DASHBOARD_USER || "";
const dashboardPassword = process.env.DASHBOARD_PASSWORD || "";
const bucket = "songcraft";
const workRoot = process.env.WORK_DIR || "/tmp";
const interval = Number(process.env.WORKER_INTERVAL_MS || 30000);
const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 45 * 1024 * 1024);
const maxDownloadBytes = Number(process.env.MAX_DOWNLOAD_BYTES || 64 * 1024 * 1024);
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
function api(table, query = "") { return `${url}/rest/v1/${table}${query}`; }
async function request(endpoint, options = {}) {
  const response = await fetch(endpoint, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
async function signed(pathname) {
  // Storage API vyžaduje lomítka v cestě DOSLOVA; encodeURIComponent by je změnilo na %2F → 400.
  const encoded = pathname.split("/").map(encodeURIComponent).join("/");
  const result = await request(`${url}/storage/v1/object/sign/${bucket}/${encoded}`, { method: "POST", body: JSON.stringify({ expiresIn: 900 }) });
  return `${url}/storage/v1${result.signedURL}`;
}
function ownedPath(userId, pathname) {
  if (typeof pathname !== "string" || !pathname || pathname.length > 1024 || pathname.includes("\\") || pathname.includes("..") || pathname.startsWith("/") || !pathname.startsWith(`${userId}/`)) {
    throw new Error("Storage path does not belong to the job owner");
  }
  return pathname;
}
async function download(file, target, extraHeaders = {}) {
  const response = await fetch(file, { headers: extraHeaders, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxDownloadBytes) throw new Error(`Download exceeds the configured limit (${declaredLength} bytes)`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > maxDownloadBytes) throw new Error("Downloaded file has an invalid size");
  await writeFile(target, bytes);
}

/** Supabase upload limit je 50 MiB; před uploadem bezpečně zmenší př oversized MP4. */
async function prepareUpload(file) {
  if ((await stat(file)).size <= maxUploadBytes) return file;
  const target = `${file}.upload.mp4`;
  await exec("ffmpeg", [
    "-y", "-i", file,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", target,
  ], { maxBuffer: 10 * 1024 * 1024 });
  const size = (await stat(target)).size;
  if (size > maxUploadBytes) throw new Error(`Compressed video is still too large: ${size} bytes`);
  return target;
}

/** Basic auth hlavička dashboard API. */
function dashAuth() {
  if (!dashboardUser || !dashboardPassword) throw new Error("DASHBOARD_USER and DASHBOARD_PASSWORD are required for image_animation/full_scenes");
  return "Basic " + Buffer.from(`${dashboardUser}:${dashboardPassword}`).toString("base64");
}

/**
 * POST /api/generate → vytvoří job na dashboardu. Vrací {run_id,...}.
 * mode: image_animation | full_scenes
 */
async function dashGenerate(mode, audio, image, title, prompt) {
  const form = new FormData();
  form.append("audio", new Blob([await readFile(audio)], { type: "audio/mpeg" }), "audio.mp3");
  if (image) form.append("image", new Blob([await readFile(image)], { type: "image/jpeg" }), "artwork.jpg");
  form.append("prompt", prompt || "");
  form.append("title", title || "Temney");
  form.append("mode", mode);
  const response = await fetch(`${dashboardUrl}/api/generate`, { method: "POST", headers: { Authorization: dashAuth() }, body: form });
  if (!response.ok) throw new Error(`dashboard generate ${response.status}: ${await response.text()}`);
  const record = await response.json();
  if (!record?.run_id) throw new Error("dashboard generate: missing run_id");
  return record;
}

/** Poll GET /api/runs dokud job neskončí → vrací run (s download URL když hotovo). */
async function dashPoll(runId, timeoutMs = 90 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`${dashboardUrl}/api/runs`, { headers: { Authorization: dashAuth() } });
    if (!response.ok) throw new Error(`dashboard runs ${response.status}: ${await response.text()}`);
    const runs = await response.json();
    const item = (Array.isArray(runs) ? runs : []).find((r) => String(r?.run_id) === String(runId));
    if (item?.status === "finished" && item?.download) return item;
    if (item?.status === "failed" || item?.status === "error") throw new Error(`dashboard run failed: ${String(item?.message || item?.error || "").slice(0, 300)}`);
    if (item?.output) return item;
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error("dashboard render timed out");
}

async function processJob(job) {
  const work = path.join(workRoot, `temney-${job.id}`);
  await mkdir(work, { recursive: true });
  try {
    const songs = await request(api("sc_songs", `?select=id,title,cover_path,album_id&id=eq.${encodeURIComponent(job.song_id)}&user_id=eq.${encodeURIComponent(job.user_id)}`));
    const song = songs?.[0]; if (!song) throw new Error("Song not found");
    const versions = await request(api("sc_audio_versions", `?select=id,storage_path,original_storage_path,tagged_storage_path,is_final,is_primary,rating&song_id=eq.${encodeURIComponent(job.song_id)}&user_id=eq.${encodeURIComponent(job.user_id)}&is_final=eq.true&order=is_primary.desc,rating.desc&limit=1`));
    const version = versions?.[0]; if (!version) throw new Error("No final audio version");
    const audioStoragePath = ownedPath(job.user_id, version.tagged_storage_path || version.original_storage_path || version.storage_path);
    let coverStoragePath = ownedPath(job.user_id, song.cover_path);
    if (!coverStoragePath && song.album_id) {
      const albums = await request(api("sc_albums", `?select=cover_path&id=eq.${encodeURIComponent(song.album_id)}&user_id=eq.${encodeURIComponent(job.user_id)}`));
      coverStoragePath = ownedPath(job.user_id, albums?.[0]?.cover_path);
    }
    const audio = path.join(work, "audio.mp3");
    const artwork = path.join(work, "artwork.jpg");
    const output = path.join(work, "render.mp4");
    await download(await signed(audioStoragePath), audio);
    await download(await signed(coverStoragePath), artwork);

    const type = job.mode || job.type || "static_cover";
    if (type === "static_cover") {
      // === větev A: statický cover (lokální ffmpeg, chování beze změny) ===
      await exec("ffmpeg", [
        "-y", "-loop", "1", "-i", artwork, "-i", audio,
        "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720:format=yuv420p",
        "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k", "-shortest", output,
      ]);
    } else if (type === "image_animation" || type === "full_scenes") {
      // === větve B/C: dashboard pipeline (Oracle localhost, Wan 2.2 I2V / scény) ===
      const mode = type === "image_animation" ? "image_animation" : "full_scenes";
      const record = await dashGenerate(mode, audio, artwork, song.title, job.prompt_used || "");
      await dashPoll(record.run_id);
      await download(`${dashboardUrl}/api/runs/${record.run_id}/download`, output, { Authorization: dashAuth() });
    } else {
      throw new Error(`Unknown video type: ${type}`);
    }

    const uploadFile = await prepareUpload(output);
    const bytes = new Uint8Array(await readFile(uploadFile));
    const outputPath = `${job.user_id}/videos/${job.id}.mp4`;
    const uploadPath = outputPath.split("/").map(encodeURIComponent).join("/");
    const upload = await fetch(`${url}/storage/v1/object/${bucket}/${uploadPath}`, { method: "POST", headers: { ...headers, "Content-Type": "video/mp4", "x-upsert": "true" }, body: bytes });
    if (!upload.ok) throw new Error(`Upload failed ${upload.status}: ${await upload.text()}`);
    await request(api("agent_videos", `?id=eq.${job.id}&user_id=eq.${job.user_id}`), { method: "PATCH", body: JSON.stringify({ render_status: "ready", storage_path: outputPath, output_path: outputPath, error_message: null, lease_expires_at: null }) });
    console.log(`[ready] ${job.id} (${type})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempt = Number(job.attempt_count || 0);
    const maxAttempts = Number(job.max_attempts || 3);
    const retry = attempt < maxAttempts;
    await request(api("agent_videos", `?id=eq.${job.id}&user_id=eq.${job.user_id}`), { method: "PATCH", body: JSON.stringify({ render_status: retry ? "queued" : "failed", lease_expires_at: null, error_message: message.slice(0, 1000) }) }).catch(() => {});
    console.error(`[${retry ? "retry" : "failed"}] ${job.id} (${attempt}/${maxAttempts}): ${message}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function tick() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  await request(api("agent_videos", `?render_status=eq.rendering&or=(lease_expires_at.is.null,lease_expires_at.lt.${encodeURIComponent(staleBefore)})`), { method: "PATCH", body: JSON.stringify({ render_status: "queued", lease_expires_at: null, error_message: "Worker lease expired; job was requeued." }) }).catch(() => {});

  const jobs = await request(api("agent_videos", "?select=id,user_id,song_id,type,mode,backend,prompt_used,attempt_count,max_attempts,lease_expires_at&render_status=eq.queued&order=created_at.asc&limit=1"));
  const job = jobs?.[0]; if (!job) return;
  const attempt = Number(job.attempt_count || 0) + 1;
  const maxAttempts = Number(job.max_attempts || 3);
  if (attempt > maxAttempts) {
    await request(api("agent_videos", `?id=eq.${encodeURIComponent(job.id)}&user_id=eq.${encodeURIComponent(job.user_id)}`), { method: "PATCH", body: JSON.stringify({ render_status: "failed", error_message: "Maximum render attempts exceeded.", lease_expires_at: null }) });
    return;
  }
  const claimed = await request(api("agent_videos", `?id=eq.${encodeURIComponent(job.id)}&user_id=eq.${encodeURIComponent(job.user_id)}&render_status=eq.queued`), { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ render_status: "rendering", attempt_count: attempt, lease_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), error_message: null }) });
  const ok = Array.isArray(claimed) && claimed.length > 0;
  if (ok) await processJob({ ...job, attempt_count: attempt, max_attempts: maxAttempts, mode: claimed[0].mode || job.mode, backend: claimed[0].backend || job.backend, prompt_used: claimed[0].prompt_used || job.prompt_used });
}

console.log(`Temney renderer ready; interval ${interval}ms; dashboard ${dashboardUrl}`);
do {
  await tick().catch((error) => console.error(error));
  if (process.env.RUN_ONCE === "1") break;
  await new Promise((resolve) => setTimeout(resolve, interval));
} while (true);
