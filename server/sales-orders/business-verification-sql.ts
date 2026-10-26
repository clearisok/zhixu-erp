import { sourceOwnerSql } from "./effective-order-sql.js";

// Uses the same `so` / effectiveOrderJoins aliases as the command validator.
// Names, prices and identity-profile labels alone never establish a contract.
export function verifiedOrderBusinessSql(attributed: boolean, processing = true): string {
  const effectiveContract = attributed
    ? "(attribution.effective_order_id=so.id AND attribution.attribution_change_id IS NOT NULL)"
    : "false";
  return `CASE
    WHEN (so.creation_source='ainuoke' OR ${effectiveContract}) AND
      (SELECT count(*) FROM ainuoke_sales_order_contract_mirrors trusted_mirror
       JOIN sales_order_source_links trusted_link ON trusted_link.sales_order_id=trusted_mirror.sales_order_id
         AND trusted_link.external_id=trusted_mirror.source_id AND trusted_link.sales_contract_no=trusted_mirror.sales_contract_no
       WHERE trusted_mirror.sales_order_id=${sourceOwnerSql(attributed)}
         AND trusted_link.source_system='ainuoke' AND trusted_link.source_entity_type='sales_contract')=1
      THEN 'ainuoke_contract'
    ${processing ? `WHEN so.creation_source='quote' AND EXISTS
      (SELECT 1 FROM sales_order_identity_profiles profile WHERE profile.sales_order_id=so.id AND profile.business_type='processing')
      AND (SELECT count(*) FROM processing_order_batch_consumptions consumption
        JOIN processing_order_batches batch ON batch.id=consumption.batch_id
        WHERE consumption.sales_order_id=so.id AND batch.state='consumed'
          AND so.source_quote_id=batch.quote_id AND so.source_revision_id=batch.revision_id AND so.source_price_version_id=batch.price_version_id)=1
      THEN 'processing'` : ""}
    ELSE 'unclassified' END`;
}
