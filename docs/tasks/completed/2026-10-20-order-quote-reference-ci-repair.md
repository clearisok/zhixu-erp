# Gate5 creation-reference inventory — CI correction evidence

2026-10-20. Base remains independently verified main
`996dfedc12da3527343cd3ff2aa5eea35497e10e`. Repair source is
`aaf12af31b5ba29a80fa98db9114a287f905c69a` on
`codex/server-source-quote-create`. Original scoped engineering evidence and
source54 builds remain at `2026-10-20-order-quote-context-engineering.md`; they
are not rewritten to conceal the first remote failure.

## Confirmed remote result, not a transport guess

The previous exact `c6ca37b2f4b2ea9dc7487647b925b0ffcef98768` was delivered by
one normal push and independently verified through GitHub API. Baseline
[39402680845](https://github.com/clearisok/zhixu-erp/actions/runs/39402680845) and
Team [39402675944](https://github.com/clearisok/zhixu-erp/actions/runs/39402675944)
completed/success. Source
[39402671214](https://github.com/clearisok/zhixu-erp/actions/runs/39402671214)
completed/failure: the normalization-preview group was 36 pass/3 fail including
its parent. New 0033 FK `quote_creation_order_contexts.sales_order_id` was absent
from the declared reference catalog. The scanner conservatively reported an
unknown reference. It did not authorize normalization or corrupt any identity.
That target is not described as three-CI-green.

## Minimal correction and retained boundaries

The existing fixed catalog now includes
`quote_creation_order_contexts / sales_order_id / quote_id`; pre0033 rehearsals
may omit that table. Unknown FKs still block. Finite previews expose only
counts/IDs; the existing full collector iterates the same catalog and digests
every bounded row's full JSON bytes, including snapshot/hash, with its existing
row/byte limits and optional `FOR SHARE`. It does not expose these payloads.

The two existing Quote creation transactions already take the shared effective
attribution lock. Controlled normalization takes the same key exclusively.
No lock bypass, order relocation, execution-count inference, new public write
entry or schema change was added. Immutable creation references remain attached
to the original SO. The feature note preserves all older dated history.

## Actual local checks at the repair source

- Targeted real creation/reference preview: **26/26**, 16506 ms. The preview hash
  is compared before/after creation with source quantity/date unchanged; the
  saved row's original SO/Quote ID and nonexecution classification are explicit.
- Full normalization group: **40/40**, 21926 ms, including preupgrade behavior,
  unknown-FK rejection and retired public-write protection.
- Effective attribution group: **45/45**, 19404 ms, including immutable identity
  fences, execution history and ownership serialization.
- Full evidence/execution group: **33/33**, 19086 ms. The new positive case uses
  the real Quote creation service and directly compares this table's count,
  full-row fingerprint and whole evidence hash, including the locked read path;
  original order rows remain byte-equivalent and no snapshot payload is exposed.
- Final full typecheck, Node compilation and four changed-source/test-file lint
  passed. Earlier 26/26 in 15769 ms and 32/32 full evidence in 18878 ms remain
  earlier stages, not extra unique cases.

Only one production TS file changed after source54, plus three tests and docs.
Quote writer, frontend, authority configuration, migrations and dependencies are
unchanged. The source54 Browser/Server builds, new8/current40/P6 13 browser checks,
927 project and261 PostgreSQL results remain historical scoped checks; no rebuild
or full rerun is invented for this correction. The old long browser45/44/2 result
and unexecuted later cases are still an explicit acceptance-maintenance gap.

The explicit baseline command and exact-main guard for the final repair are
recorded in the active Gate5 receipt after proof binding. New remote delivery and
three CI must be checked against their new exact target, not reused from c6.
Read-only review confirmed catalog/full-row coverage, shared/exclusive locks and
the isolated preview hash sampling. No automatic merge/close, persistent-target
upgrade, deployment, real account/DB or Ainuoke operation occurred. Gate6 remains
only the independent documentation baseline184b110e, outside this repair branch.
