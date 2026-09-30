# Verifikační stav — 26. 9. 2026

## Co bylo dnes ověřeno živě (ne odhad)

### ✅ Colab CLI — nainstalováno a přihlášeno
- `google-colab-cli` 0.7.4 (Apache 2.0, Google, 5. 6. 2026) nainstalován do
  `/opt/video-agent/.venv/bin/colab`, verifikováno `colab version`.
- OAuth přihlášení Google účtem proběhlo úspěšně (`token.json` uložen pro uživatele
  služby v `/var/lib/songcraft-renderer/.config/colab-cli/`).
- **L4 a G4: účet nemá oprávnění** (backend hlásí „no quota or entitlement") →
  na free tieru je dostupný **jen T4 (16 GB)**.
- **T4: `Service Unavailable`** — free T4 je průběžně kapacitně vyčerpaný. Není to
  chyba konfigurace, ale nedostupná kapacita.

### ✅ Oracle Cloud — GPU definitivně neexistuje
OCI SDK 2.187.0 dotaz na tenancy `Insane420` (eu-frankfurt-1):
```
shapy: BM.Standard.A1.160, VM.Standard.A1.Flex, VM.Standard.A2.Flex, VM.Standard.E2.1.Micro
GPU shapy: ZADNE
```
Free tier = 4 ARM OCPU / 24 GB RAM. Pro video modely nepoužitelné.
(Poznámka: `config` odkazoval na `oracle-oci-api-key-2026-09-23.pem`; první
zkoušený `.pem` fingerprint nesouhlasil → `401 NotAuthenticated`. Opraveno.)

### ✅ Doprava klipů přes podepsané URL — nalezena a ověřena
Dva reálné bugs Supabase Storage:
1. **`POST` na podepsanou upload URL vrací `403 "Storage object MIME type is not allowed"`**
   i pro typy, které bucket explicitně povoluje (`video/mp4` je v povoleném seznamu —
   ověřeno živým dotazem na `GET /storage/v1/bucket/songcraft`).
   **`PUT` funguje správně** → `HTTP 200 {"Key":"songcraft/..."}`.
2. **`sign` pro download vyžaduje `{"expiresIn": N}` v těle**, jinak
   `400 body must have required property 'expiresIn'`.
3. Vrácená `signedURL` je relativní ke `/storage/v1` — bez toho prefixu je to 404.

Konečný ověřený round-trip:
```
PUT  podepsaná URL (Authorization: Bearer <token>, Content-Type: video/mp4)  -> 200
GET  podepsaná download URL                                                 -> 200
GET  object/info  (service role)                                            -> 200
DELETE objekt                                                                 -> 200
```
Velikost: 200 000 B vloženo, 200 000 B staženo, identická velikost.

### ✅ Dávkový přenos vstupu přes bucket
`stage_local()` nahrá referenční obrázek na VM do soukromého bucketu; GPU kód si ho
stáhne jen krátkodobou download URL. Žádný dlouhodobý klíč se nedostává do notebooku
ani do Colab session. Ověřeno: 39 903 B, PNG hlavička v pořádku.

### ✅ Dávkové GPU renderování — architektura postavená a spuštěná
- `pipeline/gpu_batch.py` — sdílené jádro pro Kaggle i Colab, dávka N klipů v jednom
  běhu, model se stahuje jednou. Payload je jen JSON s URL: **8 065 B kódu pro 2 klipy**
  (limity Kaggle tedy nejsou problém).
- `pipeline/gpu_worker.py` — běžec jako systemd služba `gpu-worker.service` (active).
  Bere úlohy z fronty, zkouší Colab → Kaggle, **kapacitní neúspěch není chyba renderu**:
  úloha se vrátí do fronty s exponenciálním odstupem (max 40 pokusů).
- `kaggle kernels output` **funguje** pro soubory z `/kaggle/working` — vrátil
  `result.json`. Tedy i původní problém s dopravou je obejitelný; podepsané URL
  je ale čistší řešení (bez čekání na dokončení běhu pro stažení klipů).

### ⚠️ Free GPU kapacita je právě vyčerpaná
| Zdroj | Stav |
|---|---|
| Colab T4 | `Service Unavailable` (opakováno 6× v rámci 20 min) |
| Kaggle `sc-batch` | `QUEUED` 20+ min |
| Kaggle `sc-chunk` | `QUEUED` 20+ min |
| HF ZeroGPU | kvóta vyčerpána |

První dávka (před fixem) doběhla za 132 s, když byla kapacita — pipeline tedy
funkčně prokázaná. Teď fronta čeká.

## Nezměněné blokery
- **HF ZeroGPU**: ~2 min GPU/den/účet, dnes vyčerpáno do ~23:00.
- **Minimax klíč** (který máme): `1004 login fail` na všech host/endpoint kombinacích —
  klíč (43 znaků, začíná `MINI`) není platný API secret open platformy. Nutná ruční
  kontrola v konzoli Minimax.
- **Veo 3.1 API**: žádný free tier (ověřeno ceníkem Gemini API) → `GOOGLE_AI_STUDIO_KEY`
  pro video nepomůže.
- **Kvalita na 16 GB**: T4 = 16 GB VRAM → jen Wan2.2 5B kvantizovaný (GGUF Q4 ~8 GB)
  nebo SVD-XT. Wan2.2-TI2V-5B v BF16 (24 GB) se na T4 **nenačetl** a padl na SVD-XT
  (kernel to zaznamenal do `result.json` jako `model_error`).

## Konfigurační změny na VM
- `/opt/video-agent/.env` doplněno: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  (zkopírováno z `/etc/songcraft-studio/renderer.env`, 600 root).
- Nové: `/etc/systemd/system/gpu-worker.service` (User `songcraft-renderer`,
  EnvironmentFile z renderer.env i .env, HOME=/var/lib/songcraft-renderer).
- `colab-cli` nainstalováno i do `/opt/video-agent/.venv` (aby k němu měla přístup
  služba, ne jen uživatel `ubuntu`).
- Adresáře `logs/`, `queue/`, `state/` → `root:songcraft-renderer` 775.
