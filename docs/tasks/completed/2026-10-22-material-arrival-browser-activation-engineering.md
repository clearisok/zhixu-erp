# Material arrival browser activation: controlled engineering evidence

2026-10-22; root sole writer, existing reviewer read-only. Branch
fix/material-arrival-browser-activation starts from clean
c0d87bcd55fbda58db101f46d6e61b07f77db7df; independently verified main remains
996dfedc12da3527343cd3ff2aa5eea35497e10e. Scope checkpoint8aa17c7a and test source
72d0a0af8302e4aa761d587a3ca786296a23b4c0 preserve all prior original commits.

## Observed failure and bounded correction

Parent105's Source run39689481386 attempt1 failed waiting for the arrival dialog
title in the read-only-role phase. Its Team/Release passed; later Quote/Python
steps did not run. That original failure is preserved. There is no raw trace
proving its exact scheduling, so the following controlled reproduction does not
retrospectively establish the historical CI root cause.

The old open/openSaved helper checked enabled in one CDP evaluation and called
native click in another. Real Source completion queues another arrival GET;
loading disables the action. A disabled native button's click has no event.
The corrected helper checks current connected/enabled DOM and clicks in one
synchronous evaluation. It polls only before activation, then waits for the
dialog without clicking repeatedly. The existing16-second budget is unchanged.

The new private-browser regression retains a genuine synthetic API response at
a GET barrier. It proves enabled before refresh, then connected+disabled while
the reply is held; the old-style disabled click records0 events. While blocked,
the new helper records no click. After release it records exactly1 enabled,
connected click. Arrival GET count changes2→3, saved version remains7 and all
planner inputs remain disabled for the read-only user. Original no-Browser,
no-commercial-read, receipt, Source-failure, history and actor ABA assertions stay.

Only server/integration/material-arrivals-ui.integration.test.mjs changes.
No product, permission, API, SQL, workflow, UI, timeout or business-rule change.

## Actually executed at the frozen test source

- Node syntax, full lint, final typecheck, Node build and explicit Server frontend
  build pass. Build ID server-activation-72d0a0af-20261022, full source72d0a0af…,
  build time2026-10-22T07:24:50+08:00, session/Server/writable/snapshot authorities.
- Built private Chromium/owned disposable PostgreSQL:16/16 pass, no skip/failure,
  23374.3454ms; the controlled subtest641.1627ms. No existing browser profile used.
- Release regression116/116, no skip/failure,198257.996ms. Exact main996/head72
  source/evidence guard PASS,11 pages/57 capabilities/80 inherited UI paths.
- Independent static review reports no P1/P2. Reviewer did not execute fixtures;
  final metadata/remote delivery/new CI remain separate checks.

The first typecheck encountered only this task's extracted Docker-build source
copy under outputs: the broad TS glob also scanned its worker/D1 files. All2603
files were byte-hash checked against the retained original105 Git archive before
native move to a new private task directory outside this project scan. Source and
destination absolute paths were checked; no existing target was overwritten.
The archive/image and initial error log remain. No tsconfig/product workaround,
dependency install, shared configuration change or business-data operation.

No fresh project927/full PG270 claim in this test-only phase. The previous image
8/8 and its41-file/0042 evidence remain at their own source105. That image was not
rebuilt or relabeled for this test fix. Parentc0d exact delivery and Release
39692878584 attempt1 success are also separate from this phase's final CI.

## Preserved boundaries

Only successfully prepared synthetic test fixtures and their private browser
profile are cleaned by the existing harness. Protected ports, containers, volumes,
accounts, Browser data, worktrees and backups remain. No real Source request or
credential/private-report read, binding, activation, scheduler or business DB.
PR120–127 heads/drafts were reverified unchanged. This is a forward verification
ref, with no duplicate cumulative PR, merge, close, deployment or cutover.
Num/outdate stays confirmed; other original pending decisions are not defaulted.
The full Goal remains active; a passing test fix does not complete the ERP loop.
