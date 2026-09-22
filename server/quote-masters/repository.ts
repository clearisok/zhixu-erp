import type { Pool, PoolClient } from "pg";
import type {
  BrandDto, DefaultOtherCostDto, DefaultTrimDto, DefaultTrimInput, FabricDto, GlobalQuoteSettingsDto,
  ManufacturingPresetDto, MasterStatus, QuoteDefaultsInput, SalespersonDto, TrimDto,
} from "./model.js";

type Queryable = Pick<Pool | PoolClient, "query">;
type Owner = { kind: "brand" | "salesperson"; id: string };
type CommonRow = { id: string; version: number; created_at: Date; updated_at: Date };
type DefaultsRow = {
  default_usd_cny_rate: string | null;
  default_other_cost_name: string | null;
  default_other_cost_amount: string | null;
};
type BrandRow = CommonRow & DefaultsRow & { name: string; normalized_name: string; status: MasterStatus };
type SalespersonRow = BrandRow & { brand_id: string };
type FabricRow = CommonRow & {
  name: string; normalized_name: string; composition: string; net_width_cm: string | null; gsm: string | null;
  default_loss_rate: string | null; supplier: string; unit_price: string | null; purchase_unit: "kg" | "meter";
};
type TrimRow = CommonRow & {
  name: string; normalized_name: string; specification: string; supplier: string; unit: string;
  default_loss_rate: string | null; unit_price: string | null;
};
type DefaultTrimRow = { id: string; trim_library_item_id: string; override_loss_rate: string | null; override_unit_price: string | null };
type PresetRow = CommonRow & {
  name: string; country: string; labor_currency: "CNY" | "USD"; markup_rate: string | null;
  include_freight: boolean; freight_name: string; freight_amount: string | null; status: MasterStatus;
};
type SettingsRow = Omit<CommonRow, "id"> & DefaultsRow & {
  default_markup_rate: string | null; default_labor_currency: "CNY" | "USD"; default_labor_description: string;
  default_manufacturing_preset_id: string | null;
};

const timestamps = (row: CommonRow) => ({ version: row.version, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });
const otherCost = (row: DefaultsRow): DefaultOtherCostDto | null => row.default_other_cost_name === null
  ? null
  : { name: row.default_other_cost_name, amount: row.default_other_cost_amount };

export async function listDefaultTrims(db: Queryable, owner: Owner): Promise<DefaultTrimDto[]> {
  const column = owner.kind === "brand" ? "brand_id" : "customer_salesperson_id";
  const result = await db.query<DefaultTrimRow>(
    `SELECT id,trim_library_item_id,override_loss_rate::text,override_unit_price::text
       FROM quote_master_default_trim_configs WHERE ${column}=$1 ORDER BY position,id`, [owner.id],
  );
  return result.rows.map((row) => ({ id: row.id, trimLibraryItemId: row.trim_library_item_id, overrideLossRate: row.override_loss_rate, overrideUnitPrice: row.override_unit_price }));
}

async function mapBrand(db: Queryable, row: BrandRow): Promise<BrandDto> {
  return { id: row.id, name: row.name, status: row.status, defaults: { defaultUsdCnyRate: row.default_usd_cny_rate, defaultOtherCost: otherCost(row), defaultTrims: await listDefaultTrims(db, { kind: "brand", id: row.id }) }, ...timestamps(row) };
}
async function mapSalesperson(db: Queryable, row: SalespersonRow): Promise<SalespersonDto> {
  return { id: row.id, name: row.name, brandId: row.brand_id, status: row.status, defaults: { defaultUsdCnyRate: row.default_usd_cny_rate, defaultOtherCost: otherCost(row), defaultTrims: await listDefaultTrims(db, { kind: "salesperson", id: row.id }) }, ...timestamps(row) };
}
const mapFabric = (row: FabricRow): FabricDto => ({ id: row.id, name: row.name, composition: row.composition, netWidthCm: row.net_width_cm, gsm: row.gsm, defaultLossRate: row.default_loss_rate, supplier: row.supplier, unitPrice: row.unit_price, purchaseUnit: row.purchase_unit, ...timestamps(row) });
const mapTrim = (row: TrimRow): TrimDto => ({ id: row.id, name: row.name, specification: row.specification, supplier: row.supplier, unit: row.unit, defaultLossRate: row.default_loss_rate, unitPrice: row.unit_price, ...timestamps(row) });
const mapPreset = (row: PresetRow): ManufacturingPresetDto => ({ id: row.id, name: row.name, country: row.country, laborCurrency: row.labor_currency, markupRate: row.markup_rate, includeFreight: row.include_freight, freightName: row.freight_name, freightAmount: row.freight_amount, status: row.status, ...timestamps(row) });

