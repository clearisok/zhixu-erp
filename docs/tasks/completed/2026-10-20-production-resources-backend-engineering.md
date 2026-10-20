# Gate6A Server resources: frozen backend engineering evidence

2026-10-20. Application, migration, tests and Source workflow are frozen at
`8c178ba0b65e4117138fbc8e4cc1432a52d0dbf2` on
`codex/server-production-resources`. Verified main input remains
`996dfedc12da3527343cd3ff2aa5eea35497e10e`. This checkpoint retains contract31,
explicit integration251 and accepted Gate5 final5464 history. No inherited user
changes, destructive Git or changes to other worktrees were used.

## Implemented scope

0034 adds empty calendars/date exceptions/sites/groups/outsource factories and
immutable actor/request outcomes. Session-only resource APIs use explicit inputs,
fresh database identity/grants, stable resource IDs, per-resource version CAS,
parent availability locks, transactionally appended audit and durable known
business rejections. Request content changes conflict; retries return the original
snapshot, not an invented latest state. Receipt reads distinguish known, pending
and unknown. No automatic mutation retries are introduced.

Roles lock before their permission rows, matching role administration. A real
role-service/HTTP concurrency case pauses the actual role update, then proves
resource save waits and observes revoked grants without a lock cycle or receipt.
Names may duplicate. Country/region text, contact/phone search and required
calendar exception descriptions preserve existing form behavior. Natural group
sorting uses the existing pure function and a complete bounded candidate set;
over5000 explicitly fails rather than presenting a truncated total. Lists omit
calendar exception bodies; detail reads retain them. Disable preserves identity
and history; it never cascades changes into saved child resources.

No Browser normalizer/repository/storage/Seed, permission catalog/grants, prices,
Source scope, route allowlist or UI code changed. No schedules, production
completion, shipment, closing or accounting are implemented by this backend.
The existing 48 capability records retain their prior scope/status; no complete
resource or production capability is claimed. Startup remains migration-verify
only. Real-target migration, deployment and account/data changes were not made.

## Actual local validation

All tests use generated, owned disposable tmpfs PostgreSQL/MinIO and ephemeral
loopback HTTP, never the process business database or real Ainuoke credentials.

- Final resource contract/PostgreSQL/HTTP: **25/25**, 7742.6712ms, before source
  freeze with the exact committed application/test blobs.
- Frozen source resource + fresh-start + managed-role + user-lifecycle combination:
  **43/43**, 44800.9481ms. This includes explicit Chinese region HTTP round-trip.
- Frozen source full project `node --test --test-concurrency=2 tests/*.test.mjs`:
  **927/927**, 218953.0055ms.
- Frozen source full `npm run test:postgres`: **261/261**, 243029.8422ms.
- Full typecheck, Node build and exact changed-path ESLint passed. The emitted
  `dist/server/server/app.js` was actually imported by Node successfully.
  Full source ESLint also passed before the final compatibility refinements;
  refined paths were subsequently checked again. Generated outputs/artifacts
  were excluded consistently; no dependency installation was performed.
- Explicit release baseline: **116/116**, 180734.5006ms. Exact-main source/evidence
  guard at8c passed: 11pages/48capabilities/41 inherited UI paths, zero new UI paths.
  This is not a pixel, deployment or human business acceptance result.
- Independent read-only reviewer inspected the actual31..8c diff, lock ordering,
  compatibility refinements, archive hashes and saved25/43 logs; no blocker.
  Reviewer did not run tests, network or databases.

Earlier results and failures remain separate: first DTO type errors were repaired
without changing the shared audit model. A newly added role test initially used
a numeric version where the existing role API requires a string and was properly
rejected400; its fixture was corrected. Earlier21/21,38/38, and combined58pass/
1Windows-inapplicable Linux-CLI skip are not relabeled as the final frozen runs.
The first927/261 runs preceded the last compatibility freeze; the final results
above were rerun against8c. The old Quote long-suite45/44/2 gap remains unresolved
and is not replaced by these backend checks.

## Delivery and remaining work

This immutable record proves local backend engineering only. Final docs-only
checkpoint, exact remote SHA and fresh Source/Team/Baseline CI are recorded
separately in the Gate6 task/handoff; earlier Gate5 green runs cannot be reused.
No duplicate cumulative business PR, automatic merge/close or formal deployment.

6A UI still needs existing-form wiring, private-browser/permission/unknown-outcome
acceptance and a forward UI impact/capability evidence record.6B scheduling and6C
completion remain subsequent slices.62426 stays on Gate1 image8175;3001/50426/
59069 and all prior data remain intact. Future closing is CNY sales/USD labor,
with no currency relabeling or automatic FX.
