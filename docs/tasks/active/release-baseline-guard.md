# Release baseline guard — 2026-10-12

## Authorization and baseline

- User authorized an independent worktree/branch, baseline/capability inventory,
  state reconciliation, minimum blocking checks, tests and one PR. No UI redesign,
  production route activation, database change, deployment or automatic merge.
- Worktree: `C:/Users/Administrator/.codex/worktrees/release-baseline-guard/zhixu-ainuoke-api`.
- Branch: `chore/release-baseline-guard`; initial HEAD and GitHub main:
  `4adbc30845f99368caa77d3431cc67a6440ac623`; initial worktree clean.
- Existing audit worktree remains detached at `70ff95e2cd226546730c331c3fecc1d9f09fddc9`;
  no existing worktree or business data is part of this change.
- GitHub API confirmed current main. Initial managed creation failed because its
  commit object was absent. Default fetch failed with connection reset. One bounded,
  process-only OpenSSL/HTTP1.1 read returned the exact SHA; a bounded fetch over that
  verified transport succeeded. No persistent Git/TLS/proxy/auth configuration changed.
  Network root cause and future push reliability remain unverified.

## Scope and evidence

The manifest records 9 page contracts, 8 capability records, 27 evidence references
(including 11 PNG byte hashes), production/preview CSS order and two historical
runtime observations. It preserves PR64 plus approved PR89/91/P6 changes rather
than rolling back later acceptance. Login brand approval remains unproven.

The read-only CLI checks base/source commit availability, evidence path/hash,
CSS order/required Foundation, responsive snapshot, production route allowlist,
independent status dimensions, current-document anchor and changed-path UI impact.
V2/V3 require an explicit approval reference; independent human review must verify
that reference, since a PR can change its own policy. No automatic PNG updater.

CURRENT_STATE/AI_HANDOFF/PROJECT_INDEX now distinguish merged PR91/92/93/94 from
the older runtimes. Prior dates/hashes/results/limitations were archived intact
with links pinned to original main. UI_FOUNDATION only adds a factual conflict
notice; D-023 and runtime breakpoint code remain unchanged.

The hosted PR workflow has contents:read, no persisted checkout credential,
no production secret/self-hosted runner, and no deployment action. Required-check
repository settings were not changed. The workflow is not full browser visual CI.

## Verification

- Locked dependency install with lifecycle scripts disabled: PASS; no package-lock change.
- Initial actual guard correctly failed on three stale state-document anchors;
  after reconciliation: PASS, changed UI files = 0.
- Dedicated guard/responsive suite: 42/42 PASS, 0 skipped (22 new guard + 20 existing).
- Full root `npm test`: 780/780 PASS, 0 skipped. No actual business DB/profile involved.
- Targeted ESLint with max-warnings 0, Node syntax and git diff-check: PASS.
- Eight affected Markdown files: 24 relative links resolve; code fences balanced.
- UI/API/SQL/ops source diff: empty. No new baseline screenshots, browser/PG/build,
  real Source, runtime, roles, objects or deployment acceptance claimed.
- Full TypeScript/frontend/server builds and PG/Chromium suites NOT RUN: no affected
  application/SQL inputs. Historical counts remain historical, not this task's results.

Final exact-commit/remote/PR evidence belongs to the delivery result; no self-SHA
documentation loop. The old audit worktree and its ignored documents remain intact.
