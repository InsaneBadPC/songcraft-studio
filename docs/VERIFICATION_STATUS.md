# Ověření implementace — 25. 9. 2026 (večer, po nasazení)

Tento záznam obsahuje výsledky hermetic kontrol, živých E2E testů a stav rollbacku. Neobsahuje credentials ani hodnoty secretů.

## Nasazení na produkci (projekt `hfykngbhcxmnpxvjagoj`)

- 11 produkčních migrací aplikováno v pořadí a zapsáno do `supabase_migrations.schema_migrations` (potvrzeno v CI logu: `applying … ok` ×11)
- 23 Edge Function secretů na projektu; všech 15 povinných názvů ověřeno přes Management API (`scripts/verify-edge-secrets.mjs`)
- 16 Edge Functions nasazeno (`supabase functions deploy --use-api`)
- Deploy workflow: `Deploy agent orchestrator` — **success** (opakovaně, idempotentní)
- `SongCraft CI` — **success** (16/16 `deno check`, testy, security scan, web export)

## Živé E2E (15/15)

- auth pro všechny tři účty (`temney`, `dj-palacinka`, `verca`)
- `agent_confirmations`, `youtube_oauth_states` existují; `agent_videos` má `attempt_count`/`lease_expires_at`
- `agent-orchestrator`: anonymně 401, přihlášeně 200, žádný stack trace v odpovědi
- `youtube-sync-stats` a `youtube-publish-scheduler`: anonymně 401 (fail-closed)
- `youtube-oauth-start` vrací platnou Google authorization URL (PKCE stav uložen)
- izolace účtů: žádný překryv songů mezi účty, cizí song nepřístupný
- 24 songů / 20 audio verzí / 10 jobů ve frontě dostupných pro render testy

## Video pipeline (skutečný render)

- `static_cover`: job vytvořen přes `songcraft-youtube` jako přihlášený uživatel → nový worker si ho zamkl lease → `queued → rendering → ready`
- výstup 17.97 MB MP4 (platné `ftyp`), 16:9, v soukromém bucketu `songcraft` s owner-prefix cestou
- anonymní čtení objektu: HTTP 400 (soukromé), vlastník přes signed URL: HTTP 200
- opravené chyby zjištěné živým během: chybějící čárka před `format=yuv420p` v filter chainu a detekce typu artworku z magic bytů
- legacy `songcraft-video-renderer` (GitHub release pipeline) zastaven a vypnut; aktivní je už jen `songcraft-renderer`

## Oracle VM

- Node.js 22.23.3, `songcraft-renderer.service` active, work dir `/var/lib/songcraft-studio/work`
- dashboard `127.0.0.1:8080` s basic auth (401 bez přihlášení), veřejně přes Caddy + Cloudflare tunel
- starý worker vypnut, privátní fronta nahrazuje veřejné GitHub release

## Odstraněné bugy (nálezy z živého běhu)

1. `pg_policy` sloupec `polname` (ne `policyname`) — shodil by hardening i core migraci
2. ledger insert v runneru — špatné escapování `$` v `array[$$…$$]`
3. preflight mlčel při chybě dotazu — teď fail-closed a kontroluje existující sloupce
4. `songcraft-imports` 32 MB bundle → HTTP 413; řešeno server-side bundlingem (`--use-api`)
5. `supabase secrets list --output json` jiný tvar než očekával grep → verifikace přes Management API
6. NativeWind `forceWriteFileSystem` v CI → „Failed to get the SHA-1 for web.css"
7. ffmpeg filter chain v workeru + detekce typu artworku

## Zbývá za release gate (vyžaduje výslovné potvrzení uživatele)

- reálný YouTube publish po confirmation nonce (veřejný zásah — neprovádím bez souhlasu)
- `image_animation` / `full_scenes` na Oracle (CPU-only Free Tier VM, bez GPU — pomalé, ověřuje se)
- `pnpm test:live` proti produkčnímu Gemini/Supabase
- Android APK build přes CI workflow
- rotace starých tokenů a API klíčů (odloženo podle zadání na release gate)
- odstranění/zprivatizování existujících `songcraft-videos` release assetů na GitHubu
