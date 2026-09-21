const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  if (userResponse.status !== 200) return json({ error: "Neplatné přihlášení." }, 401);
  const user = (await userResponse.json()).id;

  const input = await request.json().catch(() => null);
  if (!input?.action || !input.songId || !input.versionId) return json({ error: "Chybí skladba, finální MP3 nebo akce." }, 400);
  const EFFECTS = ["static", "zoom", "wave", "zoom_wave", "blur"];
  const effect = EFFECTS.includes(input.effect ?? "") ? input.effect : "zoom_wave";

  const admin = (path) => `${url}/rest/v1/${path}`;
  const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  const firstRow = async (table, query) => {
    const res = await fetch(`${admin(`${table}?${query}`)}`, { headers: adminHeaders });
    return res.ok ? (await res.json())[0] : null;
  };
  const [song, version] = await Promise.all([
    firstRow("sc_songs", `select=id,title,cover_path,album_id,user_id&id=eq.${input.songId}`),
    firstRow("sc_audio_versions", `select=id,song_id,storage_path,tagged_storage_path,is_final&id=eq.${input.versionId}`),
  ]);
  if (!song || !version || version.song_id !== song.id) return json({ error: "Skladba nebo její MP3 verze nebyla nalezena." }, 404);
  if (song.user_id !== user) return json({ error: "Skladba nebo její MP3 verze nebyla nalezena." }, 404);
  if (!version.is_final) return json({ error: "Pro YouTube video nejdřív označ verzi jako finální." }, 400);
  let coverPath = song.cover_path || null;
  if (!coverPath && song.album_id) coverPath = (await firstRow("sc_albums", `select=cover_path&id=eq.${song.album_id}`))?.cover_path ?? null;
  if (!coverPath) return json({ error: "Skladba ani album nemají přiřazený obrázek pro video." }, 400);

  if (input.action === "create") {
    if (!githubToken) return json({ error: "Bezplatný renderer není správně nakonfigurován." }, 503);
    const jobId = crypto.randomUUID();
    const insert = await fetch(`${admin("sc_video_jobs")}`, {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ id: jobId, user_id: user, song_id: song.id, version_id: version.id, status: "processing", video_path: null }),
    });
    if (!insert.ok) return json({ error: `Renderovací úlohu se nepodařilo založit: ${(await insert.text()).slice(0, 200)}` }, 502);
    const dispatch = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ event_type: "render-youtube", client_payload: { jobId, songId: song.id, versionId: version.id, effect } }),
    });
    if (!dispatch.ok && dispatch.status !== 204) {
      await fetch(`${admin(`sc_video_jobs?id=eq.${jobId}`)}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ status: "failed", error: `Render se nepodařilo spustit (${dispatch.status}).` }) }).catch(() => {});
      return json({ error: `Bezplatný renderer se nepodařilo spustit (${dispatch.status}).` }, 502);
    }
    return json({ status: "processing", jobId, message: "Bezplatný GitHub renderer vytváří Full HD MP4." });
  }

  if (input.action === "check") {
    if (!input.jobId) return json({ error: "Chybí identifikátor exportní úlohy." }, 400);
    const job = await firstRow("sc_video_jobs", `select=id,user_id,status,video_path,error,created_at&id=eq.${input.jobId}`);
    if (!job || job.user_id !== user) return json({ error: "Exportní úloha nebyla nalezena." }, 404);
    if (job.status === "failed") return json({ status: "failed", error: job.error || "Renderer video nedokončil." });
    if (job.status !== "completed" || !job.video_path) {
      const ageMinutes = (Date.now() - new Date(job.created_at).getTime()) / 60_000;
      if (ageMinutes > 20) return json({ status: "failed", error: "Renderer video v rozumné době nedokončil. Zkus export spustit znovu." });
      return json({ status: "processing", jobId: job.id, message: "Bezplatný renderer stále připravuje MP4." });
    }
    if (/^https?:\/\//i.test(job.video_path)) return json({ status: "completed", url: job.video_path });
    const signResponse = await fetch(`${url}/storage/v1/object/sign/songcraft/${job.video_path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ expiresIn: "3600" }),
    });
    if (!signResponse.ok) return json({ status: "failed", error: "Hotové video se nepodařilo otevřít." });
    const signed = await signResponse.json();
    return json({ status: "completed", url: `${url}/storage/v1${signed.signedURL}` });
  }

  return json({ error: "Neznámá akce exportu." }, 400);
});