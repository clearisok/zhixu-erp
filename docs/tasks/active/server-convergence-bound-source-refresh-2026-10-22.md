# Bound contract source refresh — Gate 4 follow-up

2026-10-22. Root is the sole writer; existing independent reviewer is read-only.
Branch `feat/server-bound-source-refresh` starts at independently reverified main
`996dfedc12da3527343cd3ff2aa5eea35497e10e`, then fast-forwards the clean input
`a29675586231806960eb5069087e705f0d0c4642`. No inherited dirty changes.

The existing material capture does not update contract/color mirrors. The typed
DeliveryPlan source refresh has only test/demo callers. This slice adds controlled
promotion of an already captured formal Discovery/6087105 bundle: read-only
preview, explicit apply and durable request receipt. It does not perform network
collection, start scheduling, create orders, expose an HTTP source writer, or
authorize a real database operation. The private operator command must verify a
clean committed checkout, exact job/evidence hashes and current migration ledger.

Reuse formal adapters and the existing mirror/DeliveryPlan writer in a caller-owned
transaction. Scope includes source profile/account, stable contract/source identity,
original physical source owner, effective attribution, both order versions, full
current mirrors, owner plan collection and exact incoming evidence. Missing or
invalid color detail is rejected in this first refresh slice, preserving old facts;
initial binding behavior is unchanged. Do not interpret missing source as deletion
or cancellation. Historical alias mirrors remain on their original owner; the
0018 trigger keeps both alias plans and effective-root plans unchanged.

Use a dedicated immutable, successful-request receipt with actor/request uniqueness,
payload hash, original/effective order FKs and bounded result, committed together
with all mirror changes and trusted audit. No in-transaction source IO. Unknown
commit results require receipt readback; no automatic replay. A replay checks fresh
permissions and exact payload, then returns the historical result without applying
freshness or CAS to current state. Known failed transactions create no success
receipt; absence is not proof that an interrupted commit failed.

Verify synthetic PG identity/CAS/concurrency/revocation, manual plans, stable color
IDs, immutable commercial/production history, historical ownership, audit rollback,
receipt loss/replay/conflict and schema upgrade. Extend reference inventory and
full fingerprints. Preserve all old evidence and protected environments. No UI
change is planned; no new screenshot or user-acceptance claim.

Git writes remain stopped after a296's uncertain rejected push; independent API
proved exact a296 on the remote, but the root cause is unresolved. Existing CI may
be observed; no repeated push, merge, PR closure, deployment, real-source read,
credential access, or mutation of 3001/50426/59069/62426 or other old assets.

At this baseline the new slice has not been implemented or tested.

## Implementation and isolated acceptance

The implementation now reuses the existing source writer as a transaction
primitive and adds one offline private operator, without collector IO or an HTTP
Source writer. 0041 is an empty immutable success-receipt table; both order FKs
participate in complete normalization fingerprints. Missing/invalid color detail
preserves the old mirror and rejects adoption. Historical InsideOrderNo changes
use UPDATE on the existing binding, avoiding the old UPSERT's INSERT guard;
0018 alias/effective plan protection stays intact.

Final focused18/18, related81/81, project927/927 and full PostgreSQL269/269 passed,
alongside types/lint/Node/frontend builds and precommit main-based release guard.
The private operator actually ran against synthetic protected files and an owned
PG database, including deliberate post-COMMIT report failure and receipt recovery.
Existing commercial adoption and actual colored production execution rows were
nonempty and remained byte-for-byte unchanged after source quantity/color changes.

Independent static review found and closed twoP2 issues: connection-destination
binding and uncorrelated audit operation IDs. Target fingerprints now share the
existing database helper; correlated audit IDs include actor and request. Real
role-lock revocation, changed historical InsideOrderNo, cross-actor UUID reuse and
exact date/quantity audit assertions passed. Reviewer did not run tests and found
no remainingP1/P2. Initial failing logs remain in ignored outputs/bound-source-refresh.
The [frozen engineering report](../completed/2026-10-22-bound-order-refresh-engineering.md)
preserves exact scope, tests, failure order and separate delivery/runtime limits.

Full new metadata/precise committed-HEAD release checks follow this application
checkpoint. No new remote delivery/CI/deployment is implied. a296's three exact
Hosted CI runs separately completed success; Git write STOP and unknown root cause
remain. No real source read, credential access, existing migration, merge/close,
retirement or user acceptance occurred. The overall Goal remains active.

## Frozen application and forward metadata

Application/report checkpoint: 81a8d600434844784067e7c977a173b566e7c634.
All three archived input summaries are Git-blob-identical to a296. The forward
manifest appends one document and one capability (260/55), leaving every previous
entry and all pages/CSS/routes/runtime records unchanged. Main-based metadata
guard PASS and full release116/116 (190441.751ms) passed. No new UI evidence
was invented. The final metadata commit's exact HEAD/clean/guard is independently
recorded in ignored outputs/bound-source-refresh/checkpoint-final.json.

No remote write was retried; no new PR or hosted CI for this slice is claimed.
Pending exact-source quota/closing decisions and all protected runtime boundaries
remain. The continuous Goal is active; this does not complete Gate4C or Gate8.
