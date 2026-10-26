# Release baseline and capability guard

## Purpose and authority

This developer gate protects the existing D-099 + later approved D-102/P6 UI and
separates engineering, merge, deployment, human acceptance and source activation.
It does not approve designs, run deployments, query databases or open routes.
GitHub/code/approved decisions remain the facts; the manifest is a dated snapshot.

Run from the repository root (Node 24, Git; locked npm dependencies including the
existing TypeScript parser are required):

```powershell
npm run check:release-baseline -- --base-sha <verified-full-main-sha>
npm run test:release-baseline
```

Without a CLI base, local inspection compares working changes with HEAD and loads
HEAD's manifest as history. It does not claim to review the whole PR. This remains
usable after squash merges and deletion of the first PR's branch.
PR CI always passes the actual PR base SHA; a stale snapshot fails. This is not
a network lookup: verify/fetch main independently before updating the snapshot.
The guard checks committed, staged, unstaged and untracked UI paths relative to
that base; it never stages or rewrites them. Missing objects stop the gate.

For `pull_request` CI, `scripts/resolve-pr-validation-base.mjs` selects the first
parent of the merge actually checked out. It first verifies the event, PR merge
ref/number, exact checkout SHA, exactly two parents, the second parent against
the event's PR head SHA, and both local parent objects. A stale event `base.sha`
is logged but never used as the comparison base. Invalid PR context fails rather
than falling back to default inspection. No network request, floating ref or
guard exception is introduced; `workflow_dispatch` retains the default command.
The reproduced failure and tests are in
[the CI context task](../tasks/active/release-pr-base-context-2026-10-23.md).

## Inventory and minimum blocking checks

- [baseline.json](../release/baseline.json): nine routes/component owners and
  scoped approval records, eleven immutable PNG hashes, current CSS entries,
  observed responsive breakpoints, Server route allowlist, eight capability
  records and two dated runtime observations.
- SHA must be full, available locally and match the supplied PR base. Current
  state/index/handoff must use the same anchor. Historical evidence records keep
  their own recorded-at SHA and rendered-source SHA; these are different facts.
- Schema v2 binds every document/PNG to `recordedAtSha:path` and SHA256. Documents
  normalize CRLF to LF only; PNGs compare exact bytes. A commit existing without
  that blob is insufficient. Historical IDs cannot be deleted or rewritten.
  The prior manifest is loaded from the actual PR base, never from a caller-owned
  working file. For this first PR only, when its base has no manifest, the reviewed
  ancestor `b5411b68618e663d97ca50ac5bb9f49bc688193e` is the bootstrap anchor.
  v1 may gain verified document hashes; it may not silently change old evidence.
- Empty/whitespace current-state/index/handoff files fail, as do missing anchors.
- RootLayout CSS imports are parsed as real top-level side-effect TypeScript AST declarations
  and match the recorded order. Comments, templates and type-only imports cannot
  impersonate loaded CSS. Syntax errors fail closed. The Material harness has an
  explicitly documented subset; its shared CSS order must match production,
  globals comes first and Foundation last among shared styles. The synthetic
  notice stylesheet is the recorded local exception. Removing Foundation from
  both source and manifest is still rejected.
- Current 600/1100/1440 behavior is observed, not a new design decision. Existing
  `responsive-mobile-batch1.test.mjs` executes pointer/width behavior. D-023's
  older wording remains an explicit reconciliation issue; do not change breakpoints
  as an incidental documentation fix.
- The actual Server allowlist function is also parsed from AST; a commented old
  function cannot impersonate the live array. It must match the snapshot. A mismatch demands review; editing the
  manifest is never permission to activate a route or source.
- App/components/features JS/TS (including helper TS), HTML/MDX, CSS/preprocessors, local
  visual assets/JSON, public assets and Vite/Next/PostCSS/Tailwind config changes
  require a changed, path-specific impact record. This conservative rule prevents
  moving layout code from TSX to a helper to evade review. Tests/fixtures/type
  declarations are excluded; production code must not hide in those locations.
  Domain-only inputs use an explicit V0 record with supporting scope evidence;
  they are not declared visually equivalent merely because their extension is TS.
  Tooling/docs-only changes need no invented UI approval.

The negative suite deliberately removes Foundation, changes CSS order, alters
SHA/PNG/evidence/status, simulates a stale document/allowlist, and omits UI impact
or approval records. It uses owned temporary copies and synthetic data only.
The `R95-1` through `R95-8` cases reproduce every pre-merge false PASS, including
matching false claim labels, historical-file absence and simultaneous PNG/hash
replacement. Positive tests cover legitimate new evidence and document revisions.

## Frozen evidence and forward updates

