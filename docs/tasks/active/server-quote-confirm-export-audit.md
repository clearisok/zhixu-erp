# Quote Server confirmation / customer export / read-only audit batch

2026-10-09. Base main: `abd2587959fa3341c6de61d0bcd2d67b4cb66802` (PR #77 merged).
Branch: `feat/server-quote-confirm-export-audit`; initial working tree clean.

| Stage | Scope | Status |
| --- | --- | --- |
| A | Trusted current PV confirmation; linked-current ownership; existing UI | Unlinked PASS in final API8/8 + Chromium47/47; linked write disabled (saved-PV currency/CAS gap), never local fallback |
| B | Built-in formal template, exact saved current/history Excel, trusted generation audit | API 10/10 PASS; current linked terms / history snapshot / incomplete provenance / image CRC included |
| C | Cross-page stable selection, customer XLSX ZIP, honest partial failures | API 8/8 PASS; per-item warnings and safe identity snapshots retained |
| D | Server event pagination/filtering, Quote/global read-only logs, sensitive isolation | API 7/7 + actual Quote/global UI case PASS; >100 events, detail, paging, empty/filter/fault/permissions |
| E | Combined disposable API/Chromium/regression/build validation and one PR | ENGINEERING PASS: API64/64 + foundation/API/numbering34/34; auth/frontend58/58; Chromium47/47; npm674/674; quality/builds/cleanup PASS. REMOTE DELIVERY BLOCKED |

One branch, stage checkpoint commits, one PR; no automatic merge/deployment. Default Browser behavior preserved; explicit Server only. All data/storage/accounts are synthetic/disposable. No real runtime/ports 3000–3002, DB, Browser profile, COS or secrets. D-096 historical import NOT REQUIRED.

Each stage updates AI_HANDOFF with executed tests, commit and remaining work. Pure network failure: attempt push once, then stop remote writes but continue independent local stages under this task's explicit exception. Authentication/divergence/conflicts are not network exceptions.

Do not invent business policy: shared current is not a second PV snapshot writer; historical snapshots immutable; lookup failures fail closed. Customer exports exclude Estimate entirely, use existing calculator/formatters and unchanged repository template. Server audit records generated files, not user disk saves. Linked dependency gaps may be explicitly disabled while independent stages continue.

## Delivery recovery / Draft PR body

Title: Connect trusted Quote confirmation, customer exports and read-only audit

Base: main; head: feat/server-quote-confirm-export-audit. Do not merge. First query this head's existing PR after successful manual push, avoiding duplicates.

- Engineering scope A–E: trusted current unlinked PV confirmation; saved current/history built-in ExcelJS customer XLSX; bounded cross-page customer ZIP with verified manifest and honest failures/warnings; exact Server Quote/global read-only audit.
- PARTIAL: linked shared-current write is deliberately disabled pending saved-PV currency/Quote-CAS eligibility; no second local current writer. Current linked export uses shared terms; historical exports remain snapshot-owned.
- Validation: disposable PG API64/64 + Quote foundation/API/numbering34/34, auth/frontend58/58, actual Chromium47/47 (real bytes/SHA/XLSX/ZIP/image/Estimate isolation), npm674/674; typecheck/lint/Server build/Server+default Browser frontend/diff-check/cleanup PASS. Default build-info browser/browser/writable. Unchanged binary template and existing calculation rules.
- No SQL/catalog changes, production deployment, real DB/Browser/COS/secrets access, schema activation, history import or auto-merge. D-096 historical import NOT REQUIRED. Whole-Quote copy/delete, Revision deletion, Quote-to-Order and internal summary remain deferred.
- Local checkpoints A760abb9 / B46f9994 / C198c734 / D1df82bf / final E commit; first push failed connection reset, no repeated remote writes. One Draft PR only after remote delivery is recovered.
