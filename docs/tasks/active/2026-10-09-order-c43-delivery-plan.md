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
