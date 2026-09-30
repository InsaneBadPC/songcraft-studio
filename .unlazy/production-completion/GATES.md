# Gates: production image-animation completion

OWNS: .github/workflows/deploy-agent-orchestrator.yml

Scope: deploy the committed orchestrator, prove the public image_animation path reaches a moving MP4, and keep the VM and repositories clean and synchronized.

- [x] G0: completion ledger is structurally valid
  CHECK: node .unlazy/production-completion/scripts/verify-ledger.mjs
  EXPECT: gate ledger validation passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=685b0c563a07d0340fd82af527721339bb59018e8a05cdee7cf6b4ebcbfac2ee; output-bytes=30

- [x] G1: operational helpers contain no embedded Supabase access tokens or account passwords
  CHECK: node .unlazy/production-completion/scripts/verify-no-hardcoded-credentials.mjs
  EXPECT: credential hygiene verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=e573b6bffeff577ff49fd68d5e4d171427afa49b75cd3e134a5869f0c5429853; output-bytes=39

- [x] G2: the edge deployment workflow uses the official CLI and the deployable function contract
  CHECK: node .unlazy/production-completion/scripts/verify-deploy-contract.mjs
  EXPECT: edge deployment contract verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=244e79e0c071d54e319d3f9b18bfc489693fdcff8820804e5d70ce999a8d8553; output-bytes=45

- [x] G3: the pushed edge workflow completed successfully
  CHECK: node .unlazy/production-completion/scripts/verify-deploy-run.mjs
  EXPECT: edge deployment workflow verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=52c16bbc17edbbc4705b8a152609c1b980582de2feed80e0cd60a8733b63aecb; output-bytes=45

- [x] G4: the production orchestrator completes an authenticated tool roundtrip
  CHECK: node .unlazy/production-completion/scripts/verify-edge-roundtrip.mjs
  EXPECT: production edge roundtrip verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=80e6fce1c2fac6008367461b4bc304caa60a38dcee02242a0010e79d5ca8c9b4; output-bytes=62

- [x] G5: production edge creates image_animation and the resulting MP4 has moving video and audio
  CHECK: node .unlazy/production-completion/scripts/verify-edge-image-animation.mjs
  EXPECT: production image_animation E2E verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=fb3eea7e5edfc355f46755f7dd4e6446189961b42fdba660ad49fd869e506095; output-bytes=102

- [x] G6: VM dashboard and renderer are healthy, loopback-only, and free of restart loops
  CHECK: bash .unlazy/production-completion/scripts/verify-vm-runtime.sh
  EXPECT: VM runtime verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=0f6b528c4dd80a0d6034af490b740bbaf40b9037d37c761fa872b1d02b12942e; output-bytes=196

- [x] G7: both repositories are synchronized and have no unintended tracked changes
  CHECK: node .unlazy/production-completion/scripts/verify-version-sync.mjs
  EXPECT: repository synchronization verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=db9acbe60226723b0cfd98ad744d05947b3a20e48b6827f67018d54921a82815; output-bytes=79

- [x] G8: source checks and repository tests pass
  CHECK: node .unlazy/production-completion/scripts/verify-source-checks.mjs
  EXPECT: source verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/data/data/com.termux/files/home/storage/shared/InsaneCode/songcraft-studio; path=3b3b81dd49af/2 entries; EXPECT=matched; output-sha256=c4101820d1ca5298ffe0678a2ec656c01075aa95537933bdd69c813b56f23d35; output-bytes=27
