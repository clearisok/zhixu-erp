/** Source-owned plans follow the latest catalogue date. Explicit manual plans
 * use their last active delivery; an empty manual plan is unknown, not fallback. */
export function effectiveSyncDeliverySql(alias='e') {
 if(!/^[a-z]+$/.test(alias))throw Error('sync_sql_alias_invalid');
 return `CASE WHEN EXISTS(SELECT 1 FROM sales_order_source_links dl
   JOIN sales_order_delivery_plan_sets ds ON ds.sales_order_id=dl.sales_order_id AND ds.ownership='user_managed'
   WHERE dl.source_system='ainuoke' AND dl.source_entity_type='sales_contract'
   AND dl.external_id=${alias}.source_id AND dl.sales_contract_no=${alias}.sales_contract_no)
  THEN (SELECT to_char(max(dp.delivery_date),'YYYY-MM-DD') FROM sales_order_source_links dl
    JOIN sales_order_delivery_plans dp ON dp.sales_order_id=dl.sales_order_id AND dp.voided_at IS NULL
    WHERE dl.source_system='ainuoke' AND dl.source_entity_type='sales_contract'
    AND dl.external_id=${alias}.source_id AND dl.sales_contract_no=${alias}.sales_contract_no)
  ELSE ${alias}.delivery_date END`;
}
