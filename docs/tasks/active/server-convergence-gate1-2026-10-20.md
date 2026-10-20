# Server convergence Gate 1 — persistent empty local target

2026-10-20. Main baseline `996dfedc12da3527343cd3ff2aa5eea35497e10e`.
Branch `codex/server-persistent-empty-target` in the existing clean `7bf3` worktree,
created from main then fast-forwarded to the explicit Gate 0 dependency
`652fed6464b5aea144689480c936a0c5f2d62d90`. No inherited dirty changes.
Gate 0 draft PR #124 has all three CI checks successful at that exact head;
it is not merged. The approved continuous Goal is now active.

## Scope and implementation boundary

- New local persistent empty target only. No historical migration/import needed.
- Preserve 3001, 50426, 59069, 62326, historical environments, accounts and volumes.
  No cutover, source collection, real account changes, formal deployment or merge.
- Reuse `ops/quote-trial` production/session/PostgreSQL/S3 and existing backup format.
  Local objects is opt-in, exact five services with internal application network, digest-pinned
  object image, owned named volumes, private keys and process-specific certificate trust.
- Normal startup stays schema verify-only. Explicit initialization is new-empty-only.
  No new backend, attachment owner, database restore implementation or global TLS bypass.
- Shared restore writer guard is unchanged: only database can run during DB restore.
  Object restore follows in its distinct local object store, app/gateway still stopped.
- Final persistent target must be empty before user use; synthetic writing/recovery
  occurs only in two new test projects. No testing then clearing the final target.

## Initial review and checks (before actual-image rehearsal)

Independent pre-review confirmed strict three/five-service separation, actual volume
checks, signed HeadBucket, DB-only restore freeze and distinct target object ownership
are required. These requirements are in the implementation and negative tests.

Initial targeted operational regression: 36 passed (configuration, actual TLS probe,
runtime/readiness, Windows private input/control and Linux secret volumes). No actual
persistent target or recovery test has passed yet. First targeted lint found one unused
test variable; it was removed before the next check. Full actual-image rehearsal,
final quality/baseline, independent code review and exact remote delivery remain pending.

The actual main application behavior is unchanged in this Gate. #120–#123 integration
remains Gate 2. New Server closing CNY/USD is a future domain target, not a change to
current Quote currencies or a claim that closing exists.

## Isolated build transport diagnosis

Checkpoint `23d18878af85e69fc753096913f445916d32c76a` first Docker build failed
while `apk` streamed Python 3.14.8 from the default Alpine CDN: package extraction
reported I/O error. A minimal new container reproduced it. Host C/D and Docker
filesystem have ample free space; no matching kernel I/O error was observed.
Separately downloaded Python APK passed `apk verify` and tar extraction, and its
local-file installation succeeded; a subsequent network pycache fetch failed.
Thus the evidence localizes failure to that package transfer path, not a proven
disk fault. Its underlying CDN/proxy/TLS cause remains unresolved.

An isolated HTTPS contrast using USTC (listed on the official Alpine mirrors page)
installed the same Python 3.14.8 successfully, with signature/TLS checks intact.
The Dockerfile now offers explicit build-only `ZHIXU_APK_MIRROR=ustc`; default
behavior is unchanged, no host/daemon/proxy/trust configuration is altered.
This is not evidence that the original channel permanently recovered.

## Actual image rehearsal corrections

The image `zhixu-persistent-local:8175f628-20261020` built successfully from
`8175f6280d54b6d4af28cb2ebe6d86741b906b9d`; updated operational scripts are
separately bound into the test project and must be pinned at final delivery.
Initial actual-image attempts exposed and corrected:

- Bitnami's data directory is root:root/0775. The 1001:1001 process could not
  create its private identity files. One-time preparation now initializes only
  the new empty object volume to 1001:1001/0700; `nocopy` prevents Docker image
  copy-up from restoring the old directory ownership.
- The image declares `/certs` as an anonymous volume. Its unused internal TLS
  directory now has a precise read-only/noexec/nosuid 64KiB tmpfs mount. This is
  the sole tmpfs exception; all business bytes remain in owned named volumes.
- Its internal runtime/PID directories require the image's supported non-root
  `1001:0`, not the initially chosen `1001:1001`. Secret/data ownership remains
  1001:1001; no root process or broad host permission change is introduced.
- Docker did not publish the gateway port from an internal-only bridge. Only the
  fixed-upstream TLS gateway now additionally joins a separate project-owned
  ingress bridge. App/DB/objects have no external route or public port.
- The snapshot-enabled image correctly rejected missing source-read configuration.
  Local mode now explicitly uses snapshot reads under the unused `local-empty`
  namespace. No profile/target or collector is activated, no credential is mounted,
  and the internal network still has no external egress.
- Independent review found pre-start checks must include unattached existing
  named volumes and failed Node subtests must stop dependent phases. Both are
  corrected; failed synthetic projects are stopped and retained for diagnosis.

These failures are engineering findings, not successful acceptance. The protected
3001/50426 listeners remain unchanged. Full lint and 94 release tests passed;
at this early checkpoint the full persistence/recovery result was still pending.

## Rehearsal results and final review (2026-10-20)

Actual-image r4 at ops checkpoint `b546c65ca2098bb34c6c166112865077dacf66a0`
passed all 7 tests (289829 ms). It validated explicit empty schema initialization,
29 migrations, one technical administrator and zero business rows before testing;
formal authenticated Quote/attachment API creation and exact-byte download;
restart and cold container recreation; offline DB/object backup; and independent
new-target restore. Missing bucket, incorrect credentials, untrusted TLS, active
writers, tampered bytes and object collisions were rejected. Restored IDs,
administrator hash, schema ledger and attachment bytes remained unchanged.

r5 passed all 7 tests (304027 ms), additionally proving fresh-directory repeat
exports preserve the canonical app configuration hash and cannot overwrite an
existing bundle. Both successful runs cleaned only their own generated test
projects, volumes, fixtures and dumps. Earlier failed projects were stopped and
retained; no global prune or existing environment cleanup occurred.

Independent static review found and resolved a gateway policy gap: local mode
now validates the gateway's exact app upstream/port/command, not only its network.
The same review requires all restore paths to mount the effective backup input
read-only. The one-off CLI now does this for configured and explicit directories;
the container independently checks the Linux mount flag. r6 covers rejection of
a writable direct call and both read-only paths. Its result is pending at this
checkpoint; do not call final Gate PASS before that result and review.

42 operational tests passed after the final policy changes. Full lint, typecheck,
Docker production build and 94 release-baseline tests passed in this Gate;
the latest changed operational files also passed targeted lint and whitespace
checks. The exact final-head guard, remote PR/CI and final empty runtime remain
separate pending checks. No browser pixel or human acceptance is claimed.
