# Populated Server recovery — engineering evidence

2026-10-23 (Asia/Shanghai). Main independently read as
`996dfedc12da3527343cd3ff2aa5eea35497e10e`. Root was the sole writer;
the existing release-safety reviewer performed read-only independent review.
This supplements the original Quote/PNG-only8/8; it does not replace its scope.

## Exact identities

- Existing branch: `chore/server-current-image-0042`; clean phase input
  `94a1767b4743e1c21a961c5232929c4600cd34aa`.
- Executed test driver: clean `353381ddb0c800a1c64fa32202c587ca3a350f08`.
  Native fixture blob `05882c8301b07c36c16b29fdd44f283ee279719e`, guards blob
  `379e0eb0992d5e5a23b89df2d9eddbcc566e66c3`, integration-driver blob
  `ed86fa2fc32df2d454a6a10ab4541715e79c2211`.
- Original compiled application source:
  `0c7377d99a51bcab6589217edff69a54e7b2ee21`;
  image `sha256:4a489d9a8fd7a78acf5fc3fb9c88855c24637b9c09e56c932a280461e0d47e92`;
  build `server-candidate-0c7377d9-20261023` / `2026-10-22T16:06:54.405Z`.
  No image rebuild or new application/TS code mount.
- Child Docker endpoint pinned to
  `npipe:////./pipe/dockerDesktopLinuxEngine`; remote/context conflicts and TLS
  overrides rejected. Actual app/gateway image IDs, container/project/service,
  DB volume and exact-target identity were checked. Native code rejects
  `DATABASE_URL` overrides before importing config or opening a Pool.
- Successful owned projects: `zhixu-quote-trial-it-0f6ed1513b` and
  `zhixu-quote-trial-recovery-0f6ed1513b`. Both were newly prepared; success
  cleanup removed only those two projects' containers, networks, volumes and
  generated private fixtures/backup. No existing environment was targeted.

## Actual verification

The opt-in pinned-image rehearsal passed **9/9**, zero failure/skip/cancel,
`246597.9241ms`. The original Quote-only stage still asserted zero SO before
synthetic domains were created using the image's existing compiled services.
Restart and cold container recreation preserved original Quote/PNG/admin facts.
The existing maintenance, exact-target dump/restore, writer freeze, double
confirmation and object integrity/collision guards remained unchanged.

After maintenance and all native pools closed, every public table's directory,
row count and deterministically ordered SHA256 was recorded. Immediately after
restoration to the independent empty target, **before** objects/app startup,
login or permission synchronization, all **106 tables and5 sequences** matched.
Sequence comparison includes type, start/min/max/increment/cache/cycle,
last_value and is_called; the unused normalization-review sequence remained
uncalled. Of106 tables,68 were populated and38 were empty. Nonempty counts are
not claims that68 independent business capabilities were accepted; empty tables
are explicitly `empty-preserved-not-exercised`.

| Exercised domain | Before-dump rows and native readback |
| --- | --- |
| Identity/colors | 2 SO: one synthetic contract and one processing batch;2 stable color identities; original contract/source link preserved |
| DeliveryPlan | 3 plan rows (including voided history),2 exact request receipts; original receipt remains older than current set |
| Commercial | 2 immutable commercial versions,2 color lines; later quote CCT125 leaves adopted blue SO price120; red remains its own scheme |
| Processing | 1 batch/consumption; exact original consume request replays same SO; after recovery a distinct real batch identity creates a third synthetic SO |
| Production | 3 assignments,4 plan-history rows,6 command receipts; internal original60 cancelled after25 completed, remainder35 separately assigned, red40 outsourced |
| Execution | 1 current execution and2 history rows; original25 retains original group/assignment; after recovery the restored remainder35 assignment records5 without moving original25 |
| Material | 1 stored source snapshot; original reader returns all4 purchase/inbound/shipment/outbound streams and excludes protected sentinel |
| Payment6086941 | 1 immutable snapshot/head; original reader remains observed with1 row after recovery; no inference of bank payment |
| Garment6086979 | 2 observation snapshots and2 stable blue matches; both original publications/history readable; freshness legitimately changes fresh→stale |
| Audit | 26 append-only operation-log rows preserved by whole-table comparison |

All DTOs and original receipts included in the saved business proof matched.
The payment reader is checked separately for observed/stale status, the original
snapshotId and row count; full payment DTO deep equality is not claimed. Its
stored input/payload is covered by the independent whole-table fingerprints.
Freshness/evaluatedAt are deliberately evaluated using the real current clock;
their original observed/expires timestamps remain unchanged. No retimestamping
or fake clock was used. Native service evidence is **not HTTP/UI activation**:
the trial Compose does not enable the garment snapshot HTTP reader.

Local ignored receipt `outputs/server-domain-recovery-20261023/run-0f6ed1513b.json`
SHA256 `c4fd5744ffbc77dc4c73e66798759775f2d869e1b060697884a443e8020f0226`;
business read proof SHA256
`4bff5a29536735ddfe84f947c1518d3e85ad182070dbd84013e212c61c061ea8`.
This binds the original driver/image facts and detailed table/sequence matrix.
The receipt and raw private fixture/configuration files are not committed.

## Failed attempts and safe local recovery

Earlier attempts are retained in Git/ignored logs, not relabelled PASS:

| Driver | Observed result | Resolution |
| --- | --- | --- |
| b9d1f585 | 4pass/2fail,78287.808ms; synthetic CCT attempted before required formal association | Reordered fixture: adopt confirmed Quote first, then CCT; no business-rule change |
| 16e8976c | 4pass/2fail,78205.2332ms; synthetic Quote missing styleName | Completed fixture and used original confirmation validator; no application change |
| 353381dd first attempt | 1pass/2fail,43515.0495ms; start failed before app/gateway creation | Explicit local diagnostic confirmed default Docker address-pool exhaustion at32 networks |

Only these three newly created, stopped, ownership-verified failed projects
(`2ad6e5bd60`, `5c985d2309`, `2986cd3055`) received `compose down` **without**
`--volumes`. All12 owned data/object/secret volumes and private config bytes were
independently rechecked as retained. Existing projects, shared address pools,
Docker/Git/proxy/TLS configuration were not changed. The private operational
receipt is `outputs/server-domain-recovery-20261023/owned-network-recovery.json`.
Future failure cleanup still preserves owned evidence; never run global prune.

## Quality, review and delivery boundary

- 7/7 pure guard/negative/comparison tests passed; scoped ESLint and JS syntax passed.
- Full release-baseline suite:116/116, zero skip/failure,358212.8084ms.
- Exact-main source guard at16e passed:11 pages/58 capabilities/88 inherited UI
  paths. This phase changes no UI/application/schema/production-ops behavior.
  Final documentation head must receive its own exact-main check.
- Independent static review at353381dd and final actual-result/document review
  found no remaining P1/P2 after the DATABASE_URL/order fixes and two wording
  corrections. The reviewer read the receipt/logs without Docker, network or file
  mutations. Remote delivery and new CI are separately pending at this freeze.

The current phase's image/source result does not inherit a previous branch's CI.
No duplicate cumulative business PR is created. #126 exact0be is already
delivered/CI-green and awaits its separate human merge answer; #127 forward
integration waits for that actual main. No merge/close/deploy/cutover, real
account/business DB/credential use, upstream HTTP, Source activation/scheduler,
Browser import or Server closing is performed. All existing entries remain
protected. The new fixed Source quota, coverage UI and closing decisions remain
pending; full G1–G5 Goal remains active.