Existing evidence IDs keep kind/path/recordedAtSha/renderedSourceSha/hash and
revision metadata. The current file must match its frozen blob. To revise a
document, retain the old record and add a new ID with a new committed version,
the same path, `supersedes: <old-id>` and a nonempty `changeReason`. Only the latest
document version must match the working file; earlier blobs stay readable in Git.
Do not remove the old ID or reuse it for a different assertion.
Multiple committed revisions in one stacked branch may form a forward chain.
Every chain must reach an ID in the actual PR-base manifest; intermediate Git
blobs remain hash-checked. Missing links, cycles, unclosed forks, same-commit document
revisions and path/kind changes fail closed. This does not authorize overwriting
any original evidence or advance deployment/acceptance status.

Parallel reviewed document branches can converge through an explicit document-only
`mergeOf: [<predecessor-id>, <predecessor-id>, ...]` record, mutually exclusive with
`supersedes`. It needs a nonempty reason, at least two unique nonredundant predecessors
of the same kind/path, and the exact document blob from a real Git merge checkpoint.
The guard reads that checkpoint's actual Git parents: two parent branches must
contribute different predecessor histories. All predecessor commits must be strict
ancestors of the checkpoint and the checkpoint must be in the checked head.

Every branch must trace back to the actual PR base; cycles and multiple final leaves
remain errors. All evidence records in the Git parents' manifests must be retained
unchanged, including records not yet on main. A merge cannot hide missing intermediate
blobs or modify old hashes/edges. Its own `mergeOf` is immutable in later PRs. A normal
forward `supersedes` revision may follow the merge. Screenshot, approval, capability,
runtime and UI-impact requirements stay unchanged; this is evidence convergence,
not permission for any product or deployment change.

When main advances while another branch already has frozen document revisions,
do not rewrite those old IDs or hashes and do not remove their ancestry check.
An older side revision may instead reach a same-path document integration witness
through the explicit revision edges. The witness is frozen at the real merge H,
with exactly the current comparison base M and the independent source S as its
two Git parents. M and S must not contain one another. S's Git manifest must
contain the exact imported record, its recorded commit must be in S, and H must
be in the checked head. A single-sided document uses `supersedes`; an actual
two-sided document conflict still uses `mergeOf` with the original contribution
and nonredundancy checks. A later ordinary commit cannot impersonate H. No new
manifest field or replacement of a historical record is needed.

History preservation is independent of this eligibility exception. For an
explicit PR-base check, the guard enumerates the real merge commits in the
base-to-HEAD ancestry corridor and reads each actual parent's Git manifest. Every
parent evidence object must remain unchanged, including source-only records of
unrelated paths. This also applies when H has no document record or its author
freezes a later ordinary checkpoint. Missing/invalid Git history is not an empty
manifest. Discovery is bounded to256 corridor merges,8 parents per merge and64MiB
of distinct parent manifests; exceeding a bound fails explicitly without a
truncated PASS. Parent manifests are cached, and ordinary commits do not add
manifest reads. This protects history actually merged into the inspected corridor,
not unmerged branches outside it. Default local/dispatch inspection still compares
working changes to HEAD; it cannot replace the explicit actual-main PR gate.

PNG history remains at its old path with exact bytes. A new screenshot uses a
new ID/path and a nonempty `changeReason` plus `approvalEvidence` pointing to a
frozen document record of the explicit user approval. A replacement may identify
the previous screenshot via `supersedes`; it cannot overwrite that file. An
approval reference is reviewable evidence, not machine proof of user identity.

Evidence must be committed before its full source SHA can be referenced. For new
proofs, create a local checkpoint of a new dated evidence file first, then bind
the manifest and run the final gate; do not invent a future self-referential SHA.
For an active-document revision, complete its evidence checkpoint and binding
before calling the final gate PASS. Normal repository delivery rules still apply.

## UI impact and approval

Add one JSON record under `docs/release/ui-changes/` in the PR that changes UI.
Do not reuse an unchanged historical record. All affected paths must be covered.

```json
{
  "baselineSha": "<actual reviewed PR base, 40 characters>",
  "level": "V0",
  "paths": ["components/foundation/app-shell.tsx"],
  "pages": ["navigation"],
  "visibleDifference": "none",
  "evidence": ["docs/tasks/active/<task-evidence>.md"]
}
```

V0 is visually equivalent engineering and requires `visibleDifference: "none"`.
V1 restores an approved layout/behavior; describe the defect and before/after
evidence. Neither allows a new navigation, density or interaction model.
V2 local layout/interaction and V3 cross-page design changes require:

```json
{
  "approval": {
    "status": "user-approved",
    "reference": "docs/tasks/active/<explicit-user-approval-record>.md"
  }
}
```

**This field is not proof of human authorization.** A reviewer must read the
referenced decision and confirm scope/version before merge. A PR can modify its
own guard/manifest/approval text, so CI alone cannot enforce independent approval.
V2/V3 need concrete wireframe/comparison approval before implementation; a green
check cannot retroactively approve a redesign. No automatic baseline updater is
provided. New evidence versions need independent evidence review.

## Historical acceptance map and missing coverage

