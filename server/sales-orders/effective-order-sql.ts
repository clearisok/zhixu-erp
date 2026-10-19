/** Fixed SQL only; current source ownership is a read projection, never a rebinding. */
export function effectiveOrderJoins(attributed: boolean): string {
  if (!attributed) return '';
  return `JOIN sales_order_effective_identities attribution ON attribution.original_order_id=so.id
    LEFT JOIN LATERAL (
      SELECT candidate.original_order_id AS sales_order_id
      FROM sales_order_effective_identities candidate
      JOIN sales_order_source_links trusted_link ON trusted_link.sales_order_id=candidate.original_order_id
        AND trusted_link.source_system='ainuoke' AND trusted_link.source_entity_type='sales_contract'
      JOIN ainuoke_sales_order_contract_mirrors trusted_mirror ON trusted_mirror.sales_order_id=trusted_link.sales_order_id
        AND trusted_mirror.source_id=trusted_link.external_id AND trusted_mirror.sales_contract_no=trusted_link.sales_contract_no
      WHERE (attribution.effective_order_id=so.id AND candidate.effective_order_id=so.id)
         OR (attribution.effective_order_id<>so.id AND candidate.original_order_id=so.id)
      ORDER BY (candidate.original_order_id=so.id) DESC,candidate.original_order_id LIMIT 1
    ) source_owner ON true`;
}
export function sourceOwnerSql(attributed: boolean): string {
  return attributed ? 'COALESCE(source_owner.sales_order_id,so.id)' : 'so.id';
}
