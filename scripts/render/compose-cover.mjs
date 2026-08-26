/**
 * Skládání 16:9 obalu skladby/alba v GitHub Actions.
 * Stáhne surový AI obrázek z úložiště, ffmpeg z něj složí 1600×900 JPG
 * s rozmazaným pozadím, ostrým středem a titulkem Temney / album / název,
 * výsledek nahraje zpět a propojí se skladbou v katalogu.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const SUPABASE_URL = process.env.SONGCRAFT_SUPABASE_URL;
const SERVICE_KEY = process.env.SONGCRAFT_SERVICE_ROLE_KEY;
const JOB_ID = process.env.JOB_ID;
const USER_ID = process.env.USER_ID;
const ENTITY_TYPE = process.env.ENTITY_TYPE || "song";
const ENTITY_ID = process.env.ENTITY_ID;
const TITLE = (process.env.TITLE || "").trim() || "Bez názvu";
const ALBUM_NAME = (process.env.ALBUM_NAME || "").trim() || "";
const RAW_PATH = process.env.RAW_PATH;
const BUCKET = "songcraft";

if (!SUPABASE_URL || !SERVICE_KEY || !JOB_ID || !USER_ID || !ENTITY_ID || !RAW_PATH) throw new Error("Chybí vstupní parametry skládání obalu.");

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const rest = (path) => `${SUPABASE_URL}/rest/v1/${path}`;
const table = ENTITY_TYPE === "song" ? "sc_songs" : ENTITY_TYPE === "album" ? "sc_albums" : "sc_lyrics";

async function fail(message) {
  console.error(message);
  await fetch(`${rest("sc_cover_jobs")}?id=eq.${JOB_ID}`, { method: "PATCH", headers, body: JSON.stringify({ status: "failed", error: String(message).slice(0, 400), updated_at: new Date().toISOString() }) }).catch(() => {});
  process.exit(1);
}

await run("mkdir", ["-p", "/tmp/compose"]);
const signResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${RAW_PATH}`, { method: "POST", headers, body: JSON.stringify({ expiresIn: 3600 }) });
if (!signResponse.ok) await fail(`Nepodařilo se podepsat surový obrázek: ${await signResponse.text()}`);
const { signedURL } = await signResponse.json();
const imageResponse = await fetch(`${SUPABASE_URL}/storage/v1${signedURL}`);
if (!imageResponse.ok) await fail(`Surový obrázek se nepodařilo stáhnout (${imageResponse.status}).`);
await writeFile("/tmp/compose/raw.img", Buffer.from(await imageResponse.arrayBuffer()));

await writeFile("/tmp/compose/temney.txt", "TEMNEY");
await writeFile("/tmp/compose/album.txt", ALBUM_NAME.slice(0, 54));
await writeFile("/tmp/compose/title.txt", TITLE.slice(0, 45));

console.log("Skládám 1600×900 obal…");
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
await run("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-i", "/tmp/compose/raw.img",
  "-filter_complex",
  [
    "[0:v]split=2[bg][ct]",
    "[bg]scale=1600:900:force_original_aspect_ratio=increase,crop=1600:900,gblur=sigma=28,eq=brightness=-0.12[bgb]",
    "[ct]scale=-2:1000[cts]",
    "[bgb][cts]overlay=(W-w)/2:12",
    `drawbox=x=70:y=670:w=7:h=154:color=0xF1AD4E:t=fill`,
    `drawtext=fontfile=${FONT}:textfile=/tmp/compose/temney.txt:fontcolor=#F1AD4E:fontsize=30:x=102:y=700`,
    `drawtext=fontfile=${FONT}:textfile=/tmp/compose/album.txt:fontcolor=white:fontsize=26:x=102:y=748`,
    `drawtext=fontfile=${FONT}:textfile=/tmp/compose/title.txt:fontcolor=white:fontsize=52:x=102:y=800`,
    "format=yuv420p[v]",
  ].join(";"),
  "-map", "[v]", "-frames:v", "1", "-q:v", "2",
  "/tmp/compose/out.jpg",
]);

const jpg = await readFile("/tmp/compose/out.jpg");
const coverPath = `${USER_ID}/covers/generated/${ENTITY_TYPE}-${TITLE.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}-${JOB_ID}.jpg`;
console.log(`Nahrávám hotový obal (${(jpg.length / 1048576).toFixed(1)} MB)…`);
const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${coverPath.split("/").map(encodeURIComponent).join("/")}`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "image/jpeg", "x-upsert": "true" },
  body: jpg,
});
if (!upload.ok) await fail(`Nahrání obalu selhalo: ${await upload.text()}`);

const linkFiltered = await fetch(`${rest(table)}?id=eq.${ENTITY_ID}`, { method: "PATCH", headers, body: JSON.stringify({ cover_path: coverPath }) });
if (!linkFiltered.ok) await fail(`Propojení obalu s ${table} selhalo.`);

const finalize = await fetch(`${rest("sc_cover_jobs")}?id=eq.${JOB_ID}`, { method: "PATCH", headers, body: JSON.stringify({ status: "completed", cover_path: coverPath, updated_at: new Date().toISOString() }) });
if (!finalize.ok) await fail("Výsledek se nepodařilo zapsat do katalogu úloh.");
console.log("Hotovo.");