export async function listBrands(db: Queryable, status?: MasterStatus): Promise<BrandDto[]> {
  const rows = await db.query<BrandRow>(`SELECT * FROM quote_master_brands ${status ? "WHERE status=$1" : ""} ORDER BY normalized_name,id`, status ? [status] : []);
  return Promise.all(rows.rows.map((row) => mapBrand(db, row)));
}
export async function getBrand(db: Queryable, id: string, lock = false): Promise<BrandDto | null> {
  const result = await db.query<BrandRow>(`SELECT * FROM quote_master_brands WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id]);
  return result.rows[0] ? mapBrand(db, result.rows[0]) : null;
}
export async function insertBrand(db: Queryable, input: { id: string; name: string; normalizedName: string; status: MasterStatus; defaults: QuoteDefaultsInput; defaultTrimIds?: string[] }): Promise<BrandDto> {
  const row = (await db.query<BrandRow>(`INSERT INTO quote_master_brands(id,name,normalized_name,status,default_usd_cny_rate,default_other_cost_name,default_other_cost_amount)
    VALUES($1,$2,$3,$4,$5::numeric,$6,$7::numeric) RETURNING *`, [input.id,input.name,input.normalizedName,input.status,input.defaults.defaultUsdCnyRate,input.defaults.defaultOtherCost?.name ?? null,input.defaults.defaultOtherCost?.amount ?? null])).rows[0];
  await replaceDefaultTrims(db, { kind: "brand", id: input.id }, input.defaults.defaultTrims, input.defaultTrimIds);
  return mapBrand(db, row);
}
export async function updateBrand(db: Queryable, input: { id: string; expectedVersion: number; name: string; normalizedName: string; status: MasterStatus; defaults: QuoteDefaultsInput; defaultTrimIds?: string[] }): Promise<BrandDto | null> {
  const row = (await db.query<BrandRow>(`UPDATE quote_master_brands SET name=$3,normalized_name=$4,status=$5,default_usd_cny_rate=$6::numeric,
    default_other_cost_name=$7,default_other_cost_amount=$8::numeric,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *`,
  [input.id,input.expectedVersion,input.name,input.normalizedName,input.status,input.defaults.defaultUsdCnyRate,input.defaults.defaultOtherCost?.name ?? null,input.defaults.defaultOtherCost?.amount ?? null])).rows[0];
  if (!row) return null;
  await replaceDefaultTrims(db, { kind: "brand", id: input.id }, input.defaults.defaultTrims, input.defaultTrimIds);
  return mapBrand(db, row);
}

export async function listSalespeople(db: Queryable, filters: { status?: MasterStatus; brandId?: string } = {}): Promise<SalespersonDto[]> {
  const clauses: string[] = []; const values: string[] = [];
  if (filters.status) { values.push(filters.status); clauses.push(`status=$${values.length}`); }
  if (filters.brandId) { values.push(filters.brandId); clauses.push(`brand_id=$${values.length}`); }
  const rows = await db.query<SalespersonRow>(`SELECT * FROM quote_master_customer_salespeople ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY normalized_name,id`, values);
  return Promise.all(rows.rows.map((row) => mapSalesperson(db, row)));
}
export async function getSalesperson(db: Queryable, id: string, lock = false): Promise<SalespersonDto | null> {
  const result = await db.query<SalespersonRow>(`SELECT * FROM quote_master_customer_salespeople WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id]);
  return result.rows[0] ? mapSalesperson(db, result.rows[0]) : null;
}
export async function insertSalesperson(db: Queryable, input: { id: string; name: string; normalizedName: string; brandId: string; status: MasterStatus; defaults: QuoteDefaultsInput; defaultTrimIds?: string[] }): Promise<SalespersonDto> {
  const row = (await db.query<SalespersonRow>(`INSERT INTO quote_master_customer_salespeople(id,name,normalized_name,brand_id,status,default_usd_cny_rate,default_other_cost_name,default_other_cost_amount)
    VALUES($1,$2,$3,$4,$5,$6::numeric,$7,$8::numeric) RETURNING *`, [input.id,input.name,input.normalizedName,input.brandId,input.status,input.defaults.defaultUsdCnyRate,input.defaults.defaultOtherCost?.name ?? null,input.defaults.defaultOtherCost?.amount ?? null])).rows[0];
  await replaceDefaultTrims(db, { kind: "salesperson", id: input.id }, input.defaults.defaultTrims, input.defaultTrimIds);
  return mapSalesperson(db, row);
}
export async function updateSalesperson(db: Queryable, input: { id: string; expectedVersion: number; name: string; normalizedName: string; brandId: string; status: MasterStatus; defaults: QuoteDefaultsInput; defaultTrimIds?: string[] }): Promise<SalespersonDto | null> {
  const row = (await db.query<SalespersonRow>(`UPDATE quote_master_customer_salespeople SET name=$3,normalized_name=$4,brand_id=$5,status=$6,default_usd_cny_rate=$7::numeric,
    default_other_cost_name=$8,default_other_cost_amount=$9::numeric,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *`,
  [input.id,input.expectedVersion,input.name,input.normalizedName,input.brandId,input.status,input.defaults.defaultUsdCnyRate,input.defaults.defaultOtherCost?.name ?? null,input.defaults.defaultOtherCost?.amount ?? null])).rows[0];
  if (!row) return null;
  await replaceDefaultTrims(db, { kind: "salesperson", id: input.id }, input.defaults.defaultTrims, input.defaultTrimIds);
  return mapSalesperson(db, row);
}

