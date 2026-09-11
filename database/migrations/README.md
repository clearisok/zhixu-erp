# PostgreSQL migrations

Versioned, forward-only server migrations live here and use the filename form
`NNNN_description.sql`. The Node migration runner records SHA-256 checksums in
`schema_migrations`, serializes runners with a PostgreSQL advisory lock, and
applies each file in its own transaction.

Do not edit an applied migration. Add a new forward-fix migration instead.

`0003_sales_order_number_sequence.sql` is the forward-only SalesOrder number allocator. It owns new `SO-00000001`-style values, rejects caller-supplied numbers, keeps them immutable, and intentionally does not recycle sequence gaps after rollback.
