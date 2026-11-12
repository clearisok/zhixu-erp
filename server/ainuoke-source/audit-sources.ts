/** Real report identifiers from the bridge contracts and existing collectors.
 * 6080183 is an application system ID, not a report. No new source is queried. */
export const SYNC_AUDIT_SOURCES:Record<string,{name:string;targets:string[]}>={
 '6086103':{name:'销售合同',targets:['ainuoke_catalog_entries','ainuoke_sales_order_contract_mirrors','sales_orders','sales_order_source_links']},
 '6086997':{name:'销售合同颜色尺码明细',targets:['ainuoke_sales_order_color_mirrors']},
 '6087105':{name:'成衣分色分码明细',targets:['ainuoke_sales_order_color_mirrors']},
 '6087050':{name:'面辅料申购统计',targets:['ainuoke_material_source_snapshots','ainuoke_material_order_heads']},
 '6087051':{name:'面辅料申购统计-IT',targets:['ainuoke_material_source_snapshots','ainuoke_material_order_heads']},
 '6086405':{name:'面料采购单位核对',targets:['ainuoke_material_source_snapshots']},
 '6086408':{name:'辅料采购单位核对',targets:['ainuoke_material_source_snapshots']},
 '6086875':{name:'面料入库单位核对',targets:['ainuoke_material_source_snapshots']},
 '6086354':{name:'辅料入库单位核对',targets:['ainuoke_material_source_snapshots']},
 '6086941':{name:'货款申请',targets:['ainuoke_payment_snapshots','ainuoke_payment_heads']},
 '6086979':{name:'成衣出货登记',targets:['ainuoke_garment_shipment_snapshots','ainuoke_garment_shipment_heads','ainuoke_garment_shipment_color_matches']},
};
