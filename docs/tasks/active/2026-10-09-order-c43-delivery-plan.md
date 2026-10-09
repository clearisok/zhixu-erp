# C4.3 DeliveryPlan — engineering delivery

## Gate 0 baseline and audit

- Date: 2026-10-09. Branch `feat/order-c43-delivery-plan`; HEAD and successfully fetched `origin/main`: `edc3598764266de087c0f669f8bcf5452c6d3fd2`. Worktree clean. No reset/rebase/merge.
- Actual 0002/0003: SalesOrder UUID, immutable globally allocated number/provenance, immutable source binding, current contract/color mirrors, aggregate lifecycle CAS. No DeliveryPlan schema.
- C3/C4.1: production base list/detail reads exist; prior real acceptance is historical evidence, not rerun here. `contractDeliveryDate` is already the source date DTO.
- C4.2: separate current commercial terms, exact provenance, independent CAS and trusted transactional audit exist. No duplication or change planned.
- Creation is transactional/advisory-locked/idempotent. There is no formal source-refresh service; repository mirror upsert is a low-level persistence primitive, not an authorized runtime refresh command.
- Browser DeliveryPlan uses legacy/test JSON and refresh-time source-row reconstruction. It does not satisfy collection-level D-083 ownership and is not reused as Server storage.
- Plan: forward-only independent schema; stable row IDs, collection CAS and permanent ownership transition; narrowly scoped plan API; internal typed source refresh; explicit date/quantity reconciliation and trusted append-only audit.
- No general SalesOrder writer, source-edit HTTP API, source binding/number/Quote changes, Browser import, real migration or deployment.

## User-confirmed C4.3 edge rules

The user confirmed in this task on 2026-10-09:

- Default quantity equals source quantity at first creation, including zero. Later source quantity changes produce evidence and never automatically reallocate plans.
- First creation without a valid source date creates no default row. A later valid date does not automatically create one.
- An untouched existing default whose source date becomes null keeps its ID and has no valid delivery date; a restored date restores the same row ID.
- Existing orders without C4.3 ownership evidence are not inferred to be untouched and receive no migration backfill.

## Safety and delivery

Only disposable PostgreSQL/synthetic fixtures are authorized. D-096 empty-data and D-098 Quote-first scope remain unchanged. Engineering results and remote checkpoint SHAs are recorded per Gate below; no real environment acceptance is implied.

## Gate 1 — domain PASS

- Baseline checkpoint `d6d3c94` (Gate 0), pushed successfully; Gate 1 begins with clean tracked baseline.
- New 0009 schema/ownership triggers, typed collection projection, human upsert/void transaction and internal source-refresh transaction. D-100 records confirmed rules and technical evidence. No source HTTP writer.
- Typecheck and Server build PASS. Disposable PostgreSQL domain 12/12 PASS: migration/idempotency/startup guard, initialization/date absence/zero, null recovery/stable IDs, multi-row/permanent ownership/drift, void history, concurrent CAS/source-user competition, audit rollback, permissions/spoofing/source guards and untouched aggregate/terms.
- Initial npm ci failed ECONNRESET; offline lockfile install succeeded. First compilation attempt before dependencies were available did not run; subsequent actual compilation passed.
- Sandbox execution helper failed to start; authorized repository reads/builds/test commands use reviewed escalation. One-off approval-service transport failures were resubmitted unchanged and succeeded. No shared sandbox/proxy/TLS configuration was changed.

## Gate 2 — API and security

- Gate 1 checkpoint `d5f872a0ac1195961ada9744eec8aad77b82b66b`. Push returned a ref-lock rejection with target already present; one read-only `ls-remote` verified exact full target SHA. REMOTE DELIVERED, no blind retry or history rewrite.
- Added GET/PATCH `/api/v1/sales-orders/:uuid/delivery-plans` using existing identity authority, order.view/order.edit, Origin/header boundary and strict typed command validation. User-entered quantities follow the existing positive plan-input rule; system-derived zero is preserved as explicitly confirmed.
- Actual session API + upgrade safety added to disposable domain suite; 14/14, typecheck/Server build passed before the additional positive-zero validation. Final Gate reruns the changed validator and full regressions.
- No UI/Source/Bridge changes, no source HTTP writer or general SalesOrder write API.

## Gate 3 — final engineering PASS

- Start: Gate 2 `3db3288f695a59b49e27e110852ddb6723ca1383`, pushed successfully; no inherited dirty hunks. Scope: necessary migration test lists, bounded audit projections, repeat/source-user assertions and documentation closure.
- Latest typecheck, full lint, Server build PASS. Default frontend build PASS. Full npm tests 674/674 PASS. Unified disposable PostgreSQL regression 87/87 PASS (DeliveryPlan 14/14, SalesOrder foundation, shared/linked commercial terms, Quote foundation/API, Fresh Start and frozen bootstrap). All generated PG containers used tmpfs/dynamic loopback ports and were removed by fixture cleanup. No process DB environment or real DB was used.
- Initial broader PG run: 66/67, one existing confirmed-terms exact migration-list assertion omitted 0009. Corrected only precise test lists (including Quote API), targeted rerun 35/35, then unified final 87/87. No failure concealed.
- Audit deltas are bounded to affected plan rows/scalar reconciliation; repeated create does not duplicate rows/logs, repeated source refresh retains rows/version while recording the intentional refresh audit. User commands with stale CAS cannot duplicate creates.
- Latest main read-only checked at `330aad7d1bfc8e93326e1eb4971a7a9f34a74514` (Quote UI PR86). No domain/runtime/migration code changes there. Main used D-099 for Quote visual policy; this task decision is D-100. Ordinary integration/reverification follows this independent Gate commit; no reset/rebase/force.
- Deferred: formal plan UI/conflict UX and wiring future Source orchestration to the internal refresh contract. Real 0009 activation, real data reconciliation/manual business acceptance and deployment are NOT RUN/NOT AUTHORIZED. General creation/editing, ambiguous fields and Browser retirement remain separate.
