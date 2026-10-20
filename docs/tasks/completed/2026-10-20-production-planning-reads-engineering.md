# Gate6B production planning read projections — engineering evidence

2026-10-20. Application source: `15295ecb265f91316476e4b010abc7b9083d2ac6`.
Verified main: `996dfedc12da3527343cd3ff2aa5eea35497e10e`.
Input was clean `1391feb5856bb23ab172f0eb7e6e7ffdcd51082e` on
`codex/server-production-planning`; root was the only writer, the existing reviewer read only.
The three input summaries are byte-identical Git blob archives under
`2026-10-20-gate6-inputs/planning-read-1391feb5/`.

## Scope and owner

Existing production plan service/repository/route ownership remains. Added bounded order/group
read directories, set-based physical SO plan totals, batch queue order summaries and version-anchored
history. Shared strict business verification SQL is reused by reads and the existing command validator;
old-schema capability checks prevent SQL references to absent processing tables.
No schema migration, UI mounting, route allowlist, grant, monetary field, actual completion, shipment,
closing, Browser writer/storage, real Source operation or target upgrade was added.

Actual database checks cover internal plus outsource plans, cancelled-plan exclusion and exact
quantities beyond JS integer precision; filters precede paging and count/page use one snapshot.
An external source-quantity update committed between count and page does not change that page;
the next transaction reads the new zero correctly. Unknown quantity remains null.
Historical alias plans stay on their exact owner (7 does not become part of the effective SO's 30).
Disabled groups with plans and completed/historical queue orders remain readable.
A processing profile without consumed provenance never becomes executable.
History has 52 saved versions; after reading 50 rows and appending version53, the anchored second
page still contains versions2/1. Resource names come from each adopted hash, not renamed masters.

## Executed checks

| Check | Result |
| --- | --- |
| Expanded targeted contract, calculation, actual PG/HTTP, upgrade, identity, sale adjustment, business source and processing batch checks | 115/115, 61465.1851ms; no skip/cancel/fail |
| Project tests | 927/927, 233576.0933ms; no skip/cancel/fail |
| Release-baseline tests | 116/116, 232253.9186ms; no skip/cancel/fail |
| Full TypeScript and Node compilation | passed |
| Targeted and whole-repository ESLint | passed |
| Explicit Server frontend build | passed |
| Client/server/SSR build-info | exact15295, Server Quote/master, session, writable, snapshot |
| Serial Node rebuild then actual compiled app import | passed |
| Independent static review | no blockers after the bounded-directory pagination P2 fix |

The application/CI/test bytes were unchanged between the final115 run and checkpoint15295;
full project/baseline and explicit frontend build ran against that checkpoint. No need to rerun
unchanged tests merely because documentation receives a later hash. The original261 PostgreSQL
suite belongs to backend7eb; it was not rerun as a new local261 result in this slice.

## Failures and limitations preserved

Initial73 and expanded114 working-tree runs also passed; they are not substituted for final115.
The reviewer found that hasMore could promise an offset beyond100000; the actual directory now
fails explicitly and the exact boundary has tests. This was fixed before15295.
An attempted `typecheck:server` invocation found no such script; Node compilation was then run
with the repository's actual `server:build` script. An early compiled-app import could not find
its output while the frontend build was running in parallel; the later serialized rebuild/import
passed. Neither attempt is reported as an initial pass.

The first source/evidence guard against main996 failed on a same-path document revision whose
original new-path evidence had not reached main. The blob hash was valid but the required anchor
was absent. No guard code, base SHA, historical evidence or capability status was changed to hide it.
The original backend feature bytes were restored; a substantial independent
`SERVER_PRODUCTION_PLANNING_READS.md` supplement holds the new contract. It is to be committed and
then independently bound as a new document record; the final guard result is recorded in Gate6
and the current handoff after that operation, not preclaimed here.

This slice has no new browser/pixel/user acceptance or performance/load benchmark. Existing
Quote45pass/44fail/2cancel and31 not started remain a separate gap; older6A browser results retain
their own source. Backend343a and client1391 each have their own successful three CI runs;
new delivery/CI must be independently verified, never borrowed from those heads.

No PR merge/close, deployment, existing port/volume/worktree/Browser retirement, real account or
business DB mutation, new Ainuoke read/binding/activation/scheduling occurred. Persistent62426
remains the Gate1 image8175; 3001/50426/59069 also remain protected. This is a read-layer engineering
slice, not a finished production module or an invitation to use a new scheduling screen.