export async function replaceDefaultTrims(db: Queryable, owner: Owner, values: DefaultTrimInput[], ids?: string[]): Promise<void> {
  const column = owner.kind === "brand" ? "brand_id" : "customer_salesperson_id";
  await db.query(`DELETE FROM quote_master_default_trim_configs WHERE ${column}=$1`, [owner.id]);
  for (const [position, value] of values.entries()) {
    await db.query(`INSERT INTO quote_master_default_trim_configs(id,${column},position,trim_library_item_id,override_loss_rate,override_unit_price)
      VALUES($1,$2,$3,$4,$5::numeric,$6::numeric)`, [ids?.[position] ?? value.trimLibraryItemId, owner.id, position, value.trimLibraryItemId, value.overrideLossRate, value.overrideUnitPrice]);
  }
}

export async function listFabrics(db: Queryable, search = ""): Promise<FabricDto[]> {
  const token = `%${search}%`;
  const rows = await db.query<FabricRow>(`SELECT * FROM quote_master_fabrics WHERE $1='' OR normalized_name LIKE $2 OR lower(supplier) LIKE $2 OR lower(composition) LIKE $2 ORDER BY normalized_name,id`, [search, token]);
  return rows.rows.map(mapFabric);
}
export async function getFabric(db: Queryable, id: string, lock = false): Promise<FabricDto | null> { const row=(await db.query<FabricRow>(`SELECT * FROM quote_master_fabrics WHERE id=$1${lock ? " FOR UPDATE" : ""}`,[id])).rows[0]; return row ? mapFabric(row) : null; }
export async function insertFabric(db: Queryable, input: Omit<FabricDto,"version"|"createdAt"|"updatedAt"> & { normalizedName: string }): Promise<FabricDto> {
  const row=(await db.query<FabricRow>(`INSERT INTO quote_master_fabrics(id,name,normalized_name,composition,net_width_cm,gsm,default_loss_rate,supplier,unit_price,purchase_unit)
    VALUES($1,$2,$3,$4,$5::numeric,$6::numeric,$7::numeric,$8,$9::numeric,$10) RETURNING *`,[input.id,input.name,input.normalizedName,input.composition,input.netWidthCm,input.gsm,input.defaultLossRate,input.supplier,input.unitPrice,input.purchaseUnit])).rows[0]; return mapFabric(row);
}
export async function updateFabric(db: Queryable, input: Omit<FabricDto,"createdAt"|"updatedAt"> & { expectedVersion:number; normalizedName:string }): Promise<FabricDto|null> {
  const row=(await db.query<FabricRow>(`UPDATE quote_master_fabrics SET name=$3,normalized_name=$4,composition=$5,net_width_cm=$6::numeric,gsm=$7::numeric,default_loss_rate=$8::numeric,supplier=$9,unit_price=$10::numeric,purchase_unit=$11,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *`,[input.id,input.expectedVersion,input.name,input.normalizedName,input.composition,input.netWidthCm,input.gsm,input.defaultLossRate,input.supplier,input.unitPrice,input.purchaseUnit])).rows[0]; return row ? mapFabric(row) : null;
}

