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

## Full-regression finding at source b278602f

The first fixed-source build is b278602fc670f13bb4df29691d2b98b7ffa86fbc,
server-g3-b278602f-final, 2026-10-20T03:47:39.1780993Z. Types/Node compilation/lint
passed; 158 auth/client/team/session/log checks passed. Explicit baseline 116/116
passed. Root was 926/927: one old textual contract expected an inline route
predicate, now factored to the same enabled boolean; it was updated to verify both
the predicate assignment and fail-closed unsupported-route branch.

Actual browser was 67/69, with one failed processing-creation subtest and its
parent. This exposed a real new-page handoff regression: replaceState updates the
request parameter and unmounts the nested create button before the POST resolves.
Its strict unmounted-owner permit correctly refuses navigation, but the mounted
Recovery's first GET can still be pending. The repair keeps the strict shared
permit, explicitly hands the same request ID/scope to the still-mounted Recovery,
and lets that owner handle the original response. Started ID is recorded before
URL/POST; stale scope/request/unmounted callbacks are ignored. Receipt state is
ID-bound and committed is not downgraded by a late pending GET. Active 401s use the
same owner/scope protection; an old failure cannot invalidate a later login.
No polling or repeated POST was added. List creation keeps its original owner.

New actual-browser cases cover successful /new creation with one POST and both
list/new late responses after another user logs in. Fresh typecheck, targeted
lint and 9 History/authority contracts passed on the patch. Full exact-build,
browser and root reruns remain required; this is not yet Gate3 PASS. The original
failed logs and first build identity remain preserved under ignored outputs.

## Final local engineering (2026-10-20)

Application source checkpoint: `ed5821ba6b15a471c283f94e40f9a1e4257c3658`.
The only subsequent executable change corrects the acceptance harness: Card's
title is an HTML attribute, not visible body text; wait for the actual explanation
and hydrated create button. No application behavior was changed by that fix.

- Full root **927/927 PASS** (342628 ms), including all 116 release-baseline cases;
  explicit baseline command also passed 116/116. Types, Node compilation and full
  lint passed; the final changed harness also passed targeted eslint.
- Auth/client/team/session/log API checks **158/158 PASS**; no backend change after
  that run. Earlier Gate2's 434 tests remain earlier evidence, not a new Gate3 run.
- After the harness correction, navigation passed separately **18/18** on the
  first exact ed5821ba build. The six business suites had passed **53** in that
  preceding attempt. These were separate runs, not an invented 71/71 result.
- Default Browser build passed, 2026-10-20T04:09:46.7237226Z,
  browser-g3-ed5821ba; root/list/new emitted no Server History script. No Browser
  profile or long-term store was initialized, copied or reset.
- An auxiliary byte-reproduction assertion after rebuilding Server did not pass:
  all 210 files existed, compiled/assets were unchanged, but 90 HTML/.rsc outputs
  differed. No deterministic-build or exact-byte restoration claim is made. A
  fresh actual-timestamp Server candidate was therefore built and fully retested.
- Final candidate: server-g3-ed5821ba-restored,
  **2026-10-20T04:12:39.4179942Z**, server/session/snapshot, source ed5821ba.
  On this actual candidate all seven Chromium suites passed **71/71** in one run
  (148694 ms): navigation18, continuous13, login10, business-source7, sale7,
  processing8, team/log8. Zero failures, cancellations or skips. Screenshots and
  frame/request measurements are in ignored outputs/server-navigation-continuity-
  restored-ed5821ba; previous dated/build-specific attempts remain untouched.
- Exact main-996 release guard PASS: 11 pages, 46 unchanged capability records,
  36 combined UI inputs. New Gate3 V1 record covers exactly its own 22 paths.
  All original 220 evidence records are unchanged; D148 adds one forward document
  revision bound to b278602f's exact committed blob. No screenshot/status rewrite.
- Independent read-only review checked actual code, source/ID/scope guards,
  original evidence and logs; no remaining implementation blocker. It did not run
  tests or approve deployment. Real-source reads, target upgrades, user acceptance
  and final Hosted CI are separate from this local PASS.

