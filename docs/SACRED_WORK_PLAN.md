# SongCraft Studio — Posvátný pracovní plán AI manažera

**Větev:** `dev/ai-manager-studio` (vše se vyvíjí zde)
**Zásada:** Dokud nebude hotový, není hotový ani SongCraft Studio.

---

## 1. Vize

Přepracovat současný „čtecí“ asistent (`songcraft-studio-assistant`, read-only Gemini chat) na **plnohodnotného autonomního AI manažera („hudební manažer“)** uvnitř SongCraft Studia.

Agent bude:
1. Mít přístup k databázi SongCraft (skladby, texty, alba, obrázky, videa, MP3 verze).
2. Umět rendrovat YouTube videa k písni ve **3 režimech** (zachovat stávající renderer + přidat režimy z `ai-video-generator`).
3. Generovat obrázky alb (čtverec 1:1) i písní (16:9).
4. Vkládat obrázky, MP3 a MP4 přímo v chatu.
5. Mít plný přístup na YouTube kanál (publicace, metadata, statistiky, komentáře).
6. Být připravený na Spotify a TikTok (konektory/tools).
7. Používat instrukce hudebního manažera: jak propagovat písně, růst kanál, zaujmout diváky, trendy.

Bonus zásada: agent je „hudební manažer“ – nevytváří jen artefakty, ale vede šéfa (uživatele) strategicky k rostoucímu kanálu.

---

## 2. Aktuální stav (audit, 2026-09-23)

### SongCraft Studio (hlavní repo, `InsaneBadPC/songcraft-studio`)
- Expo 54 / React Native + Supabase. Větev `main` v2.9.1.
- Supabase tabulky (Postgres, RLS, snake_case): `sc_albums`, `sc_lyrics`, `sc_songs`, `sc_audio_versions`, `sc_rhyme_words`, `sc_video_jobs`, `sc_style_prompts`.
- Edge funkce: `songcraft-studio-assistant` (read-only), `songcraft-cover-ai`, `songcraft-imports`, `songcraft-rhymes`, `songcraft-utilities`, `songcraft-youtube` (spouští GitHub Actions render-youtube → `sc_video_jobs`).
- Klient: `lib/assistant-chat.ts` → `askStudioAssistant()` → `songcraft-studio-assistant`; UI `app/(tabs)/assistant.tsx` (5 konverzací v AsyncStorage, lokálně, bez DB).
- GitHub Actions workflowy: `android-experiment.yml`, `compose-cover.yml`, `deploy-web.yml`, `render-youtube.yml`.
- Testy v `tests/` (jest/tsx). Nástroj: `pnpm` + Expo + Drizzle (shema `drizzle/schema.ts` je MySQL podklad; Supabase vrstva je Postgres).

### Temney Agent prototyp (repo `songcraft-studio-temney-agent`, v3.0.1)
To je **prototyp schématu a konektorů**, který navrhujeme integrovat do hlavního SongCraft Studia:
- Migrace `supabase/migrations/20260922000000_temney_agent_v3.sql` — tabulky agenta: `agent_settings`, `agent_conversations`, `agent_messages`, `agent_recommendations`, `agent_action_log`, `agent_image_assets`, `agent_videos`, `youtube_publications`, `youtube_stats`, `youtube_credentials` + bucket `songcraft`.
- `supabase/functions/agent-orchestrator/index.ts` — serverový orchest rátor s 9 toolů (list_songs, list_lyric_drafts, extract_lyric_themes, generate_song_artwork, generate_metadata, render_video, create_recommendation, schedule_publication, publish_to_youtube). `CONFIRM_REQUIRED` = {publish_to_youtube, update_existing_video, send_comment_reply}. Character bible TEMNEY.
- `supabase/functions/video-renderer-dispatch/index.ts` — fronta `agent_videos` (render_status queued→rendering→ready/failed).
- `workers/video-renderer/worker.mjs` — Node 20+ ffmpeg worker (Systemd `video-agent`), polluje `agent_videos` queued, stahuje audio+cover, dělá 1280×720 MP4, upload do bucketu `songcraft`.
- `supabase/functions/youtube-publish/index.ts` — resumable upload na YouTube API v3, OAuth refresh přes `youtube_credentials`.
- `supabase/functions/youtube-sync-stats/index.ts` — denní statistiky → `youtube_stats`.
- Docs: `docs/temney-agent-v3.md` (nasazení + secrets + stav). GitHub workflow `sync-youtube-stats`.
- Klient: `lib/temney-agent.ts` (overview), `lib/assistant-chat.ts` (fallback na agent-orchestrator).

