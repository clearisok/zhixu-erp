# D-099 win01 update preparation — READY FOR UPDATE, execution not authorized

2026-10-09. This record covers read-only real-target audit, candidate build and isolated tests only. No real Backup, configuration write, restart/recreate, migration, account change, Browser access or COS access occurred. User UI acceptance remains PENDING.

## Source and candidate

- PR86 MERGED: UI source `460a9c1ef29ef69c21a0d0e02162ffb23d0528d8`, merge/build source `330aad7d1bfc8e93326e1eb4971a7a9f34a74514`. Fetch and GitHub verification succeeded. PR84 was OPEN at `62af9d33fd1de9a981972405b0d1ef01b503d351`; it was inspected, not merged or copied into main.
- Standard checkout remained `fix/quote-server-original-ui-convergence` / `460a9c1ef29ef69c21a0d0e02162ffb23d0528d8` / clean. Preparation uses a separate managed worktree and branch `chore/d099-win01-update-preparation` from the exact merge. No old checkout or deployment-directory modification.
- Approved candidate: `zhixu-quote-trial-d099:20261009T103901Z`; Docker image ID `sha256:e28a4aec22e59567858ce3e99775646c68d30f90ffa1df95fdf5fbcbb5792c0d`.
- Dockerfile.server build ID `d099-win01-20261009T103901Z`, UTC build time `2026-10-09T10:39:01Z`, full gitCommit above. Labels and compiled build-info match: production, Quote/master=server, writer=writable, identity=session. No existing tag was overwritten. Preparation test/docs commits do not change this image source SHA.
- D-099 diff against deployed app source `878de323d618b25fca1f51ccf3f024e932641742`: Foundation CSS, formal list/new presentation, settings UI, list preferences/grouping and tests. No non-integration Server code, API/schema/migration, permission catalog, calculator, package/lock or Dockerfile difference. Editor runtime unchanged. Existing v1 preferences keep field layout/order/width/key; original grouping requires an explicit restore for those users, never automatic overwrite.

### Released migration-byte compatibility — mandatory for this Windows target

First image `zhixu-quote-trial-d099:20261009T103523Z` is **REJECTED / DO NOT DEPLOY**: fresh Windows checkout converted 0008 to CRLF and would fail verify-only startup. Git source content did not change. Real ledger and deployed image use CRLF bytes for 0001–0007 and LF for 0008. Globally converting to LF would also break the first seven checksums.

The approved build context was a Git archive of the exact merge, with the eight unchanged released migration files copied from an owned network-none container created from the old image, not from real PGDATA. Each file's LF-normalized content was compared byte-for-byte with the merge's Git blob; original released-byte SHA-256 was compared with the real ledger and the final image. All eight matched. Repository SQL, runner and ledger were not edited. This is target-specific artifact compatibility, not a new checksum normalization policy or migration execution.

| Version | Released bytes SHA-256 (real ledger = old image = approved image) |
| --- | --- |
| 0001 | a56d6e22f875adced50f4cb89f40c490b3e55735a4ffbe8b842fff14159a7695 |
| 0002 | 10e94fb08f89507cdfe8639b41f20a3b3ac91828960671af9e4c0536a3b6637b |
| 0003 | 0a387db3bd28fe570c47ce765c64a67264b66ca906e97dcb253170802b1c64f8 |
| 0004 | b37c554fc2ecbf5b2ee51ef5f37ad022904cb3a9f073bfa0db634f133f118d55 |
| 0005 | a2d62b13a4bdaa2d2ad516dfe9649df3e3fa65de7403256eda0f732eeef83973 |
| 0006 | 22a78832ec3bf64af78148e48d2302983a460c31ef8dc339e0f12b90f1cedaa4 |
| 0007 | 628f5030bc6f8623f06db8d7edd24205ad4df8247d32c3a947e1f5b919f63919 |
| 0008 | f205f3ed1fb737813fdac3b36d7a043c7e25759db217738fbc3606c0b121cf6a |

## Real win01 read-only baseline

Captured `2026-10-09T10:43:26.849Z`: Docker desktop-linux; protected tools snapshot SHA checks and current Compose-to-container configuration fingerprints PASS. Resolved models/private configuration stayed inside the audit process; no secrets, password hashes, request bodies or session tokens were output.

Final read-only recheck `2026-10-09T10:53:29.038Z` also PASS: exact desktop-linux named-pipe endpoint, target manifest root/project/database/volume/network/image/source, all eleven tool-file checksums, live container IDs/health/configuration, HTTPS identity, row counts and released ledger checksums remained the same. No real runtime command was submitted.

- Root `D:\zhixu-local-trial\win01`; project `zhixu-quote-trial-win01`; HTTPS `https://localhost:18443`, gateway host binding only `127.0.0.1:18443`. App/DB have no published host ports.
- App/gateway `zhixu-quote-trial-ui:878de323d618`, image `sha256:7a4812791968a24c8b8afedf0014d54ec62cc9db06d7bfd3559dc67b05bf4bd4`; live HTTPS source `878de323d618b25fca1f51ccf3f024e932641742`, build `quote-trial-ui-20261009` / `2026-10-09T07:20:46Z`, server/server/writable/session. All three services healthy, restart counts 0; trusted TLS health HTTP200, database=ready.
- Database container `c047b9fe8ea7b9b922ec3c8184e442248948c77c9389da0199eb63c96f741bec`; image postgres:16-alpine / `sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229`; PostgreSQL16.14, quote_trial, internal5432; exact volume `zhixu-quote-trial-win01_data`, network `zhixu-quote-trial-win01_default`. Same isolated project's read-only secrets/TLS mounts retained.
- `BEGIN ... READ ONLY` snapshot: Quotes/Revisions/PVs=2/2/2, Estimates=0, attachments/relations=2/2, brands/salespeople/fabrics/trims=1/1/1/1, users/roles=2/2, permissions/role-permissions/user-roles=54/55/2, Orders=0, operation logs=17. trial-admin unique and active. No password comparison/login/reset was needed. Attachments available=2, unfinished=0, non-S3=0; actual COS contents were not read.
- Ledger0001–0008 current, checksums valid against released bytes, pending=[]; no migration executed. Preparation-time counts are not a maintenance-window frozen baseline: users can still edit. Capture a fresh protected baseline during the separately authorized window.

