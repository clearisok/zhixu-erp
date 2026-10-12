# Release baseline and capability guard

## Purpose and authority

This developer gate protects the existing D-099 + later approved D-102/P6 UI and
separates engineering, merge, deployment, human acceptance and source activation.
It does not approve designs, run deployments, query databases or open routes.
GitHub/code/approved decisions remain the facts; the manifest is a dated snapshot.

Run from the repository root (Node 24, Git; npm dependencies for the responsive test):

```powershell
npm run check:release-baseline -- --base-sha <verified-full-main-sha>
npm run test:release-baseline
```

The optional CLI base defaults to the manifest anchor for local inspection.
PR CI always passes the actual PR base SHA; a stale snapshot fails. This is not
a network lookup: verify/fetch main independently before updating the snapshot.
The guard checks committed, staged, unstaged and untracked UI paths relative to
that base; it never stages or rewrites them. Missing objects stop the gate.

## Inventory and minimum blocking checks

- [baseline.json](../release/baseline.json): nine routes/component owners and
  scoped approval records, eleven immutable PNG hashes, current CSS entries,
  observed responsive breakpoints, Server route allowlist, eight capability
  records and two dated runtime observations.
- SHA must be full, available locally and match the supplied PR base. Current
  state/index/handoff must use the same anchor. Historical evidence records keep
  their own recorded-at SHA and rendered-source SHA; these are different facts.
- Evidence paths must exist inside the checkout. Missing/modified PNG bytes,
  unknown evidence IDs, incomplete status dimensions or unsupported status labels
  fail. A planned feature cannot claim an isolated implementation PASS.
- RootLayout CSS imports match the recorded order. The Material harness has an
  explicitly documented subset; its shared CSS order must match production,
  globals comes first and Foundation last among shared styles. The synthetic
  notice stylesheet is the recorded local exception. Removing Foundation from
  both source and manifest is still rejected.
- Current 600/1100/1440 behavior is observed, not a new design decision. Existing
  `responsive-mobile-batch1.test.mjs` executes pointer/width behavior. D-023's
  older wording remains an explicit reconciliation issue; do not change breakpoints
  as an incidental documentation fix.
- Server allowlist must match the snapshot. A mismatch demands review; editing the
  manifest is never permission to activate a route or source.
- Changes to app/components/features TSX/CSS or the responsive helper require a
  changed, path-specific UI impact record. Tooling/docs-only changes need none.

The negative suite deliberately removes Foundation, changes CSS order, alters
SHA/PNG/evidence/status, simulates a stale document/allowlist, and omits UI impact
or approval records. It uses owned temporary copies and synthetic data only.

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
provided. A baseline hash change needs independent evidence review.

## Historical acceptance map and missing coverage

Quote list is PR64 information architecture plus approved PR89 widths/thumbnails
and PR91 defaults/layout. New/Detail/Settings follow D-102, not the superseded
two-step cancellation contract. Order/Material use P6 and the subsequent PR92
synthetic integration evidence. Login has implementation evidence only; do not
invent a separate brand/animation approval. Navigation stays Quote-first.

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

The runtime entries are historical observations; this guard task did not access
18443/18444 or business DBs. A later authorized release must add its own dated
release evidence and revise this v1 historical-only contract explicitly; do not
flip a boolean and claim that this script inspected the runtime. Source SHA,
image digest, ledger, trusted roles and human use are separate validations.

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