### ai-video-generator (samostatný projekt, VM)
- FastAPI dashboard: `POST /api/generate` s `mode` v {`full_scenes`, `image_animation`}, audio (File), image (File, pro image_animation povinné), prompt (Form), title (Form).
- `GET /api/health`, `/api/stats`, `/api/runs`, `/api/runs/{run_id}/download`, `/api/jobs`.
- Produkční stroj: VM (`138.2.190.31`, user `ubuntu`, SSH klíč `/data/data/com.termux/files/usr/tmp/opencode/yk`), služby `video-agent` a `video-agent-dashboard` (port 8080), R2 bucket `ai-video-generator`, storage `output/`, queue `queue/jobs.db`.
- E2E ověřeno 2026-09-23: `image_animation` run OK (82927 B MP4), dashboard API možný, R2 upload OK.

---

## 3. Cílové schéma agenta (fáze 0–1: konsolidace schémat)

Sjednotit schéma z temney-agentu do hlavního SongCraft Studia. Vše se vztahuje k `user_id` (RLS).

Tabulky **převést do hlavního repa** (`supabase/migrations/`) z `20260922000000_temney_agent_v3.sql` beze změny:
- `agent_settings` (auto_publish, preferred_publish_hour)
- `agent_conversations`, `agent_messages` (perzistentní chat místo AsyncStorage)
- `agent_recommendations` (kategorie seo/thumbnail/schedule/content/engagement/strategy)
- `agent_action_log` (audit)
- `agent_image_assets` (album_cover/song_artwork, 1:1/16:9, queued→generating→overlay_pending→ready/failed)
- `agent_videos` (lyric_video/static_cover/short/teaser, queued→rendering→ready/failed) **+ přidat `mode` a `backend` pro 3 režimy**
- `youtube_publications`, `youtube_stats`, `youtube_credentials`

Nové/rozšířené sloupce (přidat do plánu schématu):
- `agent_videos`: `mode text` (lyric_video|static_cover|short_teaser|image_animation|full_scenes), `backend text` default `ffmpeg` (ffmpeg|vm_image_animation|vm_full_scenes), `audio_storage_path`, `prompt_used`, `output_path`.
- `agent_image_assets`: rozšířit o `for_album boolean`, `render_url text`.
- `agent_media_uploads` (nová): `user_id`, `kind` (image|audio|video), `storage_path`, `mime_type`, `byte_size`, `label`, `conversation_id`, `song_id nullable`, created_at. — pro vkládání souborů v chatu.
- `agent_deploy_config` (nová) / reuse `agent_settings`: `run_vm`, `vm_endpoint`, `vm_token` (bezpečný, jen server-side).

---

## 4. Vrstvy a součásti

| Vrstva | Soubor/místo | Odpovědnost |
|---|---|---|
| Orchest rátor | `supabase/functions/agent-orchestrator/index.ts` | Function calling Gemini, dispatch toolů, RLS + audit |
| Edge: artwork | v orchest rátoru + vlastní skript | generování obrázku (1:1/16:9), Pollinations/backup |
| Edge: video render dispatch | `supabase/functions/video-renderer-dispatch/index.ts` | založit `agent_videos` queued |
| Worker ffmpeg | `workers/video-renderer/worker.mjs` | režim 1: lyric/static_cover přes ffmpeg |
| Worker VM ai | `workers/vm-render-dispatch.mjs` (nový) | režimy 2–3: volání `/api/generate` na VM |
| Edge: youtube-publish | `supabase/functions/youtube-publish/index.ts` | resumable upload + OAuth |
| Edge: youtube-sync-stats | `supabase/functions/youtube-sync-stats/index.ts` | denní stats → `youtube_stats` |
| Klient | `lib/assistant-chat.ts`, nový `lib/agent-api.ts`, `lib/temney-agent.ts` | volání agent-orchestrator; přidat upload souborů |
| UI | `app/(tabs)/assistant.tsx` (+ nové komponenty v `components/`) | chat, potvrzení, upload soubor, náhledy, stav rendroku |