Git read-only diagnosis observed default transport PASS and two process-only
contrasts uncertain_transport; no shared configuration changed. This is evidence
of intermittent behavior, not a permanent root-cause repair. Under standing user
authorization deliver the clean final checkpoint once through the existing tool,
then independently verify remote SHA before dispatching the three acceptance CI.
Remote Gate3 verification is pending at this document checkpoint. Final commit is
resolved from the branch HEAD; it contains the unchanged application checkpoint,
the tested wait correction and this documentation. No cumulative PR will be
created; after dependencies merge and a fresh main-delta check passes, create
only the unique incremental PR.

## Remote verification and narrow CI compatibility follow-up

Final local checkpoint `0123f421089fc1d15f054b7140263277778460d5` was uploaded
once by git-delivery.ps1: DELIVERED_VERIFIED/pushes=1, then independent GitHub
ref inspection returned the same full SHA. Worktree clean; main remained 996.
No PR existed for the cumulative verification ref and none was created.
Only three acceptance workflows were dispatched: source39369188594,
team39369191735, baseline39369194657, all with exact 0123f421 head_sha.
Baseline completed success. Team reached SQL/API after passing types/lint/root,
then exposed a pre-existing pagination-positive-control assumption in
quote-audit-read.integration.test.ts:185. At this checkpoint Source is still
running, not claimed green. No deploy workflow was invoked.

The audit fixture inserts 108 q1 events in one transaction. Default now() gives
the same timestamp, so the production's correct UUID tie ordering can put the
sole estimateHistoryCount row outside the first 100. The restricted actor already
checks both pages and all negative assertions passed. The full actor's positive
control now also reads both pages, asserts exact 100+8 pagination/108 unique IDs,
then checks the probe and count field over the complete history. Production
query, permissions, timestamp seeds and restricted assertions are unchanged.
Independent read-only review verified this diagnosis in SQL/repository/test code.
The first directed log suites passed 12/12; final strengthened page assertions,
types/lint and exact commit guard are rechecked before one new bounded delivery.
This is a test-only CI compatibility fix, not a changed audit/business policy.

Final strengthened test and related business-log suite passed **12/12** (12178 ms),
with zero failures/skips/cancellations; fresh typecheck and targeted eslint passed.
Independent read-only diff review confirmed restricted assertions, production
operation-log code and the 221-record manifest have no change. Do not repeat
browser builds or old failing CI merely for this test-only patch. The new exact
checkpoint still requires the three named CI; superseded non-deployment Source
run may be cancelled after its replacement exists, with that result retained.

### Full source-page coverage and final test compatibility

The audit compatibility checkpoint `22b50178c68224ec47b6f149f599d8a3c799f2c3`
was uploaded once and independently verified exact. On that SHA team39370370980
and baseline39370373372 completed success. Source39370368419 was cancelled after
the earlier Source run exposed another known old UI expectation; it is not PASS.
Original Source39369188594 finished failure on the material-settings topbar
unknown-save dialog assertion. Its backend, source build and preceding navigation
steps passed; no partial step or cancelled run is called a complete workflow PASS.

That old material test expected the feature's pending dialog from the topbar.
The restored root guard intentionally handles ordinary Shell/Link/History
departures first and exposes the shared notice with the feature's exact reason.
Dirty/nonpending navigation still uses the original feature dialog. The test now
checks the shared title/reason, unchanged settings URL and still-locked inputs,
then closes the notice and retries the same request. Exact body equality, one
version/audit increment, concurrent conflict and revoked-writer checks remain.
Production code is unchanged. Existing domain-specific explicit discard, including
the bottom return button's warning, remains authoritative; this Gate does not
silently abolish that business action or claim every explicit discard is banned.

Actual material-display suite passed **10/10** (18951 ms), and the previously
unselected processing-batch/material-history/payment-panel suites passed **26/26**
(57537 ms), all on the same ed5821ba-restored candidate, synthetic owned fixtures,
zero failures/cancellations/skips. These are 36 additional checks, separate from
the earlier single 71/71 browser run. Local acceptance now includes all existing
Source workflow UI surfaces. Targeted eslint/diff checks and independent read-only
review passed; assertions are stronger, not removed. No application/schema,
business permission, source activation or evidence-manifest change is involved.
Commit this final test/doc compatibility delta, check its exact main guard, upload
once and run the three fresh acceptance CI. No repeated run of a known bad SHA.
