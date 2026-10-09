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
