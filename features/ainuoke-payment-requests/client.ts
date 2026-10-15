import { orderMaterialNavigation } from '../ainuoke-material-progress/order-navigation';
import { PAYMENT_SOURCE_FIELDS, PAYMENT_QUANTITIES, PAYMENT_AMOUNTS, PAYMENT_EMPTY_LABELS,
  type SourceValue, type DecimalValue, type PaymentResolution, type PaymentReadView, type PaymentObservation, type TimedPaymentView } from './model';

export const PAYMENT_RESPONSE_MAX_BYTES = 32 * 1024 * 1024;
export class PaymentReadError extends Error {
  constructor(readonly code: 'invalid_response'|'too_large'|'not_connected'|'forbidden'|'authentication_required'|'order_unavailable'|'unavailable'|'clock_unavailable') {
    super(code); this.name = 'PaymentReadError';
  }
}
type Obj = Record<string, unknown>;
function invalid(): never { throw new PaymentReadError('invalid_response'); }
function object(input: unknown): Obj {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  return input as Obj;
}
function exact(input: Obj, keys: readonly string[]) {
  if (Object.keys(input).sort().join(',') !== [...keys].sort().join(',')) invalid();
}
function text(input: unknown, max = 2048): input is string { return typeof input === 'string' && input.length > 0 && input.length <= max; }
const sha = (input: unknown): input is string => typeof input === 'string' && /^[a-f0-9]{64}$/u.test(input);
function stamp(input: unknown): number {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(input)) invalid();
  const time = Date.parse(input); if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== input.slice(0,10)) invalid(); return time;
}
function decimal(input: string) {
  const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE]([+-]?[0-9]+))?$/u.exec(input.trim());
  return input.trim().length <= 256 && Boolean(match) && Math.abs(Number(match?.[1] ?? 0)) <= 1000;
}
function raw(input: unknown, numeric = false): DecimalValue {
  const value = object(input);
  if (value.state === 'known') {
    exact(value,['state','raw']); if (!text(value.raw) || !value.raw.trim() || numeric && !decimal(value.raw)) invalid();
    return {state:'known',raw:value.raw};
  }
  if (value.state === 'unknown') {
    exact(value,['state','reason']); if (!['missing','null','blank'].includes(value.reason as string)) invalid();
    return {state:'unknown',reason:value.reason as 'missing'|'null'|'blank'};
  }
  if (numeric && value.state === 'invalid') {
    exact(value,['state','raw','reason']); if (!text(value.raw) || value.reason !== 'invalid_decimal' || decimal(value.raw)) invalid();
    return {state:'invalid',raw:value.raw,reason:'invalid_decimal'};
  }
  return invalid();
}
function map<K extends string, T>(input: unknown, keys: readonly K[], read: (value: unknown) => T): Record<K,T> {
  const value = object(input); exact(value,keys); return Object.fromEntries(keys.map(key=>[key,read(value[key])])) as Record<K,T>;
}
const same = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function resolution(input: unknown, currency = false): PaymentResolution {
  const value = object(input);
  if (value.state === 'unknown') { exact(value,['state','reason']); if(value.reason !== 'not_verified')invalid(); return {state:'unknown',reason:'not_verified'}; }
  const valid = (item: unknown): item is string => text(item,30) && item === item.trim()
    && !/[\u0000-\u001f\u007f]/u.test(item) && (!currency || /^[A-Z]{3}$/u.test(item));
  if (!Array.isArray(value.evidenceSha256) || value.evidenceSha256.length < 1 || value.evidenceSha256.length > 201 || value.evidenceSha256.some(item=>!sha(item))) invalid();
  if (value.state === 'known') { exact(value,['state','value','evidenceSha256']); if(!valid(value.value))invalid(); return {state:'known',value:value.value,evidenceSha256:value.evidenceSha256 as string[]}; }
  exact(value,['state','values','evidenceSha256']);
  if (value.state !== 'conflict' || !Array.isArray(value.values) || value.values.length < 2 || value.values.length > 201
    || value.values.some(item=>!valid(item)) || new Set(value.values).size !== value.values.length) invalid();
  return {state:'conflict',values:value.values as string[],evidenceSha256:value.evidenceSha256 as string[]};
}
function observation(input: unknown, index: number, contract: string, from: number, through: number): PaymentObservation {
  const row = object(input);
  exact(row,['observationId','trace','sourceFields','quantities','amounts','sourceUnits','quantityMeanings','purchaseContractCurrency','amountCurrencies','allocatedShipmentUnit','bankPaymentStatus']);
  const fields = map(row.sourceFields,PAYMENT_SOURCE_FIELDS,value=>raw(value) as SourceValue);
  if (fields.ExpContractNo.state !== 'known' || fields.ExpContractNo.raw !== contract || row.bankPaymentStatus !== 'not_inferred') invalid();
  const trace = object(row.trace), rowIndex = index % 100, page = Math.floor(index/100)+1;
  exact(trace,['reportId','sourceFingerprint','capturedAt','rawResponseSha256','page','rowIndex','jsonPath','rowContentHash','sourceRecordId','stableBusinessEventIdentity']);
  if (trace.reportId !== '6086941' || !sha(trace.sourceFingerprint) || !sha(trace.rawResponseSha256) || !sha(trace.rowContentHash)
    || trace.page !== page || trace.rowIndex !== rowIndex || trace.jsonPath !== 'dataList.rows['+rowIndex+']'
    || trace.stableBusinessEventIdentity !== 'unverified' || !same(raw(trace.sourceRecordId),fields.id)) invalid();
  const captured = stamp(trace.capturedAt); if(captured < from || captured > through)invalid();
  if (typeof row.observationId !== 'string' || !new RegExp('^6086941:[a-f0-9]{64}:'+rowIndex+'$','u').test(row.observationId)) invalid();
  const quantities = map(row.quantities,PAYMENT_QUANTITIES,value=>raw(value,true));
  const amounts = map(row.amounts,PAYMENT_AMOUNTS,value=>raw(value,true));
  for(const key of [...PAYMENT_QUANTITIES,...PAYMENT_AMOUNTS]) {
    const value = key in quantities ? quantities[key as keyof typeof quantities] : amounts[key as keyof typeof amounts];
    if(value.state === 'invalid' ? fields[key].state !== 'known' || (fields[key] as {raw:string}).raw !== value.raw : !same(value,fields[key]))invalid();
  }
  const units = map(row.sourceUnits,['purchase','customs'],value=>raw(value) as SourceValue);
  if(!same(units.purchase,fields.QtyUnit) || !same(units.customs,fields.bgQtyUnit))invalid();
  const meanings = {Num:'source_purchase_quantity',OutStoreNum:'application_allocated_material_shipment',bgNum:'source_customs_quantity',kpNum:'source_invoiced_quantity'};
  const actualMeanings = object(row.quantityMeanings);exact(actualMeanings,Object.keys(meanings));
  if(Object.entries(meanings).some(([key,value])=>actualMeanings[key]!==value))invalid();
  resolution(row.purchaseContractCurrency,true);map(row.amountCurrencies,PAYMENT_AMOUNTS,value=>resolution(value,true));resolution(row.allocatedShipmentUnit);
  return row as PaymentObservation;
}

