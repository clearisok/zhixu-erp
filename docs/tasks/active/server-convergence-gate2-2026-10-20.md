# Server convergence Gate 2 — fixed PR integration

2026-10-20; main `996dfedc12da3527343cd3ff2aa5eea35497e10e`.
Branch `codex/server-pr-integration` was created clean from main in the sole
integrator's 7bf3 checkout, then explicitly fast-forwarded to Gate 1
`add2d690a9c3afe6ec1a2633551eaef7dee72ce1` (draft #125). The live empty target binds
immutable ops, not this checkout. No inherited dirty changes or other worker edits.

## Frozen dependencies and boundary

- #120: `57daca3d3f23f39f0aafff57502f490206b10084`.
- #121: `4e075115b0721a6fd807d61d40e3e505de119e4b`.
- #122: `349a84585f50a0a0779d56e4b56127b6cec0e329`.
- #123: `ebe4cb16c8f5ea65df6243d8a5627094c6f62da1`.
- The 121→122→123 ancestry is verified; merging the exact #123 head preserves all
  three original histories. #120 is independent and merged first.
- No automatic GitHub merge/close, deployment, old-entry cutover, account change,
  historical import or new real Ainuoke access. Combined testing uses new synthetic
  fixtures. Gate 1's zero-business persistent candidate remains unchanged.

## Shared document and evidence convergence

The first #120 merge automatically applied its application changes; conflicts
were only CURRENT_STATE, AI_HANDOFF, PROJECT_INDEX, BUSINESS_RULES and baseline.json.
Both source state summaries are archived byte-for-byte under the dated input
archive. D-147 is retained alongside #120's D-145 rule cleanup. Evidence IDs and
all original fields from both manifests are unioned unchanged.

The existing guard enforces linear document revisions, but Gate0's D-147 and
#120's stabilization both supersede the same frozen decisions record; #123 adds a
third parallel revision. A new single-parent record cannot close the other branch.
The independent reviewer confirmed that rewriting or dropping any original edge
would lose history. This is a real integration limitation, not a business failure.

Implement only explicit document mergeOf nodes, mutually exclusive with supersedes:
all predecessor paths/kinds/IDs must match, no redundant/cyclic edges, actual merge
commit and all Git ancestors verified, all parent-branch evidence retained, one
final document leaf. Existing screenshot/approval/status/UI/source protections
remain. Preserve every intermediate blob/hash. An unclosed fork stays a failure.
First commit the actual merged document checkpoint, then append its frozen node.
Tests must use real synthetic Git branches as well as existing negative fixtures.

## Status

Local merge in progress; no combined tests or final Gate PASS yet. Gate1 remote
exact SHA independently verified despite contradictory delivery-tool labels;
#125 CI is checked separately. No repeat upload was made.
