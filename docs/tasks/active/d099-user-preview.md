# D-099 user Preview — 2026-10-09

**Preview READY / USER ACCEPTANCE PENDING**. User authorized a separate local synthetic environment, not win01 changes or PR87/88 conflict work. Baseline main `49a82c9f970e158ded589300b4aa04fc4c809038` contains merged PR84/86. PR88 remains OPEN, candidate preparation only.

Actual address https://localhost:18444/quote-center; project `zhixu-preview-d099-18444`. Private account and launcher paths, isolation, pinned candidate identity, setup/verification and user steps: [Preview operations](../../../ops/quote-preview/README.md). All resources remain running for user review. No credentials/raw config/database/keys in this report.

## This run's evidence

- Approved image full ID/source/build and eight released migration byte SHA hashes verified before initialization; no rebuild or rejected candidate used.
- New PostgreSQL volume/schema0001–0008 only, independent persistent MinIO bucket/volume, private runtime ACL, secure secret mounts, internal network and loopback gateway checked. Preview-only self-signed TLS, dedicated user/browser verification profiles; no global trust install or auth bypass.
- First API/seed run65/65 checks PASS (12 synthetic Quotes, alternating types, fabric/trim costs, save/readback; health/build, Secure/HttpOnly/session,401,missing-Origin403,readonly viewer403/logout).
- Final API/storage rerun18/18 PASS, seed retained, synthetic PNG upload/download byte equality through formal API and independent local S3-compatible storage. No COS call.
- Actual Chromium11/11 PASS: login, list, type-first new page, creation of both types, detail, style/fabric price edit, Server version increment, hard refresh/readback, costs scroll, personal field settings and horizontal table scroll. Seven [screenshots](../assets/d099-preview/README.md), visually inspected. No claim that automated checks are user approval.
- Early browser harness failures were corrected: input values are not body text; use actual selectors and 保存草稿; repeated unchanged save does not increment CAS version, so test writes a new synthetic value. A UTF-8 helper edit initially failed and was corrected. Synthetic drafts remain; search DEMO for curated data. These failures were not hidden as a single first-run pass.
- Final typecheck/lint/diff-check PASS; npm source regression679/679 PASS,0 skipped. No image/front-end rebuild needed: this task runs the immutable approved candidate.

## Visible difference from recorded 18443 candidate

Recorded win01 source878de (old PR83 UI) remains separate; this task did not recheck/connect to18443. D099 restores PR64 green-sidebar/warm-gray/white-card styling, heading/More/search information hierarchy and grouped business cells. It preserves Server/session/RBAC/CAS and existing Editor cost usability. New creation remains type-first; existing users' stored field preferences are not automatically rewritten. Comparison reference is [prior synthetic before frames](../assets/quote-original-convergence/README.md), not a newly captured real win01 screen.

## Minimal proposed AGENTS addition — not adopted

A/B/C complete feature code/tests and a scoped evidence report; Codex D verifies current integration state, candidate identity and isolation, then supplies a user-accessible UI/API Preview before requesting a merge decision. Keep Preview and feedback until explicit user disposition. Automated PASS never substitutes for USER ACCEPTANCE. Backend-only PRs provide concrete API/business demonstrations; where no UI exists, say so and let the user decide whether to allow an earlier merge. Merge and real deployment remain distinct authorizations. Secrets and real business data never enter Preview fixtures. This is a proposal only; AGENTS.md/Active decisions unchanged.

No real Ainuoke/credentials/PG/COS/win01/legacy browser operation, real migration, deployment, PR merge, or87/88 integration occurred.
