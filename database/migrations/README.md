# PostgreSQL migrations

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
