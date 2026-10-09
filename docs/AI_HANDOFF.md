# AI handoff

## Active — original Quote UI / Server convergence

- Branch `fix/quote-server-original-ui-convergence`; verified base/main `edc3598764266de087c0f669f8bcf5452c6d3fd2`, clean start. Previous branch `ops/update-quote-trial-windows-ui` / `62af9d33fd1de9a981972405b0d1ef01b503d351`. Fetch succeeded. PR84 OPEN at audit; deployment-only changes excluded.
- Gate A: actual PR64 `7658663038b1da504c95086711f627b6dce5c7a0`, PR83 before/after and current code audited. See [matrix](tasks/active/quote-original-ui-convergence.md). No implementation PASS claimed yet.
- Preserve Server authority/session/RBAC/CAS/precision/workflows and PR83 sticky/Portal/table/cost fixes. Existing UI preferences never overwritten. D-096 historical import NOT REQUIRED; real trial/runtime/DB/COS untouched.
- Before screenshots captured with isolated PG/tmpfs + memory storage + owned Chromium profile: one opt-in capture test PASS, cleanup PASS. Not the full business suite. Local evidence `C:\Users\Administrator\.codex\tmp\quote-original-convergence\before`.
- Gate B: original grouped defaults + formal field preferences/independent view/permission-filtered touch records implemented. Targeted preferences/presentation/SSR 9/9, auth/frontend 67/67, Server build and isolated visual capture 1/1 PASS. Initial business run 52/62 exposed old flat/default-number assertions plus excessive grouped width; corrected layout and assertions, final suite still to run. No weakening of business/permission/precision assertions.
- Remote: Gate A push Connection reset; LOCAL checkpoints preserved, REMOTE delivery unconfirmed. Continue independent local Gates under AGENTS, no repeated small network retries.
- Gate C: shared CREATE QUOTE/base-info card restores type-first creation presentation; POST{} / returned ID/version / processing PUT and uncertainty guards unchanged. Persistence 13/13 and actual creation/business paths PASS in second Chromium run; final run pending (two XLSX assertions used old column positions, now corrected to semantic headers without weakening value/source checks).
- Next: Gate D Editor/visual regression, Gate E final full regression/screenshots/independent PR. USER UI ACCEPTANCE PENDING; no deployment authorized.
- [Historical deployment and UI evidence](tasks/completed/2026-10-09-windows-trial-delivery-history.md) retains dates/hashes/results/limitations; [earlier history](tasks/completed/2026-10-09-pre-trial-state-history.md).
