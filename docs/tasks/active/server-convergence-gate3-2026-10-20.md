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
tool classification; no retry. #126's three Hosted checks passed at exact 956921f6:
39359291338/source, 39359291427/team-access, 39359291398/baseline. Only the
three acceptance workflows were dispatched on b4: 39359434158/source,
39359438237/team-access, 39359442064/baseline. Verify every run.head_sha and actual
conclusion: all three completed success at exact b4c47f13, independently rechecked
through GitHub API. Existing #120–125 heads are unchanged.

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

## Implemented repair and observed causes

The actual combined Server build reproduced full Document navigation with `.rsc`
served as `application/octet-stream` and public caching. Correct MIME/no-store
restored soft routing, but the page-owned Shell still remounted. A trusted root
frame now survives route changes; the existing page AppShell registers only its
title/back/feature callbacks, scoped by route and trusted identity. Page data and
dialogs do not persist across routes. Identity checking/error use local states
inside that frame; anonymous/login still have no protected workspace. CSS order,
responsive breakpoints, menu allowlist and permission projection remain unchanged.

Initial observations are in ignored outputs/server-navigation-continuity,
server-navigation-continuity-rsc-only and server-navigation-continuity-frame.
The first observer incorrectly selected `.ops-header`; that header metric was
invalid and is not evidence. The final harness uses actual `.ops-topbar` and
samples Shell/topbar presence through real route requests and animation frames.

Soft routing exposed existing full-Document-dependent exit protections. Feature
owners now register dirty/in-flight/unknown-receipt state with one Server guard;
their existing save, discard and receipt reconciliation remain authoritative.
Public router/link/menu/history/logout departures use those states. The actual
browser proved that a later window capture listener cannot reliably beat the
framework's popstate listener. A Server-only beforeInteractive dispatcher indexes
public History operations before the router captures them, preserves caller state
semantics, and runs registered UI guards first. It does not patch framework
internals, persist business data, or depend on the Navigation API.

Known Back/Forward/go(-2) restores the known entry before asking and preserves the
Forward stack on cancel. Same-page fragment history keeps the draft. Foreign
unindexed entries cannot be safely guessed or overwritten: preserve the current
draft, explain the address may differ, and use a fresh Document on the next
explicitly approved destination. Actual sidebar recovery asserts one business
confirmation and exactly one Document request; the browser's native beforeunload
last protection may additionally appear after real user activation. This is not
a claim of one total OS/browser prompt. Late create receipts cannot navigate once
their owner or trusted identity scope has disappeared. Active Quote read 401s now
invalidate the session rather than keeping protected page content mounted.

The guard is UI-only: no schema, business API, catalog, formula, source scope,
Browser repository/storage key, creation command or permission change. Existing
historical writer components register protection without reopening their routes.

## Checkpoint verification and delivery shape

Before the source checkpoint, typecheck, full lint and explicit Server builds
passed. Focused actual-built Chromium passed 23/23 combined navigation/order-sale
cases; the last recovery-only run passed 16/16. Tests cover responsive 1920/1280/
900/390, latency/data failure, identity retry/401, dirty history/fragment routing,
unknown creation receipt with one POST, nested source submission, late response
after a different user logs in and foreign history recovery. The focused root
contracts passed 190 before the last added dispatcher unit; the final seven
History tests, full root suite, exact source build and release guard are still
required before Gate3 local PASS. Failed exploratory tests are retained in ignored
logs; prerequisites now abort the acceptance phase instead of cascading false
results. No full regression or remote Gate3 CI is claimed at this checkpoint.

Independent read-only review found no remaining implementation blocker. It
checked History replace semantics, owner/scope cleanup, nested source protection,
the real-sidebar recovery assertion and the explicit CI commands after Server
build. It did not execute tests or approve deployment. Final source/commit review
follows the full regression. All browser/DB fixtures are synthetic and disposable.

Gate0 prohibits a duplicate cumulative business PR. Until #120/#123/#125/#126
dependencies are user-approved and merged, deliver Gate3 as an exact verification
ref plus only source/team-access/release-baseline workflow_dispatch checks; no
temporary stacked/cumulative PR. Later forward-merge the then-current main,
prove main..HEAD contains only Gate3 delta, reconcile baseline and rerun before
creating the unique draft PR to main. This preserves original history and does
not pre-approve merges. 62426 still runs the Gate1 image; no runtime cutover.
