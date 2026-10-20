# Explicit document merge evidence — minimal tooling delivery

2026-10-20. Baseline main `996dfedc12da3527343cd3ff2aa5eea35497e10e`.
Branch `codex/release-document-merge-guard` starts at that exact commit, clean.
One implementer, one read-only reviewer. No inherited dirty hunks.

## Problem and scope

The approved Server-convergence integration found real parallel DECISION_LOG
revisions from #120, #121–123 and #124. Each preserved the same main predecessor.
The linear-only guard rejects that valid combined history. Rewriting a parent's
edge or removing its record would falsify evidence. This PR changes only the
guard, its tests and documentation. It does not deliver those business PRs.

Document records may add explicit mergeOf with at least two unique nonredundant
same-path/kind predecessors, mutually exclusive with supersedes. Verify a real
Git merge checkpoint, predecessor ancestry and distinct parent contributions,
all branches anchored in the actual PR-base manifest, every parent-branch record
unchanged, and a unique final leaf. Intermediate blobs/hashes are all checked.
Ordinary forward revisions can follow the merge. Old evidence fields, including
mergeOf, stay immutable. Screenshot replacements retain their original separate
single-parent anchor/cycle rule; screenshots cannot use mergeOf. No UI approval,
capability, runtime, source-activation or deployment protection is removed.

## Independence and validation

The three implementation/doc files are exact path copies from the reviewed
combined candidate `b4c47f1356205e1f064f714ce1fb51efb58e2823`. No wholesale
cherry-pick: that candidate also contains unmerged application/schema changes and
220 combined evidence records. This branch retains main's complete **213-record**
evidence and business metadata unchanged; only the top-level baselineSha and
verifiedAt are reconciled to the independently verified main/date. There are no
app/server/database/CSS changes.

Tests use owned temporary Git repositories with actual diverging branches and
conflict-resolution merge commits. Negative cases include missing/changed side
evidence, unrelated parents, ordinary-commit pseudo merges, missing intermediate
blobs, cycles/orphans/unclosed forks, cross-path/kind edges and immutable-history
rewrites. Screenshot positive/negative coverage is independent of the new DAG.

Pure-main validation is pending. The first exact check failed because main's
manifest still names its prior PR base 064e3af, while this new PR's actual base is
996dfed. Independent review identified the same stale metadata. Only baselineSha
and verifiedAt were corrected, with every other top-level field and all 213
records compared unchanged. The unfinished old-configuration suite was stopped by
its two exact owned test PIDs; other Node processes/environments were untouched.
That interrupted run is not PASS. Syntax and focused lint had already passed.
Rerun the full suite and exact check after this metadata correction.

At checkpoint `a2d2af55f4d4ccd8eb79df543185b2c433d7f2d6`, the independently rerun
complete baseline suite passed **116/116**, no failures/skips/cancellations
(306421 ms). Syntax and focused lint passed. The exact 996 source/evidence guard
passed (11 pages/46 capabilities/**0 changed UI files**). Independent review
confirmed the baseline correction, unchanged 213 records and narrow scope with no
remaining blocker. These are this pure-main branch's own results, not borrowed
from the combined candidate. Final documentation HEAD is checked separately.
No database/runtime/browser/external-source run is claimed for this tooling slice.

## Related convergence evidence and delivery boundary

The separate fixed integration reference b4c47f13 contains exact #120/57daca3d,
#121/4e075115, #122/349a8458, #123/ebe4cb16 and #125/add2d690 histories. It passed
920 project, 434 backend/integration, 52 actual-browser and 112 client checks,
types/Node/lint, default and explicit Server builds, and its exact-main guard.
Those are local engineering facts on that other branch, not business delivery,
merge or deployment evidence for this PR. Detailed records remain on that ref.

Do not open a duplicate cumulative business PR. Existing #120–125 are unchanged
for this verification phase. Later individually approved merges still require
forward integration with then-current main, conflict reconciliation and fresh CI.
If the validation reference is safely delivered, dispatch only the three named
acceptance workflows, verifying branch/main and each run.head_sha; dispatch's
default baseline check does not replace the explicit PR-base check. Never invoke
the production-deployment workflow. All old environments, accounts and data stay.

NETWORK_DEGRADED remains separate from engineering. Gate1's specific one-upload
authorization has already been used and exact delivery verified. A new recovery
attempt needs its own concrete SHA scope; no automatic retry or shared Git/TLS/
proxy modification. Original state/handoff are archived byte-for-byte under
tasks/completed/2026-10-20-release-document-merge-guard-predecessor.
