# Gate6B Server production planning: backend engineering evidence

2026-10-20. Application, SQL, tests and workflow source are frozen at
`7ebfe9856719757f55bad63118e79d3ee9964729` on
`codex/server-production-planning`, against independently verified main
`996dfedc12da3527343cd3ff2aa5eea35497e10e`. The preliminary backend checkpoint
`8c180eb4933689177ba0a10a201aeee8e899c160` remains in history. Subsequent evidence
and status commits must retain the frozen source blobs. No inherited user dirty
files, dependency installation or destructive Git operations were involved.

## Scope and authority

This is a plan backend, not a completed production product. Migration0035 adds
seven initially empty planning tables, immutable history constraints and parent
row protection for source collections. It does not backfill business data.
The existing trusted contract or consumed processing batch authorizes an order;
claiming an owner or adopting a quote is not a planning prerequisite.

The API persists direct SalesOrder assignments, order/group/assignment CAS,
complete adopted resource facts, exact decimal quantities and actor/request
outcomes. Create, update and cancel affect one assignment. Explicit group replan
previews all affected orders and commits the queue atomically. Ordinary edits
retain adopted resource facts; master changes do not silently change plans.
Manual dates have no fabricated first production date or nonworking-day count.
Overassignment is a warning, not a rewrite of customer demand.

The stable color identity is shared with the existing order helper, while source
row hashes remain evidence. Current and historical source-owner physical rows
are frozen in global UUID order. Source writers and SQL collection triggers
honor the parent lock. Bulk sale-adjustment preview uses the same whole-group
freeze before any per-order lock; no price formula, CCT or commercial-version
semantics changed. Global planning serialization is an explicit first-version
tradeoff and does not replace preview hashes or CAS.

Fresh session/grant checks, resource-snapshot locks, atomic audit and immutable
applied/rejected receipts protect writes. Unknown outcomes are read by the same
request ID, not automatically reposted. Normalization fingerprints include the
new direct and indirect successful references; external production/finance
coverage remains unavailable. Rejected receipts do not claim successful order
bridges or complete normalization coverage.

There are no new UI routes, actual start/completion facts, shipment, closing,
money fields, grants or Browser writers in this slice. Customer DeliveryPlan
stays independent. Future CNY sales and USD labor do not authorize conversion or
relabeling of historical facts.

## Actual frozen checks

All database tests use their own random disposable tmpfs PostgreSQL containers,
with cleanup limited to the containers created by those tests. No process
business database, real Ainuoke query or current user environment was used.

- Targeted contract, pure preview, new PostgreSQL/HTTP, upgrade and existing
  sale-adjustment tests: **60/60**,37437.7084ms, no failures/cancels/skips.
  Includes22 pure/contract,25 new planning PG/HTTP,one upgrade and12 existing
  sale-adjustment checks.
- Full project: **927/927**,267224.1143ms, no failures/cancels/skips.
- Full existing `test:postgres`: **261/261**,282827.9616ms, no failures/cancels/skips.
  The new planning suite is additional, covered by the targeted60 and Source CI.
- Explicit release-baseline tests: **116/116**,265674.8925ms, no
  failures/cancels/skips. Final document-manifest guards are recorded separately.
- Full typecheck, Node build, whole-repository ESLint and actual compiled app
  module import passed. The final source has no UI changes.
- Explicit Server frontend build passed. Client, server and SSR build-info all
  record full7ebfe985, Server quote/master authority, writable quote mode,
  session identity and snapshot order read. A build is not a runtime upgrade
  or browser/pixel acceptance.
- Main996 release guard passed with11 pages,49 capabilities and52 cumulative
  UI paths, including only the inherited V0 helper impact. The two new document
  records made232 evidence entries; all prior230 and49 capability entries were
  preserved. The later immutable engineering-evidence record is additive.

Local raw logs are ignored outputs named `server-convergence-g6b-7eb-*`; no raw
trace, secrets or business payloads are committed. Synthetic audited500 failure
output in the PostgreSQL suite is an expected rollback test, not a failed check.

## Negative and concurrency evidence

The actual database/HTTP cases cover strict input, trusted session/CSRF,
processing-batch identity, planning without commercial adoption, exact large
decimal values, zero versus unknown, resource adoption and disabled history,
multi-order explicit replan and fixed dates, order/group/assignment conflicts,
same-request replay/content mismatch, pending/unknown receipts, audit rollback,
fresh role revocation while waiting, source-owner aliases, no DeliveryPlan move,
source insertion/deletion blocking, stale-source preview rejection, resource
freeze waiting, immutable intermediate versions and forged-history rejection.

The adversarial cross-domain case uses physical groups `{02,04}` and`{01,03}`
versus a replan freezing`{01,02,03,04}`. Both concurrent operations complete after
the test barrier is released; missing commercial evidence still rejects and no
money is written. This is a tested lock-order correction, not a claim that an
actual production deadlock occurred.

Independent read-only review found three P2 issues: source-color competition
after preview, missing intermediate history in one transaction, and opposing
expanded physical-group lock orders. All were fixed with actual negative or
interleaved tests. The final reviewer found no blocking issue and did not claim
to run tests, database or network operations.

## Preserved failures and remaining boundaries

The initial PG parent reported16 passing children/one failure because the test
incorrectly expected a deliberately sanitized SQL error string. It now checks
the exact request ID; raw failure logs remain. Nullable replan dates and an old
required field in a synthetic quote fixture caused earlier type errors and were
corrected. Working-source114,59,24 and25 results remain scoped history, not
substitutes for the frozen60. The preliminary8c checkpoint was not delivered.

The older Quote long browser run remains45pass/44fail/2cancel, with31 not started.
It is not repaired or hidden by the new tests. No new browser/pixel, user
acceptance, actual execution, shipment or closing check ran in this slice.
The persistent62426 target remains its Gate1 source8175. Environments3001,
50426 and59069, old volumes/worktrees and Browser namespaces remain protected.

The inpute5cc27da was exactly delivered, with Source39423655348,
Team39423661759 and Baseline39423667763 all successful. Those runs do not prove
the new backend. New final delivery and exact-HEAD CI remain pending at this
evidence checkpoint and are recorded forward after they actually occur.
No PR merge/close, formal deployment, real account/database change, source
binding/activation/scheduling or asset retirement is authorized by this proof.
