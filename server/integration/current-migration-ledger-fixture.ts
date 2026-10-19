// Explicitly reviewed test ledger, never discovered from the production runner.
// Adding a migration requires updating this one list; all current-schema upgrade
// assertions still compare exact filenames/order and retain their data checks.
export const CURRENT_MIGRATION_FILES = Object.freeze([
  '0001_trusted_auth_rbac_operation_logs.sql',
  '0002_sales_order_foundation.sql',
  '0003_sales_order_number_sequence.sql',
  '0004_confirmed_commercial_terms.sql',
  '0005_quote_foundation.sql',
  '0006_quote_number_sequence.sql',
  '0007_quote_master_settings.sql',
  '0008_quote_attachments.sql',
  '0009_sales_order_delivery_plans.sql',
  '0010_quote_creation_receipts.sql',
  '0011_quote_creation_defaults.sql',
  '0012_ainuoke_server_source.sql',
  '0014_order_identity.sql',
  '0015_order_commercial_versions.sql',
  '0016_processing_order_batches.sql',
  '0017_order_normalization_cases.sql',
  '0018_order_effective_attribution.sql',
  '0019_order_normalization_reviews.sql',
  '0020_order_attribution_write_guards.sql',
  '0021_order_command_control.sql',
  '0022_source_history_context.sql',
  '0023_order_preparation_adoption.sql',
  '0024_material_progress_settings.sql',
  '0025_ainuoke_payment_snapshots.sql',
  '0026_ainuoke_payment_operator_commands.sql',
  '0027_order_business_source_snapshots.sql',
  '0028_order_color_commercial_versions.sql',
  '0029_order_sale_adjustment_operations.sql',
  '0030_processing_quote_push_receipts.sql',
  '0031_managed_roles.sql',
]);

export const migrationFilesAfter = (version: number) =>
  CURRENT_MIGRATION_FILES.filter(filename => Number(filename.slice(0, 4)) > version);
