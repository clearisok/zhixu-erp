# PR #92 P6 original UI restoration — 2026-10-11

## Gate 0 — deterministic visual failure

User rejected the night P1–P5 UI; prior automated7/7 is historical functional evidence, not accepted visual evidence. **USER UI ACCEPTANCE PENDING** throughout this repair. P6's stated original layout is the baseline; no redesign or real511-order access.

Worktree D:/workspace/zhixu-order-material-b, branch feat/ainuoke-order-material-progress. Initial local/remote/PR exact HEAD d18b5db3e0f88bc2ebc58f909ee8fc8e355a3faa, latest fetched main fcf36e5eab6c78254f808c1cba38f3a63a66d4f8; branch divergence0/0, #92 OPEN/Draft. Only inherited dirty order-material-read-gate1.md30lines, SHA2568B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E, never edited/staged.

Root app/layout.tsx loads app/foundation.css after feature CSS; integration-preview/main.tsx omitted it. Added real private-Chromium assertions first, before adding CSS. Original1440/1280 .qc-toolbar display:block,height412; .qc-responsive-record-list display:block while desktop table also visible; filter controls span346px vertically. Foundation style absent.390 toolbar also block. No root overflow existed, proving that previous no-overflow check could not establish correct layout.

Red test:7tests,3pass/4fail,0skipped (three width cases fail + parent). Business/safety siblings remain passed, no assertion removed. [Before screenshot](evidence/order-material-p6-restoration/before-1440.png) and [actual computed metrics](evidence/order-material-p6-restoration/before-computed-styles.json). Only own random PG16/synthetic sessions/private browser were used and cleaned.

The current formal DTO exposes colorName,quantity,deliveryDate but no garment size grid. This Gate may rearrange/display those facts and honestly label size data as not connected; it must not fabricate sizes or change API/DB.

The P6 image itself is not present in this turn's readable attachment context. Comparison will cover every explicit P6 requirement in the user's message and the existing formal component/CSS; no pixel-identical claim or user acceptance will be inferred.