---

## 5. Nástroje agenta (tool inventory — cílový stav)

Server-side `AGENT_TOOLS` (v orchest rátoru) — rozšířit z 9 na plnou sadu:

### 5.1 Hudební vlastnictví / přehled
- `list_songs` → skladby uživatele + readymost
- `list_lyric_drafts` → sc_lyrics draft
- `get_album_detail` (albumId) → album + seznam skladeb
- `list_audio_versions` (songId) → MP3 verze, finální/primární
- `get_lyrics` (songId) → plný text + style_prompt (server-side)

### 5.2 Umění
- `extract_lyric_themes` → 3–6 vizuálních motivů
- `generate_song_artwork` → obrázek 16:9 (song) NEBO 1:1 (album, arg `forAlbum`), Pollinations + seed, uložení do bucketu, `agent_image_assets`
- `make_album_artwork` (albumId) → čtverec 1:1 pro album

### 5.3 Video (3 režimy generování videa k písni)
1. `render_video` → režim **static_cover / lyric_video** přes ffmpeg (zachovat stávající renderer) — `agent_videos` queued → worker ffmpeg. Argument `type`.
2. `render_video_animation` (songId, image?) → režim **image_animation** přes `ai-video-generator` na VM (dashboard `/api/generate`, mode=image_animation, potřeba cover + audio) — `backend=vm_image_animation`.
3. `render_video_scenes` (songId, prompt?) → režim **full_scenes** přes VM (`/api/generate`, mode=full_scenes) — storyboard celé scény — `backend=vm_full_scenes`.

### 5.4 Online publikace / distribuce
- `generate_metadata` → název, popis, tagy (nikdy nepublikuje)
- `schedule_publication` → soukromý draft youtube_publications + planner time
- `publish_publication` (publicationId) → youtube-publish (CONFIRM_REQUIRED)
- `update_publication` (publicationId) → aktualizace exist. videa (CONFIRM_REQUIRED)
- `set_thumbnail` (videoId, image) → vlastní náhled (CONFIRM_REQUIRED)
- `list_recent_publications`, `get_stats` (publicationId/range) → youtube_stats
- `comment_reply` (commentId, reply) → odpověď na komentář (CONFIRM_REQUIRED)

### 5.5 Strategie / doporučení
- `create_recommendation` → agent_recommendations
- `analyze_trends` → doporučení na základě statistik (web research: Chartlex + Tools4Music)
- `refine_recommendation` (id, status) → user confirm/skip

### 5.6 Správa dat
- `upload_chat_file` (kind=image|audio|video, storage_path, conversationId) → `agent_media_uploads`
- `link_file_to_song` (uploadId, songId) → propojení uploadu se skladbou (např. cover či zvuk)

---

## 6. Playbook hudebního manažera (vstup do orchest rátoru)

Sekce `MUSIC_MANAGER_GUIDE` v `SYSTEM_PROMPT` orchest rátoru (česky, v souladu s validací):

- **Strategie publikování**: pravidelné intervaly; Shorts denně, hlavní videa v konzistentní hodiny (`preferred_publish_hour`).
- **SEO na YouTube (2026, dle Chartlex)**: metadata, engagement a watch time > text; název < 50 znaků, první slova vypovídající o obsahu; popisek 50–100 slov + 3–5 hashtagů; konzistentní thumbnail brandingu (cílit CTR 15–25 %); custom thumbnail + barevná paleta TEMNEY vytváří rozpoznatelnost.
- **Obsah**: Shorts > 70 mld. denních zhlédnutí; najít gap „lyrics video + animace písně = unikátní kanál TEMNEY"; využívat full_scenes pro teaser, image_animation pro lyric, static_cover pro záznam.
- **Engagement**: odpovídat na komentáře (CONFIRM_REQUIRED), vlastní promo konce videí.
- **Distribuce mimo YouTube**: pre-save (Feature.fm / DistroKid HyperFollow / Linkfire), playlist pitching, 8týdenní release kampaň (před-release teasery, release, post-release momentum) — dle Tools4Music 2026.
- **Trendy**: sledovat co funguje na kanálu přes `youtube_stats`, navrhovat úpravy formátu.
- **Bezpečnost**: nikdy netvrdit, že akce proběhla, pokud nevrácený success; veřejné akce VŽDY pending_confirmation (pokud auto_publish nezapnuto explicitně).

