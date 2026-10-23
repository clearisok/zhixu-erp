# Exact current0042 Server image: isolated persistence and recovery

2026-10-22. D147 authorized engineering only, not existing-environment cutover,
deployment or human acceptance. Root is the sole writer. No application, SQL,
ops, test, permission or UI code changes in this documentation phase.

## Source and build identity

Branch `chore/server-current-image-0042` starts from clean
`105cfbfcb336c0c29efe583f9ff09fda52bc07f0`; no inherited dirty. Main was independently
reverified as `996dfedc12da3527343cd3ff2aa5eea35497e10e`. Scope checkpoint64f7cd8c is
documents only. The actual build uses an independently extracted Git archive of
the exact105 commit, not the changing development tree or host dist/node_modules.

| Item | Observed value |
| --- | --- |
| Tag | `zhixu-persistent-local:105cfbfc-20261022` |
| Image ID | `sha256:646acc4a19b19209009e3b230a107c8ea1bf4ece2fe3a1c2ab7d5ff283578071` |
| Source label | `105cfbfcb336c0c29efe583f9ff09fda52bc07f0` |
| Build ID | `server-candidate-105cfbfc-20261022` |
| Build time | `2026-10-21T22:53:53Z` |
| Schema |41 files,maximum0042;0013 absent |
| Authority |session;Server Quote/master settings;writable Quote;snapshot order read |

The existing Dockerfile and existing build-only USTC option were used once, with
TLS/package signatures retained. No host dependency installation, system trust,
shared Git/proxy/authentication or Docker daemon change. The tag was absent before
the build; no previous image was overwritten or relabeled. Priorf469 image and its
separate40-file evidence remain unchanged and do not prove current0042 readiness.

## Actually executed current-image checks

The unchanged `server/integration/persistent-local-trial.integration.test.mjs`
was invoked once with explicit image/full source. Result: **8/8 passed**, no
failures, skips or cancellations,317334.7113ms. The parent rehearsal is
317201.3689ms; its six dependent phases all succeeded:

1. New private preparation, explicit empty-schema init and no automatic migration
   (95968.2409ms). Current41 ledger entries apply only to a new empty schema;
   business tables start empty and only one technical administrator is initialized.
2. Healthy DB cannot mask missing bucket, invalid S3 credential or untrusted TLS
   (2503.5073ms). Only this fixture's CA bytes are replaced and restored.
3. Formal session/Quote/attachment APIs save a synthetic Quote and PNG, preserve
   creation idempotency, deny anonymous access and return exact PNG bytes
   (6573.1144ms). No sales order or Ainuoke source is seeded.
4. Restart and cold container recreation retain Quote identities/content,
   administrator password hash, all migration ledger entries and attachment bytes
   (47092.4442ms). These are this invocation's synthetic containers only.
5. Exact-target DB backup and offline object export use the existing guarded tools
   (36633.6416ms). A new bundle does not alter canonical config/runtime hash.
6. A different new empty project restores original identities and bytes; active
   writers, nonempty targets, writable mounts, corrupt bytes and object collisions
   are rejected (120727.887ms). Test-injected object corruption is repaired only in
   its owned fixture; the restore tool does not overwrite a collision.

The direct cleanup regression also passed: refused/unprepared projects are never
stopped. Actual source and restore use unique random project names, different
persistent data/object/secret volumes and private loopback ports excluding the
protected list. Only successfully prepared, explicitly owned projects can be
cleaned. Successful teardown removed these test projects and their own synthetic
backup/private files; any failure would retain owned fixtures for investigation.

The local source archive and candidate image are retained in ignored output/image
storage; neither is a new running user entrance. No browser/pixel or user business
acceptance is claimed. No other old contract suite, project927 or full PG270 test
was rerun in this image-only phase. Parent105's15/76/927/116/types/lint/build facts
remain in their own frozen report, not attributed to this invocation.

## Delivery and preserved boundaries

The input105 was exact remotely verified after its one push returned STOP and an
independent zero-push original-tool Dry Run returned DELIVERED_VERIFIED. Both
receipts are retained; no repeated push or claim of permanent network recovery.
Its Team39689484921 and Release39689490085 are success; Source39689481386 was still
running at this report freeze. These are parent application CI, not this document
commit's CI. The final exact guard/delivery/release check is recorded separately.

No PR creation or mutation, merge, close, existing port/volume cutover, Source
request/credential/private-report read, binding, activation or scheduler. The
synthetic technical administrator is not a real employee account. No real business
DB was read, migrated, restored or written.3001/50426/59069/62326/62426 and other
protected environments, backups, Browser state, worktrees and old images remain.

The new image is an engineering candidate only. Replacing50426/62426, merging the
original PRs, source activation, human acceptance and asset retirement still need
their own concrete Gates/authorization. A current image does not make all ERP
business domains, shipment cancellation semantics or Server closing complete.
