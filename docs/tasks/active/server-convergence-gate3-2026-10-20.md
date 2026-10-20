# Server convergence Gate 3 — navigation continuity

2026-10-20; main `996dfedc12da3527343cd3ff2aa5eea35497e10e` reverified through
GitHub before this phase. Branch `codex/server-navigation-continuity` starts there
then explicitly fast-forwards to fixed accepted integration
`b4c47f1356205e1f064f714ce1fb51efb58e2823`. Initial worktree clean, no inherited
dirty hunks. Sole implementation owner uses 7bf3; independent reviewer is read-only.
The persistent target's immutable tools do not use this changing checkout.

## Inputs and delivery facts

Gate2 local tests: 920 project (including 116 baseline), 434 backend/integration,
52 actual-browser, 112 clients; types/Node/lint, default/Server builds and exact
996 guard PASS. Both 120/57daca3d and 121→122→123/ebe4cb16 original histories remain.
The integration ref b4c47f13 is independently verified remote and has no duplicate
cumulative PR. Tool-only 956921f63ba3069c059ca64c2324edbc33afefd8 is draft #126;
its independent pure-main 116 baseline and exact guard passed. Source files were
copied by exact paths, not a wholesale business cherry-pick.

Each branch was uploaded once and independently verified despite contradictory
tool classification; no retry. #126's three Hosted checks are running. Only the
three acceptance workflows were dispatched on b4: 39359434158/source,
39359438237/team-access, 39359442064/baseline. Verify every run.head_sha and actual
conclusion; no CI PASS is claimed yet. Existing #120–125 heads are unchanged.

The user now supplies standing authorization for Git recovery/PR/CI within the
approved engineering plan; see git-delivery-resilience. Do not ask repeated upload
questions. Keep bounded attempts, exact source/remote evidence and separate local/
remote facts. No auto merge, formal deployment, real account/business DB/source
scope expansion, retirement or shared TLS/proxy changes.

## Approved change and narrow scope

The user approved eliminating full-screen navigation flashes while preserving
existing menu/layout and dirty protection. Prefer the minimal repair, no router
rewrite, framework replacement or redesigned navigation. Existing real-browser
Gate0 evidence observed .rsc as application/octet-stream followed by full document
navigation; source confirms no .rsc type and identity checking/error outside Shell.
Reproduce against this actual combined build before selecting the final fix.

Allowed scope: server/static-files.ts, shared AppShell and QuoteServerBoundary,
their minimal loading/continuity helpers if needed, focused static/API and actual
Chromium navigation tests, exact path UI-impact and current feature/state docs.
Do not change domain APIs/schema, catalog/permissions, formulas, server allowlist,
source activation, Browser repositories/storage namespace or old environments.

## Acceptance

Actual Server/session/snapshot build + Node API with uniquely owned disposable PG,
synthetic accounts and fresh private Chromium only. Record content type/cache,
document versus RSC requests, Shell/sidebar visibility/identity and selected state.
Cover primary routes, refresh, back/forward, slow page requests, failed route/data
requests, identity restoration failure and expired session. Preserve accessible
local loading/error/retry, unsaved edit/exit/logout guards, login return and amount
permissions; do not hide failures or insert artificial UI delay.

Capture new before/after screenshots only to ignored outputs; never overwrite
frozen historical PNGs. Verify desktop, compact and mobile layout without changing
density. Run relevant SQL/API/browser/root regression, types/lint/build, baseline
and exact source guard, independent review and precise remote CI. Final runtime
upgrade/user acceptance are separate; 62426 remains Gate1 and 50426/3001 unchanged.

Current state: baseline recorded; no application edits or new test results yet.
