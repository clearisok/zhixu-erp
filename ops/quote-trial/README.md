# Quote trial candidate (2026-10-09)

Engineering preparation, **not a real deployment**. D-098 locks the merged Quote-first
scope; D-096 historical import is NOT REQUIRED. The old environments/data remain
untouched. User business acceptance: **NOT RUN**. Do not use the legacy
`deploy-production.yml`, old Compose or ports 3000/3001/3002 for this candidate.

## Candidate and verified boundary

Actual `Dockerfile.server` image: `zhixu-quote-trial:9ee254db89c6`, source
`9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`, build ID `quote-trial-20261009`,
build time `2026-10-09T03:00:00Z`. Labels, compiled `/build-info.json` and running
identity agree: Quote/master **server**, writer **writable**, identity **session**.
Later operational/docs commits do not imply this image was rebuilt with their SHA.
The initial temporary short-SHA image is not the candidate.

`quote-trial-release.integration.test.mjs` consumes this actual image with two
unique disposable Compose projects, private PostgreSQL 16 volumes/networks and
distinct local MinIO endpoints. HTTPS uses a synthetic CA that is explicitly
trusted, **not disabled certificate verification**. The app is production mode,
UID/GID 1000:1000; synthetic credential files are Linux-owned 1000:1000, mode 600,
mounted read-only. Tests never read real credentials or old Browser profiles.

Verified: normal startup fails on missing schema; explicit runner applies
0001–0008; six technical tables may contain ledger/new admin/role/permission
records, the other 26 public tables start at zero. No demo/master/order seeds.
Restart/recreation preserves explicit synthetic master/Quote/PV/Revision/Estimate,
admin hash and S3 bytes. TLS login/logout/expiry, Origin, 401/403, restricted account,
pages, attachment bytes/SHA, customer XLSX/ZIP, internal XLSX and read-only logs work.
Existing historical immutability, exact decimals/CAS and Estimate isolation are not
redefined. Current default frontend remains browser/browser/writable.

## New target setup — separately authorized, not performed here

Use a **new** project `zhixu-quote-trial-<unique-name>`, DB `quote_trial`, owned
`<project>_data`, private `<project>_default` network. No external/legacy volume,
fixed legacy container name or dump inheritance. This provided entrypoint binds
only loopback HTTPS; LAN/cloud ingress, real certificate/domain/Origin, CAM and
file mounts must be reviewed for the separately authorized target. Never expose
Local Single-User remotely. Do not overwrite `/opt/zhixu/staging` or `/etc/zhixu`.

Consume the built image (e.g. Docker save/load with an independently checked file
SHA), not an on-server frontend dependency installation. Copy the reviewed
`ops/quote-trial` tools and existing database guard/backup/restore scripts. Docker,
Node and PowerShell 7 are sufficient for these operation entrypoints. Any image
rebuild uses the same Dockerfile with all six identity/authority build arguments
and a full reviewed commit; do not relabel a different build as this candidate.

Create an explicit operator config **outside Git**, protected against other users;
never source it as shell code. No `.env` is implicitly adopted. Required keys:

```text
TRIAL_PROJECT=zhixu-quote-trial-<new-name>
TRIAL_PORT=<unused-loopback-port-not-3000-3001-3002>
TRIAL_IMAGE=zhixu-quote-trial:9ee254db89c6
TRIAL_COMMIT=9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23
TRIAL_BUILD_ID=quote-trial-20261009
TRIAL_BUILD_TIME=2026-10-09T03:00:00Z
TRIAL_HTTPS_ORIGIN=https://localhost:<same-port>
TRIAL_DB_PASSWORD=<new-random-password>
TRIAL_ADMIN_USERNAME=<new-administrator>
TRIAL_ADMIN_PASSWORD=<new-password-at-least-12-characters>
TRIAL_S3_ENDPOINT=<reviewed-HTTPS-COS-endpoint>
TRIAL_S3_REGION=<reviewed-region>
TRIAL_S3_BUCKET=<existing-reviewed-bucket>
TRIAL_S3_PATH_STYLE=false
TRIAL_SECRET_ID_FILE=<absolute-file-path>
TRIAL_SECRET_KEY_FILE=<absolute-file-path>
TRIAL_TLS_CERT_FILE=<absolute-certificate-path>
TRIAL_TLS_KEY_FILE=<absolute-key-path>
```

