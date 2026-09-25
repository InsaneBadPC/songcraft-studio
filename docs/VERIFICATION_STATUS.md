# Ověření implementace — 25. 9. 2026

Tento záznam obsahuje pouze výsledky offline/hermetic a read-only live kontrol. Neobsahuje credentials ani hodnoty secretů.

## Prošlo (Termux toolchain, čistá pracovní kopie)

- TypeScript: `pnpm check` (`tsc --noEmit`) — OK
- Expo lint: `pnpm lint` — 0 chyb, 22 varování (pouze `no-unused-vars`)
- Hermetic Vitest: `pnpm test` — **66 passed, 1 skipped**
- Security boundary scanner: `pnpm security:check` — OK
- Production structure smoke check: `pnpm smoke:structure` — OK (12 required files, 9 nových produkčních migrací)
- Edge Function type check: `deno check --config supabase/functions/deno.json --node-modules-dir=auto` — **16/16 OK**
- Web export: `pnpm exec expo export --platform web` — OK, 24 statických routes
- Nástroje: Node 24.18, pnpm 9.12.0, Deno 2.9.7, FFmpeg 8.1.3, OpenJDK 17, Supabase CLI 2.117.0 (přes proot/Debian 13), gh 2.101, Gradle 9.8, android-tools 37

## Živé read-only kontroly

- Supabase Auth health na `hfykngbhcxmnpxvjagoj`: HTTP 200 (service role key z `.env` je platný)
- PostgREST schema: 24 veřejných cest
- Auth admin list (read-only): 3 uživatelé → allowlist pro `SONGCRAFT_ALLOWED_*` připravena
- Live schéma: `agent_confirmations` chybí, `agent_videos` existuje bez `attempt_count` → pending migrace potvrzeny
- Oracle VM `youtube-agent-vm`: dashboard `127.0.0.1:8080` vrací 401 bez basic auth (auth funguje), `/api/health` 200

## Oracle VM — staging (hotovo, služba záměrně nespuštěná)

- Node.js v22.23.3 nainstalován (původně 18.19.1, požadavek je 20+)
- system user `songcraft-renderer`, work dir `/var/lib/songcraft-studio/work` (750)
- `worker.mjs` + `songcraft-renderer.service` nainstalovány, `daemon-reload` proveden
- `/etc/songcraft-studio/renderer.env` (600 root:root) se 9 klíči; dashboard jen na loopbacku
- Suchý běh workeru: dashboard OK, pak fail-closed `agent_videos.attempt_count does not exist` (čeká na migraci)
- Starý `songcraft-video-renderer.service` (GitHub release pipeline) stále běží; vypne se až při cutoveru po E2E

## Blokér (live nasazení)

- Management API token pro projekt `hfykngbhcxmnpxvjagoj` byl nalezen jako GitHub Actions secret `SUPABASE_ACCESS_TOKEN` v repozitáři `InsaneBadPC/songcraft-studio`; workflow jím dnes (25. 9. 08:16 UTC) úspěšně prošlo. Tokeny v `Secret/` jsou buď neplatné (HTTP 401), nebo patří ke smazaným projektům (HTTP 403).
- Do GitHub Secrets bylo přidáno 10 chybějících hodnot (YouTube OAuth client, allowlist 3 účtů, scheduler seedy, service role, Gemini) přes veřejný klíč repozitáře a NaCl sealed box; hodnoty se nikdy nevypisovaly.
- **Aktuální blokér:** GitHub účet `InsaneBadPC` nemá ověřený e-mail, proto odmítá git push i Git Data API (`403 At least one email address must be verified`). Po ověření e-mailu stačí pushnout commit `2aafa48` a workflow dokončí migrace, secrets a nasazení všech funkcí.
- Před nasazením byl nalezen a opraven skutečný bug: `pg_policy` má sloupec `polname`, ne `policyname` (chyba by shodila hardening i core migraci na produkci). Oprava je ověřena na lokálním Postgres 18.

## Ověření migrací na lokálním Postgres 18

- všech 11 migrací projde v pořadí i při **druhém průchodu** (idempotence)
- fail-closed kontrola správně odmítne legacy storage cestu a migrace se odroluje (žádné nové policy/triggery)
- ledger insert ve tvaru používaném CI funguje (1 řádek, uložená délka statementu odpovídá souboru)
- emulace Supabase: `auth.uid()`, `auth.role()`, `storage.buckets`, `storage.objects`, role `anon`/`authenticated`/`service_role`

## Záměrně neprovedeno

- Aplikace migrací a nasazení Edge Functions na produkci
- Připojení/reálný Oracle worker smoke test
- Živý OAuth/publish/statistics test
- Rotace nebo revocation existujících tokenů/API keys

## Podmínky před produkčním release

1. Vytvořit vlastní Supabase personal access token pro účet, který vlastní `hfykngbhcxmnpxvjagoj`, a uložit ho mimo repozitář (`chmod 600`).
2. `SUPABASE_ACCESS_TOKEN=… scripts/deploy-production.sh --preflight` — read-only kontrola legacy cest.
3. `APPLY_MIGRATIONS=1 SUPABASE_ACCESS_TOKEN=… scripts/deploy-production.sh --migrations` — migrace + ledger.
4. Připravit lokální secrets file se jmény z `docs/DEPLOYMENT_RUNBOOK.md` a spustit `--secrets --functions`.
5. Nastavit `SONGCRAFT_ALLOWED_USER_IDS` a `SONGCRAFT_ALLOWED_EMAILS` z reálných auth uživatelů.
6. Nainstalovat Oracle worker podle `workers/video-renderer/README.md`.
7. Ověřit legacy storage cesty před hardening migrací.
8. Teprve po E2E a rollback ověření rotovat/revokovat staré credentials.