Quote list is PR64 information architecture plus approved PR89 widths/thumbnails
and PR91 defaults/layout. New/Detail/Settings follow D-102, not the superseded
two-step cancellation contract. Order/Material use P6 and the subsequent PR92
synthetic integration evidence. Login has implementation evidence only; do not
invent a separate brand/animation approval. Navigation defaults to Quote-first; D-106 explicitly permits the existing Order entry only in a snapshot candidate. serverRoutes records the static capability ceiling; isEnabledServerRoute additionally enforces the default-disabled order flag, tested with the compiled/runtime identity checks and production-built Chromium tests. No guard permission to deploy is implied.

Preserve 1920/1536(DPR1.25)/1440/1280/900 fine and 390 touch coverage, long text,
personal column preferences, loading/empty/403/409/offline/permission states.
The minimum guard does **not** regenerate or compare browser pixels, inspect
computed styles in a built app, test SQL transactions, or establish real source
scope. Full real RootLayout/CSS + pixel/geometry + role/browser acceptance is a
separate follow-up Gate. Historical screenshots must not be described as newly run.

## Capability/runtime updates

Each capability records implemented/merged/isolatedTest, environments separately,
humanAcceptance, sourceActivation, scope and evidence. Contract approval is not
feature implementation; schema availability is not production UI activation.
Current snapshots distinguish PR91 runtime from PR92/93 code in main.

`statusEvidence` has seven typed dimensions: implemented, merged, isolatedTest,
humanAcceptance, sourceActivation, trial18443 and preview18444. Each claim repeats
the exact status value, identifies frozen document evidence, assessedAt, scope and
sourceSha. Environment claims bind the exact runtime ID/source/image; active
Source claims identify deployed environments. `assessedAt` is a snapshot review
date, not a fabricated test/deployment/acceptance date.

Unimplemented capabilities cannot claim merged implementation, test PASS, partial
or complete human implementation acceptance, deployment or active Source. Contract
approval remains separate. Any status change relative to the Git-loaded prior
manifest needs a new document ID with genuinely new frozen bytes; relabelling or
recommitting the same document does not count. Runtime source/image changes also
need new evidence. Reviewers still inspect whether that evidence actually proves
the claim; this tool does not infer business truth from prose or query live systems.

The runtime entries are historical observations; this guard task did not access
18443/18444 or business DBs. A later authorized release must add its own dated
release evidence and revise this historical-only contract explicitly; do not
flip a boolean and claim that this script inspected the runtime. Source SHA,
image digest, ledger, trusted roles and human use are separate validations.
Portable snapshot dates use the committed 2026-10-09/10 deployment records. The
previous local audit's later time is not represented as new in-repo runtime proof.

## Maintenance and integration

- UI owner supplies page/evidence changes; domain owner supplies capability facts;
  one release integrator reconciles CURRENT_STATE/AI_HANDOFF/PROJECT_INDEX.
- Each new task verifies the current main SHA and updates only the snapshot anchor
  and facts actually rechecked. Preserve historical source/image/acceptance dates.
- This PR's predecessor summaries are in the [archive](../tasks/completed/2026-10-12-release-baseline-predecessor-state.md);
  they are not competing current status.
- GitHub `Release baseline / baseline` runs on a hosted Ubuntu runner with
  contents:read, no persisted checkout credential and no production secret/runner.
  It uses pull_request, not pull_request_target; no deploy job is added.
- Required-check/branch-protection settings are not changed by this PR. Until
  separately enabled, the integrator must enforce the gate before requesting merge.
- Rollback is a normal revert of this tooling/docs PR; it changes no schema, UI,
  runtime config, browser namespace or business data. No automatic merge.


2026-10-14：同一PR可前向保留多代文档checkpoint；每代仍验证精确Git blob/hash，新修订链必须终止于真实base清单记录。循环、无base锚点、分叉覆盖及缺少任一中间blob均阻断，不可通过链条跳过历史证据。详见same-PR checkpoint负向回归。


## 2026-10-26 bounded test-input loading

The regression fixture loads actual frozen Git blobs using `readEvidenceBlobs`: one bounded metadata query, then one binary payload query by verified object IDs. It rejects missing/non-blob objects, malformed identities, CR/LF/NUL protocol injection, more than4096 records, more than1MiB request bytes, a blob over16MiB or unique payloads over64MiB. Both child processes have15-second limits; exact binary boundaries and complete output are checked. No textconv/filter, synthetic replacement or cached PASS is used.

Each negative fixture still owns independent real files and Git history; only repeated creation of the same parent directory is deduplicated. There are no shared writable hardlinks or file/result caches across checks. `validateBaseline`, `runCheck`, immutable evidence rules and hosted workflow quality gates are unchanged. The original134 cases remain, with9 new reader checks. The earlier901399ms timeout and bounded progress diagnosis remain explicitly incomplete; current source-attributed results are recorded separately in [the task](../tasks/active/release-evidence-efficiency-2026-10-26.md).
