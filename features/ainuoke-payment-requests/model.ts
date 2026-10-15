/** Observed 6086941 field catalogue only. Names are not mapping approval. */
export const PAYMENT_FIELD_LABELS = {
  Status:'状态', BillNo:'申请单号', lx:'类型', Brand:'客户品牌', CustomerName:'客户', UserName:'业务员', FSingleName:'理单',
  ExpContractNo:'销售合同号', StyleNo:'业务款号', InsideOrderNo:'工厂款号', SupplierName:'供应商', PurContractNo:'采购合同号', companyname:'公司抬头',
  CnName:'中文品名', actualname:'实际名称', CateGoryName:'面料类型', CnComposition:'规格', CnColor:'颜色', MenFu:'门幅', KeZhong:'克重',
  QtyUnit:'采购单位', Price:'采购单价', Num:'采购数量', OutStoreNum:'本次申请出运分配数量', cgGoodsAmount:'采购金额',
  AdditionalPrice:'额外费用', tzamount:'调整金额', PayAmount:'应付金额', YFAmount:'预付款金额', GoodsAmount:'本次申请付款金额',
  gnsk:'国内收款', gwsk:'国外收款', kpsupplier:'最终开票单位', InvoiceNo:'报关发票号', itemno:'项号', InvoiceDate:'报关日期',
  bgNum:'报关数量', BGAmount:'报关金额', bgQtyUnit:'报关单位', BGName:'报关品名', kpprice:'开票单价', kpNum:'开票数量', kpamount:'开票金额',
  CYDate:'装柜日期', zzrkrq:'最早入库日期', jldate:'经理确认', PayDate:'期望付款日期', fppmrq:'发票票面日期', cwdate:'财务确认', id:'来源行ID',
} as const;
export type PaymentField = keyof typeof PAYMENT_FIELD_LABELS;
export const PAYMENT_SOURCE_FIELDS = Object.freeze(Object.keys(PAYMENT_FIELD_LABELS) as PaymentField[]);
export const PAYMENT_QUANTITIES = ['Num','OutStoreNum','bgNum','kpNum'] as const;
export const PAYMENT_AMOUNTS = ['Price','cgGoodsAmount','AdditionalPrice','tzamount','PayAmount','YFAmount','GoodsAmount','gnsk','gwsk','BGAmount','kpprice','kpamount'] as const;
export type SourceValue = {state:'known';raw:string}|{state:'unknown';reason:'missing'|'null'|'blank'};
export type DecimalValue = SourceValue|{state:'invalid';raw:string;reason:'invalid_decimal'};
export type PaymentResolution = {state:'unknown';reason:'not_verified'}|{state:'known';value:string;evidenceSha256:string[]}
  |{state:'conflict';values:string[];evidenceSha256:string[]};
export type PaymentObservation = {
  observationId:string;
  trace:{reportId:'6086941';sourceFingerprint:string;capturedAt:string;rawResponseSha256:string;page:number;rowIndex:number;
    jsonPath:string;rowContentHash:string;sourceRecordId:SourceValue;stableBusinessEventIdentity:'unverified'};
  sourceFields:Record<PaymentField,SourceValue>;
  quantities:Record<typeof PAYMENT_QUANTITIES[number],DecimalValue>;
  amounts:Record<typeof PAYMENT_AMOUNTS[number],DecimalValue>;
  sourceUnits:{purchase:SourceValue;customs:SourceValue};
  quantityMeanings:{Num:'source_purchase_quantity';OutStoreNum:'application_allocated_material_shipment';bgNum:'source_customs_quantity';kpNum:'source_invoiced_quantity'};
  purchaseContractCurrency:PaymentResolution;amountCurrencies:Record<typeof PAYMENT_AMOUNTS[number],PaymentResolution>;
  allocatedShipmentUnit:PaymentResolution;bankPaymentStatus:'not_inferred';
};
export type PaymentEmptyStatus='not_applicable'|'not_connected'|'not_captured'|'identity_changed'|'stale';
export type PaymentEmptyView={schemaVersion:'order-payment-requests.v1';salesOrderId:string;sourceReportId:'6086941';sourceStatus:PaymentEmptyStatus;rows:[];bankPaymentStatus:'not_inferred'};
export type PaymentObservedView={schemaVersion:'order-payment-requests.v1';salesOrderId:string;sourceReportId:'6086941';sourceStatus:'observed';
  snapshotId:string;generation:number;observedFrom:string;observedThrough:string;evaluatedAt:string;expiresAt:string;
  completeness:{selectedContractComplete:true;reportedRows:number;pagesPerPass:number;allCompanyRecordsRead:false;consistency:'two_pass_observed_rows_not_transaction'};
  rows:PaymentObservation[];aggregation:'none';bankPaymentStatus:'not_inferred';mappingVerified:false;consistency:'as_of_observed_time_not_live'};
export type PaymentReadView=PaymentEmptyView|PaymentObservedView;
export type TimedPaymentView={status:'observed';model:PaymentObservedView;deadline:number}|{status:'empty';model:PaymentEmptyView}|{status:'expired';model:null};
export const PAYMENT_EMPTY_LABELS:Record<PaymentEmptyStatus,string>={
  not_applicable:'加工订单不适用艾诺科货款申请。',
  not_connected:'艾诺科货款申请明细尚未接通。暂不展示对账金额或认定实际付款。',
  not_captured:'此合同尚无已核对的货款申请来源记录。',
  identity_changed:'来源关联已有变化，需要重新核对后读取。',
  stale:'货款申请来源已过期，暂不展示旧明细。',
};
