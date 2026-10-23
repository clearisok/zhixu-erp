# Current Server image: isolated persistence and recovery evidence

2026-10-22. D-147 approved engineering; no deployment or user-acceptance claim.
Root was the sole writer and the existing reviewer performed static review only.
Branch `chore/server-candidate-persistence-rehearsal` starts at independently
reverified main `996dfedc12da3527343cd3ff2aa5eea35497e10e`, then fast-forwards
clean input `f4692eea92556ca02fcc068c03940fd2982a4d10`. Main was independently
re-read again before closure and remained exact. No inherited dirty changes.

## Exact image and permitted targets

The image was built once from the clean f469 checkout before the harness edits:

| Item | Observed value |
| --- | --- |
| Tag | `zhixu-persistent-local:f4692eea-20261022` |
| Image ID | `sha256:ee7095b4d404c2bd2a1b62402e941f21cff86266817f4e2168d467dccf837f1d` |
| Source | `f4692eea92556ca02fcc068c03940fd2982a4d10` |
| Build | `server-candidate-f4692eea-20261022` |
| Built at | `2026-10-21T20:05:28Z` |
| Schema | 40 migration files, maximum0041; 0013 is absent |
| Authority | session identity; Server Quote/master settings; writable Quote; snapshot order read |

The existing Dockerfile and its existing build-only USTC option were used with
TLS/signature checks retained. No host/shared proxy, Git authentication, Docker
daemon or system certificate configuration changed. Credentials, outputs, backups,
node_modules and private inputs were excluded from the image context by the
existing Dockerignore. No dependency was installed into the shared host runtime.

Each actual-image run used two different newly generated synthetic Compose
projects, distinct persistent database/object/secret volumes, loopback-only
gateway ports, process-specific certificate validation and no Source profile or
credential. Existing environments were never adopted. The first run used nonce
368388d7b7; the corrected run used ea432b46ef. Successful cleanup was limited to
these owned projects and their own test files/backups. Failure would preserve
owned fixtures; unprepared/refused projects are now excluded from cleanup.

## Executed checks and results

- Initial actual-image run: **7/7 passed**, no failures/skips/cancellations,
  330608.115ms. It ran before the cleanup-ownership patch; both source and restore
  preparations in that run succeeded. This result is retained separately.
- Corrected actual-image run: **8/8 passed**, no failures/skips/cancellations,
  321589.8036ms. This includes the new direct cleanup regression, the parent
  rehearsal and all six dependent phases.
- Existing config/readiness/local-object contracts: **22/22 passed**,
  4710.6577ms, no skips/failures/cancellations.
- Node syntax, targeted ESLint with zero warnings, and whitespace checks passed.
- Independent static review closed the cleanup P2 and found no remaining
  definite P1/P2. The reviewer did not run tests or containers.

The six actual-image phases verify:

1. Explicit preparation accepts only new targets. An empty public schema cannot
   start the app or silently migrate; explicit init applies all40 ledger entries,
   leaves every business table empty and creates one technical administrator.
   Linux secret ownership/mode, exact volumes and internal-only services are checked.
2. Healthy DB/services cannot mask a missing bucket, invalid S3 credentials or an
   untrusted certificate. Only the owned test CA bytes are changed and restored.
3. The formal session/Quote/attachment APIs create only a synthetic Quote and PNG.
   Anonymous read is denied, creation retries return the original ID, and the
   downloaded PNG matches every byte. No sales order is seeded.
4. Restart and cold container recreation preserve Quote IDs/content, all migration
   ledger entries, administrator password hash and attachment bytes.
5. Existing exact-target DB backup and offline object export are used. A fresh
   bundle directory does not alter canonical config or the stopped app's hash.
6. A second empty project restores original identities, administrator hash and
   bytes. Active writers, nonempty DB targets, writable bundles, corrupted bytes
   and object collisions are rejected. Test-injected object corruption is repaired
   only in the owned fixture; the restore tool never overwrites a collision.

One optional historical test was also attempted with those contracts. It failed
at its first image inspection because its hardcoded
`zhixu-server:q3b2h-ready-f0c252b52b6a` image is absent. The test has seven old
migrations and is not a current-image test despite its historical title. Its
created-target list was still empty; no DB/container was created or cleaned.
The failed23-item invocation (22pass/1fail) remains in ignored evidence. The three
applicable contract files were then run explicitly and passed22/22. No historical
image was rebuilt, relabeled, or reported as passed. No full project/PG suite or
new browser pixel acceptance is claimed by this tooling-only phase; the f469
application's prior927/269 results remain in their original frozen report.

## Small harness correction

The registered reserved-port list now also covers62200/62310/62316/62426.
Previously a state entered the cleanup list before preparation; a name collision
could reject preparation yet still allow failure cleanup to stop that project.
Each state now begins `prepared:false`, changes only after the explicit success
marker, and cleanup validates the owned name before skipping unprepared entries.
The regression invokes that same helper for stop/down, refused preparation and
unknown names. This changes the test harness only, not application, SQL, UI or
production operations. Partial preparation is preserved rather than repaired.

## Separate local, remote and runtime boundaries

The protected listener PIDs remained3001=26680,50426=33856,59069=43468,62426=26668.
A read-only label check confirmed62426 still uses the original source
`8175f6280d54b6d4af28cb2ebe6d86741b906b9d`, build
`server-g1-8175f628-20261020`. This is an observation of protected processes/image,
not a claim to have compared every byte in their databases. They were not upgraded,
reinitialized, restored, stopped or used by the rehearsal.

Real Source requests0; private Ainuoke credential/candidate reads0; existing DB
mutations0. No account/Browser changes, automatic merge/PR closure, deployment,
source activation, scheduler, retirement or formal cutover. The pending source
verification quota and closing questions remain pending; Num/outdate is already
confirmed. This does not prove all-domain nonempty historical recovery or provide
authorization to upgrade an existing environment.

Git writes remain stopped after a296's rejected-exit observation. Independent
remote exactness and a296's three successful CI runs remain separate old evidence;
no new upload/PR/Hosted CI is claimed for this candidate. Initial and final logs,
image/phase metadata and protected readbacks are in ignored
`outputs/current-image-persistence/`. The previous three state documents are
Git-blob-identical copies under `2026-10-22-candidate-persistence-inputs/f4692eea/`.

Final source checkpoint, forward document registration, main-based release tests,
exact committed guard and remaining-dirty result are recorded after this frozen
engineering report. They must be observed, not inferred from this report. The
overall Goal remains active.