export async function listTrims(db: Queryable, search = ""): Promise<TrimDto[]> { const token=`%${search}%`; const rows=await db.query<TrimRow>(`SELECT * FROM quote_master_trims WHERE $1='' OR normalized_name LIKE $2 OR lower(supplier) LIKE $2 OR lower(specification) LIKE $2 ORDER BY normalized_name,id`,[search,token]); return rows.rows.map(mapTrim); }
export async function getTrim(db: Queryable,id:string,lock=false):Promise<TrimDto|null>{const row=(await db.query<TrimRow>(`SELECT * FROM quote_master_trims WHERE id=$1${lock?" FOR UPDATE":""}`,[id])).rows[0];return row?mapTrim(row):null;}
export async function insertTrim(db: Queryable,input:Omit<TrimDto,"version"|"createdAt"|"updatedAt">&{normalizedName:string}):Promise<TrimDto>{const row=(await db.query<TrimRow>(`INSERT INTO quote_master_trims(id,name,normalized_name,specification,supplier,unit,default_loss_rate,unit_price) VALUES($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric) RETURNING *`,[input.id,input.name,input.normalizedName,input.specification,input.supplier,input.unit,input.defaultLossRate,input.unitPrice])).rows[0];return mapTrim(row);}
export async function updateTrim(db: Queryable,input:Omit<TrimDto,"createdAt"|"updatedAt">&{expectedVersion:number;normalizedName:string}):Promise<TrimDto|null>{const row=(await db.query<TrimRow>(`UPDATE quote_master_trims SET name=$3,normalized_name=$4,specification=$5,supplier=$6,unit=$7,default_loss_rate=$8::numeric,unit_price=$9::numeric,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *`,[input.id,input.expectedVersion,input.name,input.normalizedName,input.specification,input.supplier,input.unit,input.defaultLossRate,input.unitPrice])).rows[0];return row?mapTrim(row):null;}