Reuse the existing credential installation/offline checker from PR #73; never
send credentials to chat. On Linux match the app's **1000:1000** owner, mode 600,
read-only mounts; TLS private key must likewise be readable only by its intended
service identity. No chmod 777/666. Actual target access/CAM is a future check;
the synthetic result does not supersede it. Reuse the COS bucket without listing,
adopting or deleting old objects. Only new DB-owned `attachments/<uuid>/original`
keys are legitimate new-system objects.

## Short operation entrypoints

From the reviewed repository/tool directory, use an absolute config path:

```text
node ops/quote-trial/trial.mjs check <config>
node ops/quote-trial/trial.mjs init <config> --execute=<exact-project>
node ops/quote-trial/trial.mjs start <config> --execute=<exact-project>
node ops/quote-trial/trial.mjs status <config>
node ops/quote-trial/trial.mjs logs <config>
node ops/quote-trial/trial.mjs restart <config> --execute=<exact-project>
```

Check has no persistent mutation (it briefly runs the reviewed image offline to
read compiled identity). It validates resolved Compose isolation and image/
compiled/runtime inputs without printing environment or secrets. Init requires
no application writers and a **new empty public schema**, then calls the canonical
runner; it is not a day-to-day command. Start/restart never run migration/import.
Logs show only allowlisted structured event names; raw errors are not forwarded.
`/api/v1/health` and `/build-info.json` provide running health/version evidence.
Do not call a responding gateway alone “healthy” if the app health fails.

The harness verifies these entrypoints, explicit acknowledgement rejection,
second-init rejection and resolved target guards. It deliberately cleans **only
its own synthetic resources**. There is **no cleanup/down/clear command** in the
operator entrypoint. Future user-entered trial data is real data, not disposable.

## Minimal backup and independent restore

Use a maintenance window for this **new trial project only**, not Q5 Browser
freeze or old environment shutdown. Keep app/gateway stopped until reconciliation:

```text
node ops/quote-trial/trial.mjs maintenance <config> --execute=<exact-project>
node ops/quote-trial/trial.mjs target <config>
```

The second command returns only project/container/volume/database/canonical Q3B2G
fingerprint. Pass those exact fields to the already verified scripts:

```text
pwsh -NoProfile -File Backup-Zhixu.ps1 -ExpectedContainerName <container> -ExpectedComposeProject <project> -ExpectedVolumeName <volume> -ExpectedDatabaseName quote_trial -ExpectedTargetFingerprint <fingerprint>
```

For object backup, set `TRIAL_COMPOSE_OVERRIDE` to the absolute reviewed
`ops/quote-trial/objects.compose.yml`, and `TRIAL_OBJECT_BUNDLE_DIR` to a new absolute
protected bundle directory. Validate config again, then:

```text
node ops/quote-trial/trial.mjs objects-export <config> --execute=<exact-project>
```

Preserve dump + its exact-target manifest + objects.json + object byte files
together; independently record their SHA-256 in the protected backup custody
record. Do not commit them. `pg_dump`/`pg_restore --list`, host/container dump SHA,
object size/SHA and manifest-to-restored-DB identity are checked. All available
attachment metadata-owned objects are backed up, including unlinked objects with
legal upload replay; no bucket scan/GC. Unfinished uploads cause fail-closed review,
not automatic cleanup. Other DB clients/running services cause object tooling to
refuse maintenance. Failed export stays maintenance; partial bundle is not PASS.

Create **another independent empty project/volume** and a distinct reviewed object
target for a restore drill, keeping the same storage provider/container/key
identity (synthetic drill uses a second MinIO with the same bucket name). Inspect
that target independently. Do not overwrite an existing/user database, copy a real
dump or point a disposable restore at COS. The tested restore call is:

```text
node ops/quote-trial/trial.mjs restore-check <new-config>
pwsh -NoProfile -File Restore-Zhixu.ps1 -BackupFile <dump-under-reviewed-backups-root> -ExpectedContainerName <new-container> -ExpectedComposeProject <new-project> -ExpectedVolumeName <new-volume> -ExpectedDatabaseName quote_trial -ExpectedTargetFingerprint <new-fingerprint> -ExpectedBackupSha256 <verified-sha> -ConfirmDataLoss -ConfirmTargetFingerprint <same-new-fingerprint>
node ops/quote-trial/trial.mjs objects-restore <new-config> --execute=<exact-new-project>
```

The trial `restore-check` proves empty schema/no clients and stopped services;
the existing restore wrapper independently requires exact target, explicit second
confirmation and stopped writers (it is destructive, not itself an empty-target
checker). Neither resumes the app. Object
restore validates **all files before PUT**, exact restored metadata, and rejects
existing mismatched objects; matching objects can be reconciled idempotently.
Only then start the new target, log in and read Quote/history/Estimate/attachment
bytes/SHA and pages. The automated drill proved this and tampered-byte rejection.
It deleted only its generated synthetic dumps/resources after verification.

Application image rollback is not database/object restore. No automatic restore
overwrites new user data; cross-schema image rollback needs compatibility review.
Back up before updates. No promise that every earlier image supports current schema.

## Exactly three user trial cards — READY, not yet run

Before cards: manually create one brand and its customer salesperson; add the
fabric/trim entries needed by the chosen real quotation. Explicitly choose rate,
markup, labor currency and freight as applicable; no company facts or demo masters
are seeded. Manufacturing country/preset can remain unconfigured when the workflow
allows it. Administrator provisions a restricted session account through the
existing RBAC boundary; do not emulate it with Browser mock permissions. Current
Server trial has no account-management UI: restricted-account provisioning is an
explicit target-operator step, not an automatically copied legacy user/template.
This run verified only the independently provisioned synthetic session identities.

1. **Processing:** new processing Quote, USD labor and two PV scenarios; save,
   refresh and compare quantities/prices. Check the chosen type persists and null
   differs from explicit zero.
2. **Distribution:** new distribution Quote, cost edit and new Revision; generate/
   edit Estimate, inspect history, upload style image, save customer confirmation,
   download customer Excel and internal summary. Customer file contains no Estimate;
   internal Estimate columns require explicit choice and permission.
3. **Restricted viewer + restart:** use the restricted account to read allowed
   Quote information, confirm protected Estimate fields and unauthorized actions are unavailable;
   administrator follows the restart command and reads the same Quote/history/
   attachment again. No unexpected second Quote, reset administrator or lost image.

Feedback only: build version, page, steps, expected/actual, blocking yes/no,
necessary screenshot. These cards are **not** automated or user acceptance PASS.

## Evidence and next action

Executable sources: `server/integration/quote-trial-release.integration.test.mjs`,
`s3-runtime-bounds.test.ts`, `scripts/__tests__/quote-trial-config.test.mjs`,
`git-delivery-state.test.mjs`. Current execution numbers belong in AI_HANDOFF/
final report, not duplicated historical test logs here.

Final synthetic drill evidence: `zhixu-20261009T033605Z-18ad39f5.dump`, SHA-256
`5613b00c5b1d120623e50b4e1b62bd6e9f7bf5e29249f8ff2f92c333f4c964d1`;
dump/object integrity and restored readback PASS. This disposable dump and its
objects were cleaned up after verification, **not a real rollback backup**.

Next user action: review this candidate, supply/confirm an explicitly **new** target,
access/TLS and real file-mount/CAM boundary, authorize its deployment separately,
then do the three cards. No historical source/freeze/import Gate is required.
Formal multi-user production still requires target HTTPS/auth/RBAC, real storage
permissions/mount evidence and operator backup practice; this disposable run does
not claim Linux/cloud production deployment ready.
