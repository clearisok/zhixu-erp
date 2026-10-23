# PR127 forward integration on the approved merged main

2026-10-23, Asia/Shanghai. Root is the sole writer; the existing reviewer is read-only.
The user expressly approved merging only #126 with a merge commit, then integrating
#127. No automatic #127/other-PR merge, deployment or business-data operation follows.

## Verified input and scope

- #126 merge is `e06162c70c9792895c30030216dc8c2a66368069`. Parents are exactly
  original main `996dfedc12da3527343cd3ff2aa5eea35497e10e` and reviewed head
  `0be89ff99a7339a68934ed94a56fdc32b11cc8ab`; trees match. Its six original commits
  and branch remain. This is an observed merge, not an old virtual merge result.
- Reuse the clean existing `git-delivery-preflight` worktree, original branch
  `codex/git-delivery-preflight-fallback`, head
  `37bd0e1e81810f46c1972f37630dc99b7fc9b18d`. No new checkout/PR or inherited dirty.
- One normal `git fetch --no-tags origin main` succeeded. Actual merge produced exactly
  four conflicts: CURRENT_STATE, AI_HANDOFF, PROJECT_INDEX and baseline.json.
  There is no application/source/schema/UI conflict to resolve.
- Both sides' three state/index documents are archived from exact Git bytes under
  `../completed/2026-10-23-pr127-forward-inputs/{37bd0e1e,e06162c7}/`.
  Their original dates, failures, hashes and scope stay in Git and the archives.
- Manifest comparison proves all non-metadata fields identical:213 evidence objects,
  46 capabilities, pages/routes/CSS/approval data. Only baselineSha/verifiedAt metadata
  is reconciled to actual main e061/date; no evidence ID/hash/status/screenshot rewrite.

The PR retains its original Git-first bounded preflight fallback and exact non-forced
delivery, plus the already-reviewed price-envelope and read-only CDP test fixes.
Do not weaken certificate/auth/divergence STOP rules or swallow application errors.
The #126 guard and134-test suite are inherited unchanged from main. This PR is not
the cumulative Server candidate and does not promote its business capabilities.

## Required checks and delivery

After the actual merge checkpoint, run the relevant53 delivery-tool tests,134 release
checks, types/scoped lint/Server build, actual disposable9-test business-source API
regression and10-test private-Chromium login regression. Keep their scopes/results
separate; the prior53/94/9/10 and old Hosted CI do not prove the new merge head.
Run `check:release-baseline -- --base-sha e06162c70c9792895c30030216dc8c2a66368069`
on the final commit; verify the old213 records and6 archived blobs, diff scope and
independent review. Do not change tests merely to make an old baseline appear current.

Standing safe Git/CI authority permits one normal delivery per reliable checkpoint and
bounded evidence-based recovery; no per-SHA approval is required. Verify the exact
remote head before updating the existing unique #127 description. Its new three CI
conclusions must bind that complete head; no duplicate business PR or auto merge.

## Data and environment boundary

No real credential/upstream HTTP, business DB/account or existing runtime operation
is part of this tooling integration. The separately approved fixed Source read was
executed in7bf3 using the frozen0c tool; it is not a #127 feature or permission to
collect again. Do not publish its private raw files in this PR.
Keep3001/50426/other entries, volumes, Browser data and all original worktrees intact.
Coverage-v1, closing rules, cutover and retirement remain separate decisions.
The complete G1–G5 Goal is not achieved by this integration slice.
