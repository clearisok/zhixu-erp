# Sidebar evidence binding correction

2026-10-30. No product, test, guard, UI approval or deployment change. The final explicit-main guard for ae260f3d failed with EVIDENCE_REVISION, EVIDENCE_REVISION_ANCHOR, EVIDENCE_REVISION_LEAF and EVIDENCE_WORKTREE_DRIFT. Its private log remains outputs/server-sidebar-final-guard.log. No upload or CI occurred.

The new, unpublished correction record below incorrectly chose6954 as its source checkpoint. Its immediate parent b141 did not yet contain the original document record, so it could not prove a post-base revision. This is metadata failure, not a passing gate. Original commits and bytes are retained.

Rejected record before correction (retained verbatim):

```json
{
  "id": "expanded-sidebar-review-correction-20261030",
  "kind": "document",
  "path": "docs/tasks/active/server-expanded-sidebar-labels-2026-10-30.md",
  "recordedAtSha": "6954fdf57e8c0e40cb783c70ca0c92aea35b2606",
  "renderedSourceSha": "6954fdf57e8c0e40cb783c70ca0c92aea35b2606",
  "sha256": "2973ebbe1d4cc3ef3b03aae3a3ee23e307b0cfbc4fedec808a52c21025312363",
  "supersedes": "expanded-sidebar-v1-engineering-20261030",
  "changeReason": "Independent review correction preserves original legacy specificity; initial checks and deliberately incomplete baseline attempt retained, corrected-source validation pending"
}
```

The source binding is corrected to existing commit **4922db1b3a2e40fdfac27d5db9767073addf8073**, whose immediate parent is **6954fdf57e8c0e40cb783c70ca0c92aea35b2606**. That parent already contains the exact predecessor expanded-sidebar-v1-engineering-20261030 and not this new revision ID. The document blob in4922 equals its6954 blob exactly; no dates, content hashes or older accepted evidence are invented or replaced. The existing new ID receives this explicit pre-delivery metadata correction; all601 evidence objects from actual main b1 remain unchanged. The rejected object is preserved above and at the original Git checkpoints.

Type/build/browser/baseline inputs remain unchanged. The182-item local suite had already passed; only the explicit exact-source/evidence guard must run again for the corrected binding. Independent review and remote delivery remain separate. Staging remains b1 and all Source/DB/account/deployment boundaries are unchanged.