---

## 7. Fáze realizace (podrobný rozbor)

### Fáze 0 — Příprava a integrace základů
- [ ] V hlavním repu na větvi `dev/ai-manager-studio`.
- [ ] Převézt `supabase/migrations/20260922000000_temney_agent_v3.sql` do hlavního repa (nebo vytvořit novou migraci) + rozšířit o nové sloupce (5.0).
- [ ] Nakopírovat prototyp: `agent-orchestrator`, `video-renderer-dispatch`, `youtube-publish`, `youtube-sync-stats`, worker ffmpeg, `lib/temney-agent.ts`, workflow `sync-youtube-stats`.
- [ ] Secrets: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `VIDEO_VM_ENDPOINT`, `VIDEO_VM_BASIC_AUTH`, `R2_*` (server-side jen).
- [ ] Distribuce schématu do Supabase (db push / funkce).

Gates: `supabase db push` bez chyb; funkce se deploynou; E2E `list_songs` vrátí skutečná data uživatele.

### Fáze 1 — Orchest rátor v2 (plnohodnotný agent)
- [ ] Vytvořit nový `agent-orchestrator/index.ts` na bázi prototypu s rozšířeným tool inventory (sekce 5).
- [ ] Přidat perzistentní konverzace: `agent_conversations` + `agent_messages` (role user/model/function), auto-save.
- [ ] Tool `upload_chat_file`: vzít client-uploadné soubory, uložit do bucketu `songcraft`, položka `agent_media_uploads`, link na conversation/song.
- [ ] Přidat `render_video_scenes` a `render_video_animation` dispatche k VM.
- [ ] Audit: každý nástroj loguje do `agent_action_log` (success/error/pending).
- [ ] Přidat libovolné CLI/one-time test: POST funkcí s mock JWT (stávající testy je zachovávají).

Gates: chat z UI odpovídá přes orchest rátor; konverzace se ukládají do DB; tool call s potvrzením nikdy nepublikuje veřejně.