/** A response validator, not an authorization/mapping or cryptographic proof. */
export function parsePaymentView(input: unknown, id: string, contract: string): PaymentReadView {
  const value = object(input);
  if (value.schemaVersion !== 'order-payment-requests.v1' || value.salesOrderId !== id || value.sourceReportId !== '6086941' || value.bankPaymentStatus !== 'not_inferred') invalid();
  if(value.sourceStatus !== 'observed') {
    exact(value,['schemaVersion','salesOrderId','sourceReportId','sourceStatus','rows','bankPaymentStatus']);
    if(typeof value.sourceStatus !== 'string' || !Object.hasOwn(PAYMENT_EMPTY_LABELS,value.sourceStatus) || !Array.isArray(value.rows) || value.rows.length)invalid();
    return value as PaymentReadView;
  }
  exact(value,['schemaVersion','salesOrderId','sourceReportId','sourceStatus','snapshotId','generation','observedFrom','observedThrough','evaluatedAt','expiresAt','completeness','rows','aggregation','bankPaymentStatus','mappingVerified','consistency']);
  if(!sha(value.snapshotId) || !Number.isSafeInteger(value.generation) || Number(value.generation)<1 || value.aggregation!=='none'
    || value.mappingVerified!==false || value.consistency!=='as_of_observed_time_not_live' || !Array.isArray(value.rows) || value.rows.length<1 || value.rows.length>200)invalid();
  const from=stamp(value.observedFrom),through=stamp(value.observedThrough),evaluated=stamp(value.evaluatedAt),expires=stamp(value.expiresAt);
  if(through<from || evaluated<through || evaluated>=expires || expires-from!==600000)invalid();
  const completeness=object(value.completeness);exact(completeness,['selectedContractComplete','reportedRows','pagesPerPass','allCompanyRecordsRead','consistency']);
  if(completeness.selectedContractComplete!==true || completeness.reportedRows!==value.rows.length || completeness.pagesPerPass!==Math.ceil(value.rows.length/100)
    || completeness.allCompanyRecordsRead!==false || completeness.consistency!=='two_pass_observed_rows_not_transaction')invalid();
  const rows=value.rows.map((row,i)=>observation(row,i,contract,from,through));
  if(new Set(rows.map(row=>row.observationId)).size!==rows.length || new Set(rows.map(row=>row.trace.sourceFingerprint)).size!==1)invalid();
  return value as PaymentReadView;
}
async function boundedJson(response: Response) {
  if(!response.body)invalid();
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try {
    for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
      if(size>PAYMENT_RESPONSE_MAX_BYTES){await reader.cancel();throw new PaymentReadError('too_large');}parts.push(chunk.value);}
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{return invalid();}
}
export function createPaymentRequestClient(fetcher: typeof fetch = globalThis.fetch, now:()=>number = ()=>performance.now()) {
  return async (id:string,contract:string,signal?:AbortSignal):Promise<TimedPaymentView> => {
    const route=orderMaterialNavigation(id);
    if(!route || !text(contract,80) || contract!==contract.trim() || /[\u0000-\u001f\u007f]/u.test(contract))invalid();
    const started=now();if(!Number.isFinite(started)||started<0)throw new PaymentReadError('clock_unavailable');
    const response=await fetcher('/api/v1/sales-orders/'+route.salesOrderId+'/payment-requests',{
      method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json'},
    });
    const body=await boundedJson(response);
    if(!response.ok){
      const error=body&&typeof body==='object'&&!Array.isArray(body)?(body as Obj).error:undefined;
      const code=error&&typeof error==='object'&&!Array.isArray(error)?(error as Obj).code:undefined;
      throw new PaymentReadError(response.status===401?'authentication_required':response.status===403?'forbidden':response.status===404?'order_unavailable'
        :response.status===503&&['payment_read_not_connected','payment_source_not_connected'].includes(code as string)?'not_connected':'unavailable');
    }
    const model=parsePaymentView(body,route.salesOrderId,contract),received=now();
    if(!Number.isFinite(received)||received<started)throw new PaymentReadError('clock_unavailable');
    if(model.sourceStatus!=='observed')return {status:'empty',model};
    // Subtract the entire fetch/parse latency. Browser wall-clock skew cannot
    // extend the backend's oldest-page lifetime; no request retries or caching.
    const deadline=started+(Date.parse(model.expiresAt)-Date.parse(model.evaluatedAt));
    return deadline<=received?{status:'expired',model:null}:{status:'observed',model,deadline};
  };
}
export const readPaymentRequests = (id:string,contract:string,signal?:AbortSignal) => createPaymentRequestClient()(id,contract,signal);