## This preparation's executed validation

| Check | Actual result |
| --- | --- |
| Dockerfile.server formal Server/frontend build, labels/build-info/released SQL bytes | PASS |
| Actual image trial harness with explicit candidate identity | 12/12 PASS |
| Actual Chromium using front-end files extracted from approved image, synthetic PG/tmpfs/profile/memory attachments | 62/62 PASS |
| Auth/frontend/persistence/preferences | 67/67 PASS |
| Trial config/readiness/TLS probes | 10/10 PASS |
| PR84 whitelist tests extracted in an external temporary review directory | 7/7 PASS; no PR84 merge |
| PowerShell native Backup failures using temporary command stubs | 5/5 PASS; no real Backup |
| npm test | 674/674 PASS |
| typecheck / lint / diff-check | PASS |

The image harness covers session/Origin/RBAC, empty schema startup rejection, synthetic explicit initialization, S3-compatible test storage, XLSX/ZIP/logs, restart/recreation, app/gateway-only 878de323→approved candidate update, unchanged DB container/image/mount/network/port, exact Quote/history/Estimate and attachment bytes, administrator hash preservation without output, runtime drift refusal, TLS/proxy faults, isolated dump/object restore and tamper rejection. Cleanup PASS; no residual owned containers/volumes. Chromium preserves type creation, draft/CAS/precision/null/zero, costs/versions/Estimate/confirmation/exports/logs, field/response isolation and original list/preferences. Actual download bytes/SHA-256 PASS. Synthetic fault injection emits safe request AbortError events; all assertions passed, not a real service failure.

Initial harness candidate input rejected uppercase Docker tag timestamp; corrected the test-only tag validator and reran successfully. No runtime code was changed. Historical PR86 visual frames/tests remain [here](quote-original-ui-convergence.md), not claimed as a new screenshot run. Full unrelated PostgreSQL/COS suites, new visual capture and real Browser/manual business acceptance NOT RUN. No .env/default Browser authority modification.

## Proposed execution sequence — NOT EXECUTED; needs next explicit approval

1. Agree a maintenance window; user saves/closes editing tabs. Recheck exact target, image ID, tools custody, live identity/health and released ledger checksums. No setup/init, account provisioning, migrations or secret re-entry.
2. Use the existing daily `D:\zhixu-local-trial\win01\Backup-Trial.cmd` / PowerShell7 `Invoke-Trial.ps1 -Action Backup`. It verifies exact target, creates an exclusive timestamped bundle, stops app/gateway, invokes guarded Backup-Zhixu, exports only metadata-owned available COS objects, and resumes only on success. Verify nonzero dump, pg_restore --list, dump/manifest SHA-256, objects.json and every object's bytes/SHA, manifest-to-DB identities; record custody privately, commit none of these artifacts. This real fresh backup is still NOT RUN.
3. The daily Backup currently resumes the old app. Immediately reassert maintenance and stopped writers, then establish fresh protected row/relationship/identity baselines. If intervening writes make the backup stale, STOP for review rather than blindly reuse it. No bucket scan, PUT/DELETE/GC or automatic restore.
4. Reuse PR84's specifically reviewed `update-identity.mjs` at the pinned OPEN head as a bounded local operator helper, not a merge of that PR. Only TRIAL_IMAGE/COMMIT/BUILD_ID/BUILD_TIME may change; fully resolved before/after models must match except app/gateway image and app's three build identity values. Real-model dry projection already PASS, database model bit-for-bit unchanged. Keep private config/manifest previous versions; adapt only permitted identity metadata, not credentials/TLS/COS/ports/network/volumes or tools snapshot. No changes made in this Gate.
5. Explicitly recreate **only app/gateway**, with `--no-deps`; do not use restart as an upgrade. Independently assert original database container ID/image/config/mount/network/port remains exact. Use canonical bounded readiness checks for all three services, trusted HTTPS health and exact approved build-info. Existing startup verifies migrations only; unchanged permission sync/bootstrap may refresh technical catalog/role metadata, but existing admin password/active and user assignments must remain preserved, not reset. This behavior is tested, not a claim of zero startup SQL.
6. Compare protected business snapshots/relationships, accounts/permissions and ledger; use user's current password only in a hidden one-time read-only acceptance if needed (deployment password may predate the reset). Confirm legitimate attachment read/download bytes without uploads. User hard-refreshes and reviews D-099; existing personal columns stay untouched, explicit restore optional. Only then report deployed identity and separately record user acceptance.
7. Any backup/model/identity/health/reconciliation failure: nonzero/STOP, retain configuration, dumps, objects and data; no automatic database rollback/restore, cleanup or second initialization. Image-only fallback would require compatibility review and explicit operator direction, never overwrite user data.

Conclusion: **READY FOR UPDATE**, not updated. No real Backup/restart/config change/import/migration/restore/COS operation. D-096 historical import NOT REQUIRED. Real deployment and user UI acceptance need the next explicit authorization/confirmation respectively.
