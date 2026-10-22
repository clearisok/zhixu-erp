# Exact candidate0c7377d9: persistence and independent recovery

2026-10-23 Asia/Shanghai. Engineering only; no existing entrance upgrade or real
business operation. Root is the sole writer. The source branch remains at its
original verified head; the existing image-verification branch is reused for
this report by a clean fast-forward, without changing another worktree.

## Source and image identity

The new image was built once from a separate exact Git archive of
`0c7377d99a51bcab6589217edff69a54e7b2ee21`, not host dist or a dirty checkout.
Main was independently re-read as996dfedc12da3527343cd3ff2aa5eea35497e10e.
This is an unmerged candidate, not a main deployment.

| Item | Observed value |
|---|---|
| Tag | `zhixu-persistent-local:0c7377d9-20261023` |
| Image ID | `sha256:4a489d9a8fd7a78acf5fc3fb9c88855c24637b9c09e56c932a280461e0d47e92` |
| Build ID | `server-candidate-0c7377d9-20261023` |
| Build time | `2026-10-22T16:06:54.405Z` |
| Authority | Server Quote/master, writable Quote, session, snapshot order read |
| Schema |41 files;maximum0042;0013 absent |

The existing Dockerfile and existing build-only USTC option retain TLS/package
signatures. No host package installation, shared network/auth/TLS/daemon change,
image replacement or relabeling. The tag was absent before this build. The old
f469/105 images and their distinct40/41-migration evidence remain unchanged.

## Actually executed

The unchanged `persistent-local-trial.integration.test.mjs` consumed this image
and full source once. **8/8 passed**,0fail/cancel/skip,322827.0248ms. The parent
rehearsal took322693.1906ms; all six dependent phases succeeded:

1. Explicit empty-schema preparation/init, no automatic migration,96936.336ms.
2. Missing bucket, bad object credentials and untrusted TLS fail closed,2958.4717ms.
3. Formal session Quote/PNG attachment APIs preserve exact bytes/idempotency and
   reject anonymous access,6450.7887ms. Only synthetic records were created.
4. Restart and cold recreation preserve IDs, content, password hash, migration
   ledger and object bytes,46333.2721ms.
5. Existing exact-target DB/object backup,38283.371ms.
6. Independent empty-project restore, writer/tamper/collision rejection and
   complete original identity/byte checks,123787.1108ms.

The cleanup regression passed. Only this run's successfully prepared random
projects, their separate data/object/secret volumes, synthetic backup and private
fixtures were cleaned. Protected ports are excluded by the unchanged harness.
Failure would retain owned fixtures; no unrelated project cleanup is permitted.
An additional network-disabled image inspection confirmed41 migrations, first
0001, last0042 and no0013. It did not start an application or contact a database.

## Fresh protected-runtime observations

At2026-10-22T16:12:14.398Z, public localhost build-info returned3001 build
20261017-091334/source e3e8e743;50426 did not verify, and the same bounded listener
snapshot showed no50426 listener. This does not determine why it is stopped.
At16:13:44.917Z,62426's running project labels still identify
`zhixu-quote-trial-server-g1`, app/gateway image8175f6280d54b6d4af28cb2ebe6d86741b906b9d,
buildserver-g1-8175f628-20261020. No env/secrets or business DB were read.

The new0c image did not replace any of those resources. There is no new long-lived
user entrance, deployment, source read/binding/activation, real account change or
Browser operation. This rehearsal proves synthetic Quote/attachment persistence,
not every ERP domain's historical recovery or Server closing. Runtime cutover,
PR merge, real Source and user acceptance remain separate.

The source0c guard/remote proof and CI are tracked in the recovery task; they are
not this report commit's CI. At2026-10-22T16:08:57.171Z, Team39810668692 and
Release39810675561 succeeded; Source39810661082 remained in progress, all exact0c,
attempt1. No workflow was restarted. Final documentation evidence/delivery is
recorded in the image task rather than rewriting this frozen report.
