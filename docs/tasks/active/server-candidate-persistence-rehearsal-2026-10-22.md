# Current Server candidate persistence rehearsal

2026-10-22. Branch `chore/server-candidate-persistence-rehearsal` was created
from independently re-read GitHub main
`996dfedc12da3527343cd3ff2aa5eea35497e10e`, then
fast-forwarded the clean application/metadata input
`f4692eea92556ca02fcc068c03940fd2982a4d10`. Root is the sole writer;
the existing independent reviewer is read-only. No inherited dirty changes.

This phase validates the approved D-147 local persistent architecture against
the current application image. It does not upgrade the old 62426 target, replace
50426, query Source, activate a target, create real business data, or authorize
deployment, retirement, merge, or PR closure. All previous protected ports,
volumes, accounts, Browser stores and worktrees remain protected.

The exact image was built while the checkout was clean, before the test-helper
changes, using the existing Dockerfile and its existing build-only USTC option.
No host/daemon/proxy/authentication/TLS trust change or dependency installation
outside that isolated image build was made. Image facts:

- Source: `f4692eea92556ca02fcc068c03940fd2982a4d10`.
- Tag: `zhixu-persistent-local:f4692eea-20261022`.
- Image ID: `sha256:ee7095b4d404c2bd2a1b62402e941f21cff86266817f4e2168d467dccf837f1d`.
- Build: `server-candidate-f4692eea-20261022`, `2026-10-21T20:05:28Z`.
- Ledger: 40 migration files, maximum prefix0041 (0013 is absent), not41.
- Session identity; Server Quote/master settings; writable Quote; snapshot order read.

The existing actual-image harness creates two unique synthetic projects with
different data/object/secret volumes. It explicitly initializes an empty schema,
creates a synthetic Quote and PNG through the formal API, tests restart/cold
recreation, takes an exact-target database/object backup and restores into the
second empty project. It checks IDs, administrator hash and exact attachment
bytes, plus writer-freeze, TLS, read-only bundle, tampering and collision failures.

The first actual-image run passed7/7. Independent review identified a conditional
test cleanup defect: a state was registered before `prepare-local` succeeded,
so a refused same-name project could have been stopped on failure. Both projects
in that run had already prepared successfully. The helper now cleans only states
whose preparation succeeded in this run, and a direct cleanup regression covers
refused/unprepared projects, stop/down and unknown names. Reserved ports were
also expanded to all currently registered old entries. No production ops or
application/SQL behavior changed. Reviewer found no remaining definite P1/P2.

The corrected actual-image rehearsal passed8/8 with no skips/failures/cancellations
(321589.8036ms); the original7/7 remains separate. The isolated ops contracts
passed22/22; syntax and targeted lint passed. A separately attempted historical recovery test failed at its first
image-inspection step because `zhixu-server:q3b2h-ready-f0c252b52b6a` is absent.
That old hardcoded fixture is not the candidate image; no database/container was
created by that failed test. It was not rebuilt, relabeled, or reported as passed.

Ignored evidence: `outputs/current-image-persistence/`. Previous state/index/
handoff Git blobs are preserved byte-for-byte under
`../completed/2026-10-22-candidate-persistence-inputs/f4692eea/`.
The [frozen engineering report](../completed/2026-10-22-current-server-persistence-engineering.md)
records exact tests and limits. Forward evidence registration, exact committed
guard and clean checkpoint will be appended only after they actually complete.

Remote writes remain stopped after the earlier a296 rejected-exit observation;
independent exact remote and successful CI for a296 do not explain that failure.
No push is retried in this phase. Num/outdate is already confirmed; pending real
filter-verification quota and the three closing decisions are not defaulted.
This phase cannot establish all-domain nonempty historical recovery, an old-target
upgrade, deployment or user business acceptance. The overall Goal remains active.

## Frozen checkpoint and forward registration

The corrected harness, report and precise input archives are committed as
`2fdd8b277e870c1e3077ad4f7bf19eb5ad1172f9`; the working tree was clean.
Precommit main-based guard passed11pages/55capabilities, with80 inherited UI paths
and no new UI changes in this phase. All three input archive blobs matchf469.
One new immutable document evidence is now appended, leaving the previous260
records and all55 capability/status/page/runtime objects unchanged. No deployment
dimension is promoted. Final release tests and exact committed guard follow.

Metadata main-based guard passed, and the final release suite passed116/116
with0 failures/skips/cancellations (192535.3855ms). Independent static review
verified the report's frozen blob/hash, unchanged260 old evidence and55 capability
objects, and all three input archive blobs. The exact final metadata-commit guard
and clean state are separately recorded in ignored checkpoint-final.json; no
second full application/PG/browser run is implied by these document-only changes.

Read-only GitHub review still shows eight open draft PRs120–127, each CLEAN with
its existing source/team-access/baseline checks successful. Those checks belong
to their own heads, not this new candidate. Seven heads are actual ancestors;
#126 head956921f63ba3069c059ca64c2324edbc33afefd8 is not, although its guard,
guard-test and feature-document blobs exactly match the candidate. Preserve its
original history in future integration; do not call it automatically included,
redundant or safe to close. No GitHub write or merge decision was made.