### Fáze 2 — Client (chat + upload + potvrzení + stav rendroku)
- [ ] `lib/agent-api.ts`: `askAgent(message, history, conversationId)` → volá `agent-orchestrator`.
- [ ] `app/(tabs)/assistant.tsx`: přejít z AsyncStorage na `agent_conversations`/`agent_messages` (fallback lokální pokud DB selže).
- [ ] Přidat **attachment button** (image/audio/video) → picker (`expo-image-picker` / document picker), upload do bucketu, předat orchest rátoru.
- [ ] **Potvrzovací UI**: když orchestr vrací `pending` (publish, update, comment, set_thumbnail), ukázat tlačítka Potvrdit/Zrušit → volá `agent-confirm` edge funkci.
- [ ] Komponenta stav rendroku: `agent_videos` live (queued/rendering/ready/failed) s tlačítkem „Otevřít MP4“ (signed URL).
- [ ] Náhled doporučení: `agent_recommendations` pending se swipe Accept/Reject (jako v temney klientu lib).
- [ ] Striktní styl dle `design.md` (copper #C6784E, bg #141317), a11y, haptiky, reanimated (viz skill mobile-ui-architect).

Gates: E2E hand-test — poslat soubor, agent zpracuje upload, doporučení potvrdím, render běží a MP4 je připravený.

### Fáze 3 — 3 režimy video renderu (backend propojení)
- [ ] Režim 1 (ffmpeg) — ověřit worker na VM (`video-agent`), cover+audio→1280×720.
- [ ] Režim 2 (image_animation): worker/vícerozměrný helper → volá VM `/api/generate` mode=image_animation (audio + image obrázek), výsledek stáhne do `agent_videos`, storage_path, ready.
- [ ] Režim 3 (full_scenes): VM `/api/generate` mode=full_scenes (audio + prompt), výsledek MP4 → ready.
- [ ] VM: povolit bezpečný přístup bez dashboardu (token auth header; endpoint v secrets, ne hardcoded). Zachovat R2/queue/cron jako je.
- [ ] `render_status` položka u všech režimů; `error_message` při fail.

Gates: `render_video` v režimu 1, 2, 3 → `ready` → MP4 stažitelný v chatu; logy z workerů čisté.

### Fáze 4 — YouTube / distribuce full
- [ ] Ověřit OAuth credentials Temney (`youtube_credentials` naplněno, channel `UCVBrh8BozfEz5SDltgsvGWw`).
- [ ] `update_publication`, `set_thumbnail`, `comment_reply` implementace v `youtube-publish` (vše CONFIRM_REQUIRED).
- [ ] `youtube-sync-stats` denní cron.
- [ ] Konektory pro Spotify/TikTok: nejprve jako **tools/placeholdery** (create_recommendation pro linky, publikace do playlists), definovat tabulky `spotify_credentials`, `tiktok_credentials` (prototyp). Plná implementace až po schválení uživatele.

Gates: publikace draft→confirmed→published přes reálnou YouTube API; stats se ukládají; konfirmace vydržuje soukromý stav.

### Fáze 5 — Playbook / strategie hudebního manažera
- [ ] Vložit `MUSIC_MANAGER_GUIDE` do `SYSTEM_PROMPT` orchest rátoru (sekce 6).
- [ ] Tool `analyze_trends`: čte `youtube_stats` + userovy skladby, generuje doporučení (SEO/thumbnail/schedule/content).
- [ ] A/B micro-test názvů/thumbnailů v `agent_recommendations`.
- [ ] Release plánovačka: model zaměřit na „release kampaň“ (pre-save linky, teasery, playlisty).

Gates: agent dává konkrétní, daty podložená doporučení; doporučení tahu do `agent_recommendations`.

### Fáze 6 — Nasazení, testy, dokumentace
- [ ] `.github/workflows`: render-youtube (zůstává), sync-youtube-stats, deploy edge funkcí (manual).
- [ ] Rozšířit `tests/`: agent-orchestrator unit (tool dispatch), helper austest, upload test, youtube-publish mock test.
- [ ] Dokumentace: aktualizovat `SYSTEM_GUIDE.md`, `HOW_TO_USE.md`, přidat sekci „AI manažer“.
- [ ] Verifikace E2E na VM: režim 1+2+3, publish confirmed, stats.
- [ ] Aktualizovat tento plán: vyškrtnout hotové; doplnit nové kroky.

Gates: `pnpm test` green, deploy clean, docs aktuální, audit soubor `AUDIT-2026-09-23.md` (ai-video-generator) zmiňuje VM propojení.

---

## 8. Vrstva bezpečnosti (neměnná pravidla)

1. Každý serverový dotaz ověřuje JWT (`auth.getUser`), filtruje `user_id`.
2. Tooly běží pod service-role klíčem, ale pouze v serverovém videu; ani klient nikdy nedostane service role.
3. Veřejné akce (publish, update, reply, thumbnail) vždy `pending_confirmation`.
4. Audit každé akce do `agent_action_log`.
5. Vstupní soubory validovány dle typu (obrázek/audio/video), velikost override, mime whitelist.
6. VM endpoint a R2 credentials jen v secrets; ne v repu.
7. `CONFIRM_REQUIRED` není přepisovatelné uživatelem; auto publikace jen pokud `auto_publish=true` v `agent_settings` a tool má povolení.

---

## 9. Definice hotovo (acceptance gates — celý SongCraft)

- [ ] Orchest rátor odpovídá česky, čte reálná data uživatele, ukládá konverzace do DB.
- [ ] Chat umí vložit obrázek/MP3/MP4 a agent je propojí se skladbou.
- [ ] Obrazky: album 1:1 + skladba 16:9 hotové a připsané do `sc_songs.cover_path` / `sc_albums.cover_path`.
- [ ] Video: 3 režimy (ffmpeg static/lyric, image_animation, full_scenes) → `agent_videos` ready → MP4 stažitelné v chatu.
- [ ] Publikace: draft → confirmed → published na reálném kanálu TEMNEY; stats se ukládají.
- [ ] Doporučení hudebního manažera končí v `agent_recommendations`, uživatel je může accept/reject.
- [ ] Testy green, nasazení funkční, dokumentace aktuální.

> **Posvátné motto:** *He says nothing, he writes one line, it works.*