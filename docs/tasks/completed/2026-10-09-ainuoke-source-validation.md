# Codex C — Ainuoke Source validation

## Baseline and scope

2026-10-09: branch `feat/ainuoke-source-validation`, HEAD and refreshed `origin/main` both `edc3598764266de087c0f669f8bcf5452c6d3fd2`; working tree clean. No real Ainuoke, Credential Manager, Browser data, PostgreSQL, Windows trial, COS or deployment operations are authorized by this task. Tests use synthetic transports, MemoryCredentialStore/FakeKeyring and committed redacted fixtures.

## Gate 0–2 review matrix (before repair)

| 检查项目 | 已实现 | 存在缺口 | 风险 | 建议修复 |
| --- | --- | --- | --- | --- |
| 6086103 Discovery | fixed empty query; current_account_visible; complete bounded client pagination; unique sourceId/sourceRowIdentity/BillNo; dates/status/style; normalized SHA-256 independent of fetch time/page grouping | Discovery trims but does not strip embedded whitespace unlike formal 6087105 BillNo normalizer | inconsistent stable cross-report key | reuse formal BillNo normalization |
| 6087105 | BillNo contains query; exact filter after full client paging; InsideOrderNo drift; colors/SizeNum/Size1..26; zero valid; missing/invalid/usable; deterministic sourceHash | >26 SizeRule tokens access absent slot and throw | malformed upstream rule aborts Preview instead of typed evidence | preserve tokens, null for unproven slots, existing SIZE_MATRIX_RULE_OVERFLOW evidence |
| 6086997 legacy | existing contract mirror; material join folding/max quantity; sizes empty; no invented PO | adapter accepts incomplete pages; Number(empty/null)=0; blank source identity accepted | partial mirror and invented zero quantity | fail closed at source adapter, keep legacy path |
| 6087050 | proven insideorderno is query; content fingerprints independent of repeated upstream id; FIELD_MAP; shared Normalize/Dedup/Validate/Canonical pipeline; Trace; deterministic artifact hash; Preview and existing explicit commit | source adapter accepts some changing totals/short empty terminators; commit checks readCount < total rather than exact equality | direct supplied snapshots can bypass stronger readAllReportPages contract | separate Material-owner task; do not change existing commit ownership |
| Bridge report/read allowlist | five keys/four IDs; raw selectors rejected; fixed report endpoint; no upstream write API | none found in catalog ownership | preserve legacy capabilities | no replacement system |
| Paging protocol | timeout 15s, network retries default 2; auth refresh/replay once; 0/0 sentinel; schema errors sanitized | Python int truncates fractional JSON numbers; bool/fractional request paging accepted through int | page/total corruption appears valid | strict integer validation |
| Account/session isolation | OS keyring by mock user; memory token; Origin-bound cookie and CSRF; unbind clears user sessions | candidate test caches unsaved account token under saved user | subsequent read can use candidate instead of saved account | candidate login must not alter saved token |
| Logs/secrets | HTTP logging disabled; safe error messages; recursive secret-key removal; fake credentials in tests only | snapshots return nested dict aliases via to_dict; frozen dataclass is shallow | consumer mutation can invalidate hash/content relation | detached serialization; document value-object limitations |
| Future Server | existing server session/RBAC is separate from Local Bridge mock identity | mock actor is not trusted; upstream HTTP login; local bridge cookie not server session | no production multi-user identity boundary | separately approved authenticated actor/account binding + safe upstream transport + scoped refresh service |

Evidence: `features/ainuoke-api/client/ainuoke-bridge-client.ts`, `source/ainuoke-order-discovery-adapter.ts`; `features/ainuoke-sync/source/ainuoke-{contract-api,garment-color-size}-adapter.ts`; `features/style-progress/source/ainuoke-material-api-adapter.ts`, `service/ainuoke-material-api-{preview,commit}.ts`; `tools/ainuoke-bridge/ainuoke_bridge/{contracts,ainuoke_client,service,http_server,security,session_store,credential_store}.py`; corresponding `tests/ainuoke-*.test.mjs` and Bridge unittest modules.

## Confirmed contracts and remaining evidence

- D-080 BillNo stable identity, D-082 source fact ownership, D-096 empty-data direction unchanged. InsideOrderNo is transport-only for 6087050 and mutable for formal color detail. Source absence never proves deletion.
- 6087050 BillNo query is NOT PROVEN. `sourceActualName`, numeric Excel 厂供/actualConsumption and reliable measurement units remain unproven; do not map MSingleName or guess units. 6086103 QuotationNo is not customer PO. 6087105 CustomerOrderNo is evidence only, not authorization to change Server PO mapping.
- Total changes/duplicates/incomplete pages are detected; no upstream transaction/revision token exists in the proven protocol. A same-count mutation during pagination cannot be guaranteed detectable from one traversal. Existing before/after Discovery comparison belongs to validation orchestration, not an atomic upstream snapshot guarantee.
- Bridge page hash includes page metadata/order; row fingerprint is order/page independent; Discovery and material aggregate hashes normalize their own stable mapped content. These are different hash contracts, not interchangeable.
- Material follow-up contract proposal: same schema/report/query; integer contiguous pages; same positive pageSize/nonnegative total; exact raw readCount=total, full nonfinal pages and one valid empty snapshot; dedup/collision classification remains domain-owned. No source facts or commit authority changes are proposed here.

