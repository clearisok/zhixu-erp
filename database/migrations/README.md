# PostgreSQL migrations

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
