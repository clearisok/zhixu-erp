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

## PR95 pre-merge repair — 2026-10-12

- User authorized fixing all five review findings in the existing PR, all eight
  false-PASS regressions, local/CI checks, evidence/docs and a new pre-merge review.
  No UI redesign, production routes, DB, 18443/18444 or automatic merge.
- Repair baseline: same branch/worktree, clean HEAD
  `b5411b68618e663d97ca50ac5bb9f49bc688193e`; GitHub PR95 head matched, base/main
  remained `4adbc30845f99368caa77d3431cc67a6440ac623`. The original implementation
  and its first CI PASS did not prove the omitted adversarial cases.
- F1: JS/TS helpers, styles, assets and UI build inputs require explicit impact
  review; pure domain changes can declare V0 with evidence. No app helper changed.
- F2: CSS uses actual TypeScript AST imports, excluding block comments, template
  examples and type-only imports. Both production and preview are covered.
- F3: v2 verifies all 27 frozen Git blobs/hashes, retains immutable IDs and old
  PNG bytes, and allows explicit forward document revisions. The real PR-base
  manifest is the comparison source; first-PR bootstrap pins reviewed b5411b6.
- F4: 56 scoped status claims bind dimension/value/document/source/environment;
  contradictions, status changes with old/relabelled bytes, and runtime identity
  changes without new proof fail. These typed claims preserve the eight existing
  capability statuses; they do not create deployment or Source evidence.
- F5: all three current documents reject empty, whitespace-only or absent anchors.
- Portable runtime dates now use committed deployment evidence (2026-10-09/10),
  not a later local audit timestamp. Existing source/image identities are unchanged.
- `R95-1`…`R95-8` reproduce the eight original false PASS cases. Additional tests
  cover both CSS entries, all three documents, helper/asset/config paths, history
  deletion, missing blob, renamed old proof, valid forward revisions and genuine
  new proof. Temporary fixtures contain synthetic changes only.

### Repair validation

- Dedicated guard/responsive suite: **67/67 PASS**, 0 skipped (47 guard + 20
  responsive; 25 new tests). Final root `npm test`: **805/805 PASS**, 0 skipped,
  including all 67 after the final local-default/history portability adjustment.
- Explicit actual-main CLI and default local/HEAD CLI: PASS, 9 pages / 8
  capabilities / 0 changed UI inputs. PR CI continues to use its actual base SHA;
  default local inspection does not claim to review a whole PR.
- Targeted ESLint max-warnings 0, Node syntax, git diff-check: PASS.
- Six changed Markdown sources: 19 relative links resolve, balanced code fences.
- All 11 PNG identities/hashes, eight capability status values/scopes and two
  runtime source/image identities are unchanged from reviewed b5411b6. All 27
  frozen evidence blobs resolve; no screenshot regeneration or hash rewrite.
- App/components/features/server/database/ops/public diff remains empty.
  TS/frontend/server build, PG and Chromium NOT RUN: no application/schema change.

| Review finding | Executable regression | Required blocking result |
| --- | --- | --- |
| F1 helper TS | R95-1 | UI_CHANGE_UNDECLARED |
| F2 commented CSS | R95-2, production + preview | CSS_ENTRY_ORDER |
| F3 replaced document | R95-3 | EVIDENCE_WORKTREE_DRIFT |
| F3 wrong historical SHA | R95-4 | EVIDENCE_BLOB / EVIDENCE_HISTORY_CHANGED |
| F3 PNG + hash rewrite | R95-5 | EVIDENCE_BLOB_HASH / EVIDENCE_HISTORY_CHANGED |
| F4 unimplemented but active | R95-6 | CAPABILITY_OVERCLAIM |
| F4 Order status promotion | R95-7 | STATUS_TRANSITION_EVIDENCE |
| F5 empty state documents | R95-8, all three files | STATE_BASELINE_DRIFT |

### Pre-merge review handoff

Local re-review confirms the original eight cases now fail for their specific
reason, with unchanged/current and legitimate-forward-update positive controls
passing. Source-input coverage, AST semantics, frozen Git identity, old-evidence
reuse, status/environment binding and empty-document handling were inspected.
Default local inspection and unit fixtures do not require the first PR commit
after a future squash merge; only this initial PR's explicit old base uses that
reviewed ancestor as its bootstrap.

Commit/remote exact SHA, the repair commit's CI run and the **post-commit** final
review conclusion are recorded in PR95's current description/GitHub checks and the
delivery report. The original b5411b6 CI run is historical, not repair validation.
No independent human design/Source/runtime approval, required-check configuration
or full pixel regression is claimed; these remain explicit boundaries.

### Post-commit local re-review and delivery boundary

- First repair checkpoint: `b111d8cd5dcaac93652656076ec050744c449083`, clean.
  Both explicit-base and default-HEAD checks passed after this commit.
- Post-commit re-review found two adjacent coverage gaps: preview HTML inputs and
  commented old allowlist functions. Both are now guarded, with dedicated negative
  tests; no HTML page or actual authority/route source changed.
- Latest final root test: **807/807 PASS**, 0 skipped; this includes the complete
  **69 guard/responsive cases** (49 + 20, 27 additions over initial PR95). Earlier
  standalone 67/67 and 68/68 runs above remain stage-specific evidence.
- Final explicit-base CLI, targeted lint and evidence/scope checks: PASS. The
  screenshot/capability/runtime identities and empty application diff remain as
  recorded above. No further local blocker found in the five repaired areas.
- The delivery tool's b111d8c preflight returned `LOCAL_PASS_REMOTE_UNVERIFIED`,
  `NETWORK_DEGRADED`, pushes=0. One independent GitHub read still showed PR95 head
  `b5411b68618e663d97ca50ac5bb9f49bc688193e`, open/unmerged. No repeated automatic
  push, no authentication/configuration change, no claimed repair CI PASS.
- Per AGENTS, the final local checkpoint can continue safely. Its exact SHA and
  one tool-generated ordinary-PowerShell recovery command belong to the delivery
  report. Remote repair CI and final merge recommendation remain pending until
  exact-head delivery and that commit's checks are verified. Never reuse the old
  b5411b6 CI result for this repair.