## Delivery

Gate 0–2: local read-only audit completed; current production status is not revalidated. Audit checkpoint `63eaf615b00b2eb4a91a7e2865ee5cc1c4d13606` pushed successfully. Gate 3/4: scoped repairs and automated validation complete, remaining cross-owner Material work explicitly deferred. Historical live counts and tests in feature documents are historical evidence only.

## Gate 3 implemented repairs

- Candidate account tests preserve the saved token and subsequent read identity; stored account tests still refresh its token. Verified with in-memory service/client regressions before and after repair.
- Strict shared nonnegative integer parser rejects boolean/fraction/nonfinite paging, preserving numeric-string and integral-number compatibility. Auth refresh/replay and network retry behavior retained. Mocked `urlopen` timeout regression proves configured timeout, three bounded attempts and safe errors without executing a request.
- HTTP Cookie/CSRF headers now case insensitive; lowercase regression first failed 400, then passed 200. No Origin/CORS/bind policy changed.
- Python snapshot serialization is detached recursively; internal dataclass remains shallow-frozen, not a claimed deep-immutable API.
- Legacy contract source independently enforces complete consecutive constant-total/pageSize snapshots and nonblank unique trace identities; null/missing quantity remains invalid, explicit zero valid. No matcher/commit/Repository edits.
- Discovery BillNo whitespace normalization matches formal color exact filtering. 6087105 independently validates page shape and preserves >26-token rule evidence without throwing; unproven slots remain null.
- Bridge README corrected stale candidate-only 6087105 description and insideOrderNo-only query wording.

## Deferred findings with reproducible evidence

- Synthetic material diagnostic on committed fixture: changing only first page total to 999 yielded accepted Preview with pageTotals `[999,3]`, rawReadCount=3, reportedTotal=3. Production `readAllReportPages` rejects this drift; existing commit also rejects inconsistent page totals. The direct Preview boundary is still weaker. Existing commit's `<` guard permits excess raw count if other guards pass. No commit was invoked for this diagnostic and Material source/preview/commit production code was not modified.
- Independent Material-owned repair should implement the field-level paging contract above and decide how historical overlap dedup is surfaced; do not change Canonical identity, Source facts, commit ownership or query fields. This is remaining work, not a PASS claim for all Source boundaries.
- Proven protocol lacks server-side atomic revision/snapshot token. Before/after Discovery catches mapped content/hash drift but cannot prove every detail row was read atomically. No guessed field added. SHA hashes detect change, not authenticity.
- Future formal Server integration prerequisites: trusted session actor resolved server-side; actor-scoped approved personal account binding with encrypted server/OS secret ownership; secure upstream transport or explicitly evaluated trusted network; no arbitrary report selectors; bounded isolated read sessions; complete reads plus drift reconciliation; source refresh transaction/CAS and audited domain ownership defined in a separate task. Existing bootstrap-only transport wrapper is not an interactive multi-user sync service. No public authentication system was built.

## Gate 4 current-run validation and release limits

- Python 3.14.6: `python -m unittest discover -s tools/ainuoke-bridge/tests` PASS 44/44; all credentials/client/keyring dependencies fake; mocked urllib timeout, no real request.
- Node 24.16.0: Ainuoke dedicated suites plus final-bootstrap Snapshot guards PASS (112/112 before final paging regression; final color suite 16/16 and final full suite includes it). `npm test` final PASS 679/679, 0 skipped; `npm run typecheck`, `npm run lint`, `npm run build` PASS. Build prerendered 41 routes; existing chunk-size/plugin-time advisories only. `git diff --check` PASS.
- New regressions were observed failing against baseline implementation before corresponding repairs. Required coverage reuses existing multi-page, total/readCount mismatch, blank/duplicate BillNo, identities, false positives, drift, empty/null/zero, stable hash, stale Snapshot, bounded retry/auth refresh and no-write/secret tests.
- No new business/architecture decision: this enforces existing contracts. D-080/D-082/D-096 unchanged. No DB/schema/Server SalesOrder/DeliveryPlan/creation/save/Browser Repository/Quote UI/domain/Material commit changes.
- Real Ainuoke reads/writes, credential reads, real contract/material commit, PostgreSQL operations, Windows trial changes, COS operations, deployment and merge: NOT EXECUTED. This candidate is not deployed and does not establish formal multi-user Ainuoke synchronization.
- Execution note: default restricted process initialization failed before any command; approved per-command escalation enabled local tooling. No shared environment/credential/Git/TLS/proxy configuration changed. `npm ci --ignore-scripts` installed lockfile dependencies only; package files unchanged.
