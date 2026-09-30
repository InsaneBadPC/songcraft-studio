#!/usr/bin/env node
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);
async function mediaExec(command, args, options = {}) {
  try {
    return await exec(command, args, { maxBuffer: 1024 * 1024, ...options });
  } catch {
    throw new Error(`${command} failed`);
  }
}
const root = path.resolve(import.meta.dirname, "../../..");
const statePath = "/data/data/com.termux/files/usr/tmp/opencode/production-image-animation-state.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
if (!url || !anon || !password) throw new Error("required local Supabase configuration is missing");

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: env.SONGCRAFT_TEST_EMAIL || "temney@songcraft.test", password }),
});
if (!login.ok) throw new Error(`login status ${login.status}`);
const session = await login.json();
const userId = session.user.id;
const userHeaders = { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };

async function userRest(pathname, options = {}) {
  const response = await fetch(`${url}/rest/v1/${pathname}`, { ...options, headers: { ...userHeaders, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`user REST ${response.status}`);
  return response.json();
}

async function findSong() {
  const songs = await userRest("sc_songs?select=id,title,cover_path&user_id=eq." + encodeURIComponent(userId) + "&cover_path=not.is.null&limit=50");
  const audio = await userRest("sc_audio_versions?select=song_id,storage_path&user_id=eq." + encodeURIComponent(userId) + "&is_final=eq.true&storage_path=not.is.null&limit=200");
  const audioIds = new Set((Array.isArray(audio) ? audio : []).map((row) => row.song_id));
  const song = (Array.isArray(songs) ? songs : []).find((row) => row.cover_path && audioIds.has(row.id));
  if (!song) throw new Error("no song with final audio and artwork is available");
  return song;
}

async function findNewJob(songId, since, excludedIds = new Set()) {
  const rows = await userRest("agent_videos?select=id,song_id,created_at,render_status,storage_path,error_message&user_id=eq." + encodeURIComponent(userId) + "&song_id=eq." + encodeURIComponent(songId) + "&type=eq.image_animation&created_at=gte." + encodeURIComponent(since) + "&order=created_at.desc&limit=50");
  return (Array.isArray(rows) ? rows : []).find((row) => !excludedIds.has(row.id)) ?? null;
}

async function existingJobIds(songId) {
  const rows = await userRest("agent_videos?select=id&user_id=eq." + encodeURIComponent(userId) + "&song_id=eq." + encodeURIComponent(songId) + "&type=eq.image_animation&order=created_at.desc&limit=200");
  return new Set((Array.isArray(rows) ? rows : []).map((row) => row.id));
}

async function queueThroughEdge(song, excludedIds = new Set()) {
  const since = new Date(Date.now() - 30000).toISOString();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${url}/functions/v1/agent-orchestrator`, {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({ message: `Proveď ihned přesný tool call render_video pro songId ${song.id} s type image_animation. Nejde o návrh; nejdříve zavolej nástroj a až potom odpověz.` }),
      signal: AbortSignal.timeout(180_000),
    });
    if (response.ok) {
      const job = await findNewJob(song.id, since, excludedIds);
      if (job) return job;
    }
    if (attempt < 3) await sleep(2000);
  }
  throw new Error("production edge did not create an image_animation job after three attempts");
}

let state = null;
try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch {}
const forceFresh = env.SONGCRAFT_FRESH_IMAGE_ANIMATION === "1";
const song = await findSong();
let job = !forceFresh && state?.jobId ? await userRest("agent_videos?select=id,song_id,created_at,render_status,storage_path,error_message&user_id=eq." + encodeURIComponent(userId) + "&id=eq." + encodeURIComponent(state.jobId) + "&type=eq.image_animation&limit=1").then((rows) => Array.isArray(rows) ? rows[0] : null) : null;
if (job && (job.song_id !== song.id || state?.songId && state.songId !== song.id || state?.userId && state.userId !== userId)) job = null;
if (job) {
  writeFileSync(statePath, JSON.stringify({ jobId: job.id, songId: song.id, userId, createdAt: job.created_at }), { mode: 0o600 });
  chmodSync(statePath, 0o600);
} else {
  const excludedIds = forceFresh ? await existingJobIds(song.id) : new Set();
  job = await queueThroughEdge(song, excludedIds);
  writeFileSync(statePath, JSON.stringify({ jobId: job.id, songId: song.id, userId, createdAt: job.created_at }), { mode: 0o600 });
  chmodSync(statePath, 0o600);
  console.log("edge image_animation job created; waiting for renderer");
}
const deadline = Date.now() + 2 * 60 * 60 * 1000;
while (Date.now() < deadline) {
  const rows = await userRest("agent_videos?select=id,song_id,render_status,storage_path,error_message&user_id=eq." + encodeURIComponent(userId) + "&id=eq." + encodeURIComponent(job.id) + "&song_id=eq." + encodeURIComponent(song.id) + "&limit=1");
  const current = Array.isArray(rows) ? rows[0] : null;
  if (!current) throw new Error("queued job disappeared");
  if (current.render_status === "failed") throw new Error("queued job failed");
  if (current.render_status === "ready" && current.storage_path) {
    const encoded = current.storage_path.split("/").map(encodeURIComponent).join("/");
    const sign = await fetch(`${url}/storage/v1/object/sign/songcraft/${encoded}`, { method: "POST", headers: userHeaders, body: JSON.stringify({ expiresIn: 900 }) });
    if (!sign.ok) throw new Error(`storage sign status ${sign.status}`);
    const signed = await sign.json();
    const mediaUrl = `${url}/storage/v1${signed.signedURL}`;
    const { stdout } = await mediaExec("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_name,codec_type,width,height", "-of", "json", mediaUrl]);
    const probe = JSON.parse(stdout);
    const video = probe.streams?.find((stream) => stream.codec_type === "video");
    const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
    if (!video || !audio || Number(probe.format?.duration) <= 1) throw new Error("stored MP4 does not contain valid video and audio");
    const frameAt = async (second) => (await mediaExec("ffmpeg", ["-v", "error", "-ss", String(second), "-i", mediaUrl, "-frames:v", "1", "-vf", "scale=96:54,format=gray", "-f", "rawvideo", "-"], { encoding: "buffer" })).stdout;
    const first = await frameAt(1);
    const second = await frameAt(3);
    let changed = 0;
    let delta = 0;
    for (let index = 0; index < first.length; index += 1) {
      const difference = Math.abs(first[index] - second[index]);
      delta += difference;
      if (difference > 3) changed += 1;
    }
    const changedPercent = first.length ? changed / first.length * 100 : 0;
    const meanDelta = first.length ? delta / first.length : 0;
    if (changedPercent < 1 || meanDelta < 0.5) throw new Error("stored video frames are effectively static");
    console.log(`production image_animation E2E verification passed video=${video.codec_name} audio=${audio.codec_name} changed=${changedPercent.toFixed(1)}% meanDelta=${meanDelta.toFixed(2)}`);
    process.exit(0);
  }
  await sleep(20000);
}
throw new Error("image_animation renderer did not become ready within two hours");
