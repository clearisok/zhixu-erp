# PostgreSQL migrations

0034 adds empty production calendars, date exceptions, sites, groups and outsource
factories plus immutable actor/request outcomes. Stable resource identity,
forward versions and disable-instead-of-delete guards do not import Browser
defaults, create schedules, grant permissions or touch commercial data. Relations
are explicit calendar -> site -> group. The command service validates current
availability and authorization transactionally; SQL foreign keys retain history.
Only disposable synthetic databases have been authorized for this stage. Normal
startup is still verify-only; existing targets have not been upgraded.

0033 adds an immutable, nonmonetary Quote creation reference to a proven order
context. It is separate from Quote revision data and commercial adoption, shares
the existing actor/request receipt identity, and performs no backfill, grants,
SO creation or price adoption. Only disposable databases are authorized here;
normal startup remains verify-only and real activation is separately gated.

0025 adds independent, per-SO opt-in payment-request observation targets,
immutable snapshots and monotonic/CAS heads. It inserts no target, snapshot,
account or grant. Existing material Source enablement does not enable financial
data. Publication and DB-only reads recheck the trusted binding, effective
attribution, target version/account and current DB permissions. No HTTP writer
or target activation endpoint is provided. Observations are not actual bank
payments; normalization inventories hash their original references without
moving them. Startup stays verify-only. Real migration, targets, collection,
publication and deployment require concrete authorization; see the
[isolated storage task](../../docs/tasks/active/ainuoke-payment-snapshot-storage.md).

Versioned, forward-only server migrations live here and use the filename form
`NNNN_description.sql`. The Node migration runner records SHA-256 checksums in
`schema_migrations`, serializes runners with a PostgreSQL advisory lock, and
applies each file in its own transaction.

Do not edit an applied migration. Add a new forward-fix migration instead.

`0003_sales_order_number_sequence.sql` is the forward-only SalesOrder number allocator. It owns new `SO-00000001`-style values, rejects caller-supplied numbers, keeps them immutable, and intentionally does not recycle sequence gaps after rollback.

`0004_confirmed_commercial_terms.sql` defines the shared current customer-confirmed price and confirmed-labor-price domain. It supports one exact Quote/Revision/PriceVersion context shared by multiple formal SalesOrders and a separate SalesOrder-owned context when no Quote provenance exists. It performs no data backfill.

`0005_quote_foundation.sql` and `0006_quote_number_sequence.sql` own the Quote aggregate persistence graph and Server-only runtime numbering boundary. `0007_quote_master_settings.sql` adds the isolated Quote master/settings authority without importing Browser data; its authoritative DefaultTrimConfig intentionally has no quantity/usage column.

Normal Node startup is verify-only and fails closed on pending migrations. Every real-target activation requires a separately authorized `npm run db:migrate`; existence of a migration file or merged implementation never authorizes activation.

`0009_sales_order_delivery_plans.sql` adds independent collection CAS/irreversible ownership and stable rows/void history, with no backfill. New Ainuoke creation derives a default only with a source date; subsequent date/null recovery preserves its ID only while untouched. Source quantity never reallocates plans. Existing mirrors lacking collection evidence remain uninitialized. This migration was exercised only on disposable PostgreSQL; real activation is not authorized.


`0020_order_attribution_write_guards.sql` adds ordinary-DML effective-owner fences,
immutable Source run/snapshot evidence, exact current snapshot publication, and
post-binding contract/processing identity validation. A transactional epoch row
also rejects a stale REPEATABLE READ writer after attribution changes. Historical
null scope/generation rows are preserved without backfill. This has only synthetic
disposable-PG validation, not real-target activation or old-binary compatibility.

`0021_order_command_control.sql` adds an operator-owned, versioned pause for new
Server SO, commercial adoption and attribution commands, with immutable transition
history. Ordinary-DML guards hold a shared control-row lock through COMMIT; a pause
waits for in-flight commands. No HTTP mutator or real activation is authorized.
Existing reads, preparations and bound Source refresh remain separate capabilities.

`0023_order_preparation_adoption.sql` adds immutable proposed Quote identities and
preparation adoption receipts plus an optional current preparation reference.
It does not create/backfill orders, profiles, quantities, prices or accounts.
Ordinary insert/reference fences, effective-owner and pause gates integrate with
normalization; old proof hashes are not rewritten. Synthetic PG validation only;
real activation and old binary compatibility remain separately gated.

0028_order_color_commercial_versions.sql：D145商业版本颜色明细扩展，保留0015/0016/0027；旧记录不回填。只在一次性合成数据库演练，真实迁移须另行授权。

0035_production_schedule_plans.sql：D147新目标的计划层，不是完成量或关账。
直接引用有效SalesOrder及既有稳定颜色身份；独立订单/队列CAS、不可变资源事实、
逐次计划版本、actor/request回执及成功命令订单桥接。来源/颜色/交期子集服从物理
父订单冻结，来源持有单与当前有效单仍保留各自历史。没有新权限、默认资料、
价格、币种、实际执行、交期回写或旧数据导入；未知人工日期的工作日计数保持null。
应用正常启动仍只验证迁移；当前只授权一次性合成数据库，不能据文件存在激活旧库。

0036_production_execution_facts.sql：D151的独立实际执行头与逐次不可变版本。引用原物理SO、
Assignment及当时计划版本/资源归属；不改0035计划状态，不回填完成量、授予权限或计算金额。
已有执行后执行方、颜色及采用资源不可搬移，更正为零也不解锁；取消计划保留产出。
逐事件精确历史、明确更正原因和有效归属保护与原命令回执共用。仅一次性合成PG验收；
独立技术epoch只为既有计划初始化0，后续执行推进，阻止旧RR快照漏看首次执行；不补造产出。
正常启动仍verify-only，不因代码、CI或文件存在升级当前体验或真实库。
