import type { Pool, PoolClient } from "pg";
import { supportsEffectiveAttribution, requireEffectiveOrderForWrite, lockEffectiveAttribution } from "./effective-attribution.js";
import { effectiveOrderJoins, sourceOwnerSql } from "./effective-order-sql.js";
import type {
  AinuokeColorMirrorInput,
  AinuokeContractMirrorInput,
  SalesOrderCreationSource,
  SalesOrderDetailReadModel,
  SalesOrderLifecycleState,
  SalesOrderReadModel,
  SalesOrderRecord,
  SalesOrderSourceLink,
} from "./model.js";

export type Queryable = Pick<Pool | PoolClient, "query">;

type SalesOrderRow = {
  id: string;
  order_no: string;
  creation_source: SalesOrderCreationSource;
  lifecycle_state: SalesOrderLifecycleState;
  source_order_id: string | null;
  source_quote_id: string | null;
  source_revision_id: string | null;
  source_price_version_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type SourceLinkRow = {
  id: string;
  sales_order_id: string;
  source_system: string;
  source_entity_type: string;
  external_id: string;
  sales_contract_no: string | null;
  inside_order_no: string | null;
  created_at: Date;
  updated_at: Date;
};

type ReadModelRow = SalesOrderRow & {
  effective_order_id: string;
  attribution_change_id: string|null;
  attribution_version: number;
  source_owner_order_id: string;
  colors: SalesOrderDetailReadModel["colors"];
  business_type: "ainuoke_contract"|"processing"|"unclassified";
  owner_name:string|null;
  business_source: "quote"|"reorder"|null;
  sales_contract_no: string | null;
  inside_order_no: string | null;
  lifecycle_status_raw: string | null;
  contract_date: string | Date | null;
  contract_delivery_date: string | Date | null;
  style_no: string | null;
  company_name_snapshot: string | null;
  customer_name_snapshot: string | null;
  brand_name_snapshot: string | null;
  quantity: string | null;
  color_count: string | number;
  zero_color_count: number;
  pending_color_count: number;
};

export type SalesOrderListOptions = {
  limit: number;
  offset: number;
  search?: string;
  includeHistorical?: boolean;
  lifecycleState?: SalesOrderLifecycleState;
  creationSource?: SalesOrderCreationSource;
  sortBy?: "orderNo" | "updatedAt" | "contractDeliveryDate" | "salesContractNo";
  sortDirection?: "asc" | "desc";
};

export type SalesOrderListResult = {
  items: SalesOrderReadModel[];
  total: number;
};

function requiredText(value: string, label: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized || null;
}

function isoDate(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function mapSalesOrder(row: SalesOrderRow): SalesOrderRecord {
  return {
    id: row.id,
    orderNo: row.order_no,
    creationSource: row.creation_source,
    lifecycleState: row.lifecycle_state,
    sourceOrderId: row.source_order_id,
    sourceQuoteId: row.source_quote_id,
    sourceRevisionId: row.source_revision_id,
    sourcePriceVersionId: row.source_price_version_id,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSourceLink(row: SourceLinkRow): SalesOrderSourceLink {
  return {
    id: row.id,
    salesOrderId: row.sales_order_id,
    sourceSystem: row.source_system,
    sourceEntityType: row.source_entity_type,
    externalId: row.external_id,
    salesContractNo: row.sales_contract_no,
    insideOrderNo: row.inside_order_no,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapReadModel(row: ReadModelRow): SalesOrderReadModel {
  return {
    id: row.id,
    version: row.version,
    attribution: {originalOrderId:row.id,effectiveOrderId:row.effective_order_id,attributionChangeId:row.attribution_change_id,attributionVersion:row.attribution_version,historicalDuplicate:row.id!==row.effective_order_id},
    sourceOwnerOrderId:row.source_owner_order_id,
    orderNo: row.order_no,
    creationSource: row.creation_source,
    lifecycleState: row.lifecycle_state,
    salesContractNo: row.sales_contract_no,
    insideOrderNo: row.inside_order_no,
    sourceLifecycleStatus: row.lifecycle_status_raw ?? "",
    businessType:row.business_type,
    businessSource:row.business_source??null,
    styleNo: row.style_no ?? "",
    companyName: row.company_name_snapshot ?? "",
    customerName: row.customer_name_snapshot ?? "",
    brandName: row.brand_name_snapshot ?? "",
    quantity: row.quantity === null ? null : Number(row.quantity),
    colorCount: Number(row.color_count),
    alerts: Number(row.zero_color_count) > 0 ? [{ code: "color_quantity_zero", count: Number(row.zero_color_count), pendingCount: Number(row.pending_color_count) }] : [],
    contractDate: isoDate(row.contract_date),
    contractDeliveryDate: isoDate(row.contract_delivery_date),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const PROCESSING_READ_JOINS = `LEFT JOIN processing_order_batch_consumptions processing_consumption ON processing_consumption.sales_order_id=so.id
 LEFT JOIN processing_order_batches processing_batch ON processing_batch.id=processing_consumption.batch_id AND processing_batch.state='consumed'
 AND so.creation_source='quote' AND so.source_quote_id=processing_batch.quote_id AND so.source_revision_id=processing_batch.revision_id AND so.source_price_version_id=processing_batch.price_version_id`;
function readModelFrom(includeIdentity:boolean,attributed:boolean):string {
 const owner=sourceOwnerSql(attributed);
 return `FROM sales_orders so ${effectiveOrderJoins(attributed)}
 LEFT JOIN sales_order_source_links sl ON sl.sales_order_id=${owner} AND sl.source_system='ainuoke' AND sl.source_entity_type='sales_contract'
 LEFT JOIN ainuoke_sales_order_contract_mirrors mirror ON mirror.sales_order_id=${owner}
 ${includeIdentity?PROCESSING_READ_JOINS:''}
 ${includeIdentity?'LEFT JOIN sales_order_identity_profiles profile ON profile.sales_order_id=so.id LEFT JOIN app_users owner_user ON owner_user.id=profile.owner_id':''}`;
}
function readModelSelect(includeIdentity:boolean,attributed:boolean,colors=false,businessSource=false):string {
 const trusted="mirror.source_id=sl.external_id AND mirror.sales_contract_no=sl.sales_contract_no";
 const contract=`CASE WHEN (${trusted}) AND (so.creation_source='ainuoke'${attributed?" OR (attribution.attribution_change_id IS NOT NULL AND attribution.effective_order_id=so.id)":''}) THEN 'ainuoke_contract' ELSE 'unclassified' END`;
 const businessType=includeIdentity?`CASE WHEN profile.business_type='processing' AND processing_batch.id IS NOT NULL THEN 'processing' WHEN (${contract})='ainuoke_contract' THEN 'ainuoke_contract' ELSE 'unclassified' END`:contract;
 const owner=sourceOwnerSql(attributed);
 return `SELECT so.*,${businessType} AS business_type,
 NULL::text AS owner_name,
 ${businessSource?"(SELECT s.kind FROM sales_order_commercial_heads h JOIN sales_order_business_source_snapshots s ON s.commercial_version_id=h.current_version_id WHERE h.sales_order_id=so.id)":'NULL::text'} AS business_source,
 ${attributed?'attribution.effective_order_id':'so.id'}::text AS effective_order_id,
 ${attributed?'attribution.attribution_change_id::text':'NULL::text'} AS attribution_change_id,
 ${attributed?'attribution.attribution_version':'0'} AS attribution_version,${owner}::text AS source_owner_order_id,
 sl.sales_contract_no,sl.inside_order_no,mirror.lifecycle_status_raw,
 to_char(${includeIdentity?'COALESCE(processing_batch.order_date,mirror.contract_date)':'mirror.contract_date'},'YYYY-MM-DD') AS contract_date,
 to_char(${includeIdentity?'COALESCE(processing_batch.delivery_date,mirror.contract_delivery_date)':'mirror.contract_delivery_date'},'YYYY-MM-DD') AS contract_delivery_date,
 ${includeIdentity?'COALESCE(processing_batch.business_style_no,mirror.style_no)':'mirror.style_no'} AS style_no,
 mirror.company_name_snapshot,${includeIdentity?'COALESCE(processing_batch.customer_name,mirror.customer_name_snapshot)':'mirror.customer_name_snapshot'} AS customer_name_snapshot,
 mirror.brand_name_snapshot,${includeIdentity?'COALESCE(processing_batch.quantity,mirror.quantity)':'mirror.quantity'} AS quantity,
 (SELECT count(*)::int FROM ainuoke_sales_order_color_mirrors c WHERE c.sales_order_id=${owner}) AS color_count,
 (SELECT count(*)::int FROM ainuoke_sales_order_color_mirrors c WHERE c.sales_order_id=${owner} AND c.quantity=0) AS zero_color_count,
 (SELECT count(*)::int FROM ainuoke_sales_order_color_mirrors c WHERE c.sales_order_id=${owner} AND c.quantity=0 AND c.source_metadata->>'quantityPendingConfirmation'='true') AS pending_color_count
 ${colors?`,COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceLineIdentity',c.source_line_identity,'colorName',c.color_name,'quantity',c.quantity,'deliveryDate',to_char(c.delivery_date,'YYYY-MM-DD')) ORDER BY c.color_name,c.source_line_identity) FROM ainuoke_sales_order_color_mirrors c WHERE c.sales_order_id=${owner}),'[]'::jsonb) AS colors`:''}
 ${readModelFrom(includeIdentity,attributed)}`;
}
/** Pool reads use one RR snapshot for count, identities and details. Transaction callers retain ownership. */
async function readSnapshot<T>(client:Queryable,read:(connection:Queryable)=>Promise<T>):Promise<T>{
 if('connect' in client&&!('release' in client)){
  const connection=await (client as Pool).connect();
  try{await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await read(connection);await connection.query('COMMIT');return result;}
  catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
 }
 return read(client);
}

export async function createSalesOrder(
  client: Queryable,
  input: {
    creationSource: SalesOrderCreationSource;
    lifecycleState?: SalesOrderLifecycleState;
    sourceOrderId?: string | null;
    sourceQuoteId?: string | null;
    sourceRevisionId?: string | null;
    sourcePriceVersionId?: string | null;
  },
): Promise<SalesOrderRecord> {
  const result = await client.query<SalesOrderRow>(
    `INSERT INTO sales_orders(
       creation_source, lifecycle_state, source_order_id,
       source_quote_id, source_revision_id, source_price_version_id
     ) VALUES ($1, $2, $3::uuid, $4, $5, $6)
     RETURNING *`,
    [
      input.creationSource,
      input.lifecycleState ?? "draft",
      input.sourceOrderId ?? null,
      input.sourceQuoteId ?? null,
      input.sourceRevisionId ?? null,
      input.sourcePriceVersionId ?? null,
    ],
  );
  return mapSalesOrder(result.rows[0]);
}

export async function updateSalesOrderLifecycle(
  client: Pool | PoolClient,
  input: { id: string; expectedVersion: number; lifecycleState: SalesOrderLifecycleState },
): Promise<SalesOrderRecord | null> {
  const connection='release' in client?client:await client.connect();
  const ownsTransaction=!('release' in client);
  try {
    if(ownsTransaction)await connection.query('BEGIN');
    await requireEffectiveOrderForWrite(connection,input.id);
  const result = await connection.query<SalesOrderRow>(
    `UPDATE sales_orders
     SET lifecycle_state = $3, version = version + 1
     WHERE id = $1::uuid AND version = $2
     RETURNING *`,
    [input.id, input.expectedVersion, input.lifecycleState],
  );
    if(ownsTransaction)await connection.query("COMMIT");
    return result.rows[0] ? mapSalesOrder(result.rows[0]) : null;
  } catch(error){if(ownsTransaction)await connection.query('ROLLBACK');throw error;}
  finally{if(ownsTransaction)connection.release();}
}

export async function getSalesOrderRecordById(client: Queryable, id: string): Promise<SalesOrderRecord | null> {
  const result = await client.query<SalesOrderRow>("SELECT * FROM sales_orders WHERE id = $1::uuid", [id]);
  return result.rows[0] ? mapSalesOrder(result.rows[0]) : null;
}

export async function createOrUpdateSourceLink(
  client: Queryable,
  input: {
    salesOrderId: string;
    sourceSystem: string;
    sourceEntityType: string;
    externalId: string;
    salesContractNo?: string | null;
    insideOrderNo?: string | null;
  },
): Promise<SalesOrderSourceLink> {
  const values = [
    input.salesOrderId,
    requiredText(input.sourceSystem, "sourceSystem").toLowerCase(),
    requiredText(input.sourceEntityType, "sourceEntityType").toLowerCase(),
    requiredText(input.externalId, "externalId"),
    optionalText(input.salesContractNo)?.toLocaleUpperCase("en-US") ?? null,
    optionalText(input.insideOrderNo),
  ];
  const result = await client.query<SourceLinkRow>(
    `INSERT INTO sales_order_source_links(
       sales_order_id, source_system, source_entity_type, external_id,
       sales_contract_no, inside_order_no
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6)
     ON CONFLICT (source_system, source_entity_type, external_id) DO UPDATE
       SET sales_contract_no = EXCLUDED.sales_contract_no,
           inside_order_no = EXCLUDED.inside_order_no
       WHERE sales_order_source_links.sales_order_id = EXCLUDED.sales_order_id
     RETURNING *`,
    values,
  );
  if (!result.rows[0]) throw new Error("Source identity is already bound to another SalesOrder");
  return mapSourceLink(result.rows[0]);
}

export async function getSalesOrderBySourceIdentity(
  client: Queryable,
  sourceSystem: string,
  sourceEntityType: string,
  externalId: string,
): Promise<SalesOrderReadModel | null> {
  const attributed=await supportsEffectiveAttribution(client);
  const result = await client.query<ReadModelRow>(
    `${readModelSelect(false,attributed)}
     WHERE EXISTS (
       SELECT 1 FROM sales_order_source_links lookup
       ${attributed?'JOIN sales_order_effective_identities lookup_mapping ON lookup_mapping.original_order_id=lookup.sales_order_id':''}
       WHERE ${attributed?'lookup_mapping.effective_order_id':'lookup.sales_order_id'} = so.id
         AND lookup.source_system = $1
         AND lookup.source_entity_type = $2
         AND lookup.external_id = $3
     )`,
    [
      requiredText(sourceSystem, "sourceSystem").toLowerCase(),
      requiredText(sourceEntityType, "sourceEntityType").toLowerCase(),
      requiredText(externalId, "externalId"),
    ],
  );
  return result.rows[0] ? mapReadModel(result.rows[0]) : null;
}

export async function getSalesOrderBySalesContractNo(
  client: Queryable,
  salesContractNo: string,
): Promise<SalesOrderReadModel | null> {
  const attributed=await supportsEffectiveAttribution(client);
  const result = await client.query<ReadModelRow>(
    `${readModelSelect(true,attributed,false,(await client.query("SELECT to_regclass('sales_order_business_source_snapshots') IS NOT NULL ready")).rows[0].ready)}
     WHERE sl.source_system = 'ainuoke'
       AND sl.source_entity_type = 'sales_contract'
       AND upper(btrim(sl.sales_contract_no)) = $1 ${attributed?'AND attribution.effective_order_id=so.id':''}`,
    [requiredText(salesContractNo, "salesContractNo").toLocaleUpperCase("en-US")],
  );
  return result.rows[0] ? mapReadModel(result.rows[0]) : null;
}

export async function upsertCurrentAinuokeContractMirror(
  client: Queryable,
  salesOrderId: string,
  input: AinuokeContractMirrorInput,
): Promise<void> {
 return writeSourceObservation(client,async client=>{
  await client.query(
    `INSERT INTO ainuoke_sales_order_contract_mirrors(
       sales_order_id, source_id, source_row_identity, sales_contract_no, inside_order_no,
       lifecycle_status_raw, contract_date, contract_delivery_date, style_no,
       company_name_snapshot, customer_name_snapshot, brand_name_snapshot, quantity,
       source_hash, fetched_at, source_metadata
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7::date, $8::date, $9,
       $10, $11, $12, $13, $14, $15::timestamptz, $16::jsonb
     )
     ON CONFLICT (sales_order_id) DO UPDATE SET
       source_id = EXCLUDED.source_id,
       source_row_identity = EXCLUDED.source_row_identity,
       sales_contract_no = EXCLUDED.sales_contract_no,
       inside_order_no = EXCLUDED.inside_order_no,
       lifecycle_status_raw = EXCLUDED.lifecycle_status_raw,
       contract_date = EXCLUDED.contract_date,
       contract_delivery_date = EXCLUDED.contract_delivery_date,
       style_no = EXCLUDED.style_no,
       company_name_snapshot = EXCLUDED.company_name_snapshot,
       customer_name_snapshot = EXCLUDED.customer_name_snapshot,
       brand_name_snapshot = EXCLUDED.brand_name_snapshot,
       quantity = EXCLUDED.quantity,
       source_hash = EXCLUDED.source_hash,
       fetched_at = EXCLUDED.fetched_at,
       source_metadata = EXCLUDED.source_metadata,
       updated_at = now()`,
    [
      salesOrderId,
      requiredText(input.sourceId, "sourceId"),
      requiredText(input.sourceRowIdentity, "sourceRowIdentity"),
      requiredText(input.salesContractNo, "salesContractNo").toLocaleUpperCase("en-US"),
      requiredText(input.insideOrderNo, "insideOrderNo"),
      input.lifecycleStatusRaw.normalize("NFKC").trim(),
      input.contractDate,
      input.contractDeliveryDate,
      input.styleNo.normalize("NFKC").trim(),
      input.companyNameSnapshot.normalize("NFKC").trim(),
      input.customerNameSnapshot.normalize("NFKC").trim(),
      input.brandNameSnapshot.normalize("NFKC").trim(),
      input.quantity,
      requiredText(input.sourceHash, "sourceHash"),
      input.fetchedAt,
      JSON.stringify(input.sourceMetadata ?? {}),
    ],
  );
 });
}

export async function replaceCurrentAinuokeColorSlice(
  client: Queryable,
  salesOrderId: string,
  colors: readonly AinuokeColorMirrorInput[],
): Promise<void> {
 return writeSourceObservation(client,async client=>{
  await client.query("DELETE FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id = $1::uuid", [salesOrderId]);
  for (const color of colors) {
    await client.query(
      `INSERT INTO ainuoke_sales_order_color_mirrors(
         sales_order_id, source_line_identity, color_name, quantity,
         delivery_date, source_hash, source_metadata
       ) VALUES ($1::uuid, $2, $3, $4, $5::date, $6, $7::jsonb)`,
      [
        salesOrderId,
        requiredText(color.sourceLineIdentity, "sourceLineIdentity"),
        requiredText(color.colorName, "colorName"),
        color.quantity,
        color.deliveryDate,
        requiredText(color.sourceHash, "sourceHash"),
        JSON.stringify(color.sourceMetadata ?? {}),
      ],
    );
  }
 });
}

async function writeSourceObservation<T>(client:Queryable,write:(connection:Queryable)=>Promise<T>):Promise<T>{
 const ownsTransaction='connect' in client&&!('release' in client);
 const connection=ownsTransaction?await (client as Pool).connect():client as PoolClient;
 try{if(ownsTransaction)await connection.query('BEGIN');await lockEffectiveAttribution(connection);const result=await write(connection);if(ownsTransaction)await connection.query('COMMIT');return result;}
 catch(error){if(ownsTransaction)await connection.query('ROLLBACK');throw error;}
 finally{if(ownsTransaction)(connection as PoolClient).release();}
}

export async function listSalesOrders(
  client: Queryable,
  options: SalesOrderListOptions = { limit: 100, offset: 0 },
): Promise<SalesOrderListResult> {
 return readSnapshot(client,async client=>{
  const attributed=await supportsEffectiveAttribution(client);
  const values: unknown[] = [];
  const where: string[] = attributed&&!options.includeHistorical?["attribution.effective_order_id=so.id"]:[];
  const addValue = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };
  if (options.search) {
    const search = addValue(`%${options.search}%`);
    where.push(`concat_ws(' ', so.order_no, sl.sales_contract_no, sl.inside_order_no,
      mirror.style_no, mirror.company_name_snapshot, mirror.customer_name_snapshot,
      mirror.brand_name_snapshot, processing_batch.customer_name, processing_batch.business_style_no, processing_batch.customer_reference) ILIKE ${search}`);
  }
  if (options.lifecycleState) where.push(`so.lifecycle_state = ${addValue(options.lifecycleState)}`);
  if (options.creationSource) where.push(`so.creation_source = ${addValue(options.creationSource)}`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalResult = await client.query<{ total: number }>(
    `SELECT count(*)::int AS total ${readModelFrom(true,attributed)} ${whereSql}`,
    values,
  );
  const sortColumns = {
    orderNo: "so.order_no",
    updatedAt: "so.updated_at",
    contractDeliveryDate: "COALESCE(processing_batch.delivery_date,mirror.contract_delivery_date)",
    salesContractNo: "sl.sales_contract_no",
  } as const;
  const sortColumn = sortColumns[options.sortBy ?? "orderNo"];
  const sortDirection = options.sortDirection === "desc" ? "DESC" : "ASC";
  const limit = addValue(options.limit);
  const offset = addValue(options.offset);
  const result = await client.query<ReadModelRow>(
    `${readModelSelect(true,attributed,false,(await client.query("SELECT to_regclass('sales_order_business_source_snapshots') IS NOT NULL ready")).rows[0].ready)}
     ${whereSql}
     ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, so.order_no ASC, so.id ASC
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  return { items: result.rows.map(mapReadModel), total: totalResult.rows[0].total };
 });
}

export function getSalesOrderById(client: Queryable, id: string): Promise<SalesOrderDetailReadModel | null> {
  return readSnapshot(client,connection=>readSalesOrderDetail(connection,id,true));
}
/** Source creation/replay supports frozen foundation schemas without identity side tables. */
export function getFoundationSalesOrderById(client: Queryable,id:string):Promise<SalesOrderDetailReadModel|null>{
  return readSalesOrderDetail(client,id,false);
}
async function readSalesOrderDetail(client:Queryable,id:string,includeIdentity:boolean):Promise<SalesOrderDetailReadModel|null>{
  const attributed=await supportsEffectiveAttribution(client);
  try {
    const result=await client.query<ReadModelRow>(`${readModelSelect(includeIdentity,attributed,true,(await client.query("SELECT to_regclass('sales_order_business_source_snapshots') IS NOT NULL ready")).rows[0].ready)} WHERE so.id=$1::uuid`,[id]);
    const row=result.rows[0];return row?{...mapReadModel(row),colors:row.colors}:null;
  }catch(error){if((error as {code?:string}).code==='22P02')return null;throw error;}
}
