# Codex A — D-099 list acceptance repairs

## Gate 0 (2026-10-09)

- Independent worktree/branch `fix/d099-quote-list-acceptance`, fetched main `49a82c9f970e158ded589300b4aa04fc4c809038`, clean baseline. Standard checkout and Codex D's Preview checkout unchanged.
- Failing pure regression: grouped drag overwrites `columnWidths.brand` (320 vs old120), contaminating independent view. Settings modal shows individual fields while rendered columns combine children; no stable group-width identity. CSS `width:auto !important` overrides pixel widths at primary desktop; 100% fixed table redistributes surplus even without that override.
- Actual Chromium unmodified build: four fine-pointer widths1920/1440/1280/900 failed40px drag assertion; numeric settings lacked cost-summary row. Measurements were real `getBoundingClientRect()`, not saved JSON. Disposable PostgreSQL/tmpfs, memory storage, temporary profile cleanup PASS. Failure tests retained; not claimed as implementation PASS.
- Style cell is hardcoded placeholder; summary has no relation. Existing attachment download already requires trusted `quote.view`, exact Quote/Revision/attachment relation, available lifecycle and object size/hash verification.

## Scoped read-only contract (before implementation)

When requested columns include `styleImage`, each bounded list item may expose `styleImage: null | { attachmentId, mimeType, byteSize, sha256 }`. Lookup requires default Revision's `styleImageAttachmentId`, matching same Quote/Revision image relation marked style, available attachment and supported image MIME. Not selected: field omitted. No storage key, URL, filename, binary, historical aggregate or Estimate. Existing authenticated scoped download rechecks permission/relation/object; no new write endpoint/schema/storage service. UI lazily loads visible images, limits concurrency, deduplicates table/touch mounts, releases URLs/cancels after removal/logout. Missing/unavailable -> explicit placeholder, no Browser fallback.

## Boundaries

No real18443/18444 runtime, real DB/COS/credentials/profile touched. Published migrations unchanged. Preview deployment belongs to Codex D after independent review. ENGINEERING IN PROGRESS / USER ACCEPTANCE PENDING.

## Gates 1–3 engineering checkpoint

- Numeric settings now address only currently visible, authorized presented cells. Additive `groupWidths` stores stable group keys separately from old `columnWidths`; old raw v1 storage is not rewritten on load. Switches preserve each layout's widths; explicit restore is the only reset. Pixels capped720, shared floors56 plus identity156/quote180/cost126/quantity72/type/date80/other88.
- Server list opts into `DataTable layout="fixed"`: exact summed pixel width, no container-surplus redistribution, internal scroll and sticky action. Existing fit/readable semantics remain. Browser-only primary desktop CSS no longer overrides Server widths. Resize handle stays inside its header; resize does not initiate column reorder.
- Read-only minimal image contract implemented above. Lazy visible-image loader: max25 cached relations/page, max3 downloads,30s abort, MIME/size/SHA verification, table/touch deduplication, release on hide/unmount/identity change. No Object Storage changes/new thumbnail provider. This is bounded protected original-image access displayed48px, not a newly generated thumbnail object.
- This run: focused actual Chromium16/16 (eight original/fields pixel scenarios, numeric/keyboard/order/reload/relogin/old preference, valid bytes/hash, switch/invalid/missing/unlink, no-permission/no-hidden fetch and URL revoke); API/business list/Quote API/attachments31/31; auth/frontend71/71; presentation/shared-table SSR7/7; typecheck/lint/diff-check PASS; Server frontend41 routes PASS. Synthetic screenshot/pixel evidence under `tasks/assets/d099-list-acceptance`.
- Initial full Chromium run found two outdated test assumptions: all Quote-prefixed GETs were forbidden (including newly authorized image download), and group width was expected to overwrite labor field width. Updated assertions still forbid full aggregate GET and now prove independent labor width remains92. First expanded focused run had a race reading headers during the bounded summary reload; now waits for the actual restored/reordered table rather than100ms. No assertion skipped/removed or permission/precision relaxed. Full final regression/Browser build still pending at this checkpoint.
