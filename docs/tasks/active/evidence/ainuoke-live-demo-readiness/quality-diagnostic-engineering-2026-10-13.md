# Gate 1 — bounded quality diagnostic engineering (2026-10-13)

Baseline: main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`; previous reconciliation checkpoint `e5a62a574e15ad78e0efc200180ce99e27d429be`.

The existing full private preflight lacks raw color/unit fields. A separate explicit `quality` collector mode reads only requested fixed 6087105/6087050 reports, locating current InsideOrderNo through trusted 6086103 Discovery before and after the bounded read. No repeated full material collection, Pool, migration, scheduler or Source activation is introduced.

Limits: at most 25 unique problem contracts, six color contracts and 18 material contracts; 160 report attempts, one auth renewal, 600 seconds, 100,000 rows and 32MiB. Complete paging is required. The existing targeted/audit/runtime limits and mappings are unchanged. The new PowerShell wrapper consumes an owner-only CredentialFile privately via anonymous stdin, checks an owner-only ignored request and writes owner-only ignored reports. Its stdout is the anonymous receipt only.

Analysis reuses the actual color/material adapters and pipeline. It keeps source quantity zero, blank, invalid, negative and positive without document distinct; blank without an event remains business-unverified, not automatic zero. Missing unit does not imply unknown purchase. Unit conflicts preserve raw QtyUnit and demand/source identities in the private report and keep projection totals blocked. No formal material calculation or UI changed.

Synthetic validation: TypeScript typecheck PASS; 11 diagnostic Node tests PASS; 27 Python diagnostic plus existing source tests PASS. These are engineering checks; real targeted findings are not yet claimed. Frozen full preflight evidence is unchanged.

Report lifecycle repair: the first bounded live read reached analysis but normalized color DTO sizeRuleTokens triggered the unchanged secret-key guard before any diagnostic report write. Rename only this domain evidence to sizeRuleLabels, keep the shared guard strict, and persist the bounded raw evidence before analysis for offline replay. The 11 synthetic tests now include inspect(privateReport); no credential or raw payload was printed. No full collection was repeated.