export async function listPresets(db: Queryable,status?:MasterStatus,lock=false):Promise<ManufacturingPresetDto[]>{const rows=await db.query<PresetRow>(`SELECT * FROM quote_manufacturing_presets ${status?"WHERE status=$1":""} ORDER BY name,id${lock?" FOR UPDATE":""}`,status?[status]:[]);return rows.rows.map(mapPreset);}
export async function getPreset(db:Queryable,id:string,lock=false):Promise<ManufacturingPresetDto|null>{const row=(await db.query<PresetRow>(`SELECT * FROM quote_manufacturing_presets WHERE id=$1${lock?" FOR UPDATE":""}`,[id])).rows[0];return row?mapPreset(row):null;}
export async function insertPreset(db:Queryable,input:Omit<ManufacturingPresetDto,"version"|"createdAt"|"updatedAt">):Promise<ManufacturingPresetDto>{const row=(await db.query<PresetRow>(`INSERT INTO quote_manufacturing_presets(id,name,country,labor_currency,markup_rate,include_freight,freight_name,freight_amount,status) VALUES($1,$2,$3,$4,$5::numeric,$6,$7,$8::numeric,$9) RETURNING *`,[input.id,input.name,input.country,input.laborCurrency,input.markupRate,input.includeFreight,input.freightName,input.freightAmount,input.status])).rows[0];return mapPreset(row);}
export async function updatePreset(db:Queryable,input:Omit<ManufacturingPresetDto,"createdAt"|"updatedAt">&{expectedVersion:number}):Promise<ManufacturingPresetDto|null>{const row=(await db.query<PresetRow>(`UPDATE quote_manufacturing_presets SET name=$3,country=$4,labor_currency=$5,markup_rate=$6::numeric,include_freight=$7,freight_name=$8,freight_amount=$9::numeric,status=$10,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *`,[input.id,input.expectedVersion,input.name,input.country,input.laborCurrency,input.markupRate,input.includeFreight,input.freightName,input.freightAmount,input.status])).rows[0];return row?mapPreset(row):null;}

export async function getGlobalSettings(db:Queryable,lock=false):Promise<GlobalQuoteSettingsDto|null>{const row=(await db.query<SettingsRow>(`SELECT * FROM quote_global_settings WHERE singleton_id=1${lock?" FOR UPDATE":""}`)).rows[0];return row?{defaultUsdCnyRate:row.default_usd_cny_rate,defaultMarkupRate:row.default_markup_rate,defaultLaborCurrency:row.default_labor_currency,defaultLaborDescription:row.default_labor_description,defaultOtherCost:otherCost(row),defaultManufacturingPresetId:row.default_manufacturing_preset_id,version:row.version,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()}:null;}
export async function writeGlobalSettings(db:Queryable,input:{expectedVersion:number;defaultUsdCnyRate:string|null;defaultMarkupRate:string|null;defaultLaborCurrency:"CNY"|"USD";defaultLaborDescription:string;defaultOtherCost:DefaultOtherCostDto|null;defaultManufacturingPresetId:string|null}):Promise<GlobalQuoteSettingsDto|null>{
  if(input.expectedVersion===0){await db.query(`INSERT INTO quote_global_settings(singleton_id,default_usd_cny_rate,default_markup_rate,default_labor_currency,default_labor_description,default_other_cost_name,default_other_cost_amount,default_manufacturing_preset_id) VALUES(1,$1::numeric,$2::numeric,$3,$4,$5,$6::numeric,$7) ON CONFLICT DO NOTHING`,[input.defaultUsdCnyRate,input.defaultMarkupRate,input.defaultLaborCurrency,input.defaultLaborDescription,input.defaultOtherCost?.name??null,input.defaultOtherCost?.amount??null,input.defaultManufacturingPresetId]);}
  else await db.query(`UPDATE quote_global_settings SET default_usd_cny_rate=$2::numeric,default_markup_rate=$3::numeric,default_labor_currency=$4,default_labor_description=$5,default_other_cost_name=$6,default_other_cost_amount=$7::numeric,default_manufacturing_preset_id=$8,version=version+1,updated_at=now() WHERE singleton_id=1 AND version=$1`,[input.expectedVersion,input.defaultUsdCnyRate,input.defaultMarkupRate,input.defaultLaborCurrency,input.defaultLaborDescription,input.defaultOtherCost?.name??null,input.defaultOtherCost?.amount??null,input.defaultManufacturingPresetId]);
  const result=await getGlobalSettings(db); return result && result.version===(input.expectedVersion===0?1:input.expectedVersion+1)?result:null;
}

export async function supplierSuggestions(db:Queryable,search=""):Promise<string[]>{const result=await db.query<{supplier:string}>(`SELECT supplier FROM (SELECT supplier FROM quote_master_fabrics UNION SELECT supplier FROM quote_master_trims) s WHERE btrim(supplier)<>'' AND ($1='' OR lower(supplier) LIKE $2) ORDER BY lower(supplier),supplier LIMIT 100`,[search,`%${search}%`]);return result.rows.map((row)=>row.supplier);}
