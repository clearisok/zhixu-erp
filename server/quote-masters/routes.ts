import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { requirePermission } from "../auth/permissions.js";
import { authenticate, type SessionSecurityConfig } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { assertMutationBoundary, readJsonBody } from "../http/request.js";
import { sendJson } from "../http/responses.js";
import {
  decimal, defaultOtherCost, exactObject, expectedVersion, quoteDefaults, status, text,
  type MasterStatus, type QuoteDefaultsInput,
} from "./model.js";
import { createQuoteMasterService, type BrandWrite, type FabricWrite, type PresetWrite, type SalespersonWrite, type SettingsBundlePresetWrite, type SettingsWrite, type TrimWrite } from "./service.js";

type Dependencies = { pool: Pool; allowedOrigins: readonly string[]; security: SessionSecurityConfig };
const neutralDefaults = (): QuoteDefaultsInput => ({ defaultUsdCnyRate: null, defaultOtherCost: null, defaultTrims: [] });

function query(request: IncomingMessage, allowed: readonly string[]) {
  const params = new URL(request.url ?? "/", "http://localhost").searchParams;
  if ([...params.keys()].some((key) => !allowed.includes(key))) throw new HttpError(400, "invalid_quote_master_query", "Query contains unsupported fields");
  return params;
}
function queryStatus(value: string | null): MasterStatus | undefined {
  if (value === null || value === "all") return undefined;
  return status(value);
}
function pathId(value: string): string {
  try { return text(decodeURIComponent(value), "id", { required: true, max: 256 }); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "invalid_quote_master_input", "id is invalid"); }
}
function boolean(value: unknown, field: string): boolean { if (typeof value !== "boolean") throw new HttpError(400,"invalid_quote_master_input",`${field} must be boolean`); return value; }
function currency(value: unknown): "CNY"|"USD" { if(value!=="CNY"&&value!=="USD")throw new HttpError(400,"invalid_quote_master_input","labor currency is invalid");return value; }

function brandWrite(body: Record<string, unknown>, update: boolean): { input: BrandWrite; expectedVersion?: number } {
  exactObject(body, update ? ["expectedVersion","name","status","defaults"] : ["name","status","defaults"]);
  return {
    input: {
      name: text(body.name,"name",{required:true,max:200}),
      status: body.status === undefined ? "active" : status(body.status),
      defaults: body.defaults === undefined ? neutralDefaults() : quoteDefaults(body.defaults),
    },
    ...(update ? { expectedVersion: expectedVersion(body.expectedVersion) } : {}),
  };
}
function salespersonWrite(body: Record<string, unknown>, update: boolean): { input: SalespersonWrite; expectedVersion?: number } {
  exactObject(body, update ? ["expectedVersion","name","brandId","status","defaults"] : ["name","brandId","status","defaults"]);
  return { input: { ...brandWrite({ name: body.name, status: body.status, defaults: body.defaults }, false).input, brandId: text(body.brandId,"brandId",{required:true,max:256}) }, ...(update?{expectedVersion:expectedVersion(body.expectedVersion)}:{}) };
}
function fabricWrite(body: Record<string, unknown>, update: boolean): { input: FabricWrite; expectedVersion?: number } {
  exactObject(body, [...(update?["expectedVersion"]:[]),"name","composition","netWidthCm","gsm","defaultLossRate","supplier","unitPrice","purchaseUnit"]);
  if(body.purchaseUnit!=="kg"&&body.purchaseUnit!=="meter")throw new HttpError(400,"invalid_quote_master_input","purchaseUnit is invalid");
  return {input:{name:text(body.name,"name",{required:true,max:200}),composition:text(body.composition,"composition"),netWidthCm:decimal(body.netWidthCm,"netWidthCm"),gsm:decimal(body.gsm,"gsm"),defaultLossRate:decimal(body.defaultLossRate,"defaultLossRate"),supplier:text(body.supplier,"supplier",{max:200}),unitPrice:decimal(body.unitPrice,"unitPrice"),purchaseUnit:body.purchaseUnit},...(update?{expectedVersion:expectedVersion(body.expectedVersion)}:{})};
}
function trimWrite(body: Record<string, unknown>, update: boolean): { input: TrimWrite; expectedVersion?: number } {
  exactObject(body,[...(update?["expectedVersion"]:[]),"name","specification","supplier","unit","defaultLossRate","unitPrice"]);
  return {input:{name:text(body.name,"name",{required:true,max:200}),specification:text(body.specification,"specification"),supplier:text(body.supplier,"supplier",{max:200}),unit:text(body.unit,"unit",{required:true,max:100}),defaultLossRate:decimal(body.defaultLossRate,"defaultLossRate"),unitPrice:decimal(body.unitPrice,"unitPrice")},...(update?{expectedVersion:expectedVersion(body.expectedVersion)}:{})};
}
function presetWrite(body: Record<string, unknown>, update: boolean): { input: PresetWrite; expectedVersion?: number } {
  exactObject(body,[...(update?["expectedVersion"]:[]),"name","country","laborCurrency","markupRate","includeFreight","freightName","freightAmount","status"]);
  return {input:{name:text(body.name,"name",{required:true,max:200}),country:text(body.country,"country",{required:true,max:200}),laborCurrency:currency(body.laborCurrency),markupRate:decimal(body.markupRate,"markupRate"),includeFreight:boolean(body.includeFreight,"includeFreight"),freightName:text(body.freightName,"freightName",{required:true,max:200}),freightAmount:decimal(body.freightAmount,"freightAmount"),status:status(body.status)},...(update?{expectedVersion:expectedVersion(body.expectedVersion)}:{})};
}
function settingsWrite(body: Record<string,unknown>):{input:SettingsWrite;expectedVersion:number}{
  exactObject(body,["expectedVersion","defaultUsdCnyRate","defaultMarkupRate","defaultLaborCurrency","defaultLaborDescription","defaultOtherCost","defaultManufacturingPresetId"]);
  const preset=body.defaultManufacturingPresetId===null?null:text(body.defaultManufacturingPresetId,"defaultManufacturingPresetId",{required:true,max:256});
  return {expectedVersion:expectedVersion(body.expectedVersion),input:{defaultUsdCnyRate:decimal(body.defaultUsdCnyRate,"defaultUsdCnyRate"),defaultMarkupRate:decimal(body.defaultMarkupRate,"defaultMarkupRate"),defaultLaborCurrency:currency(body.defaultLaborCurrency),defaultLaborDescription:text(body.defaultLaborDescription,"defaultLaborDescription",{max:2000}),defaultOtherCost:defaultOtherCost(body.defaultOtherCost),defaultManufacturingPresetId:preset}};
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400,"invalid_quote_master_input",`${field} must be an object`);
  return value as Record<string, unknown>;
}
function settingsBundleWrite(body: Record<string, unknown>) {
  exactObject(body,["expectedVersion","settings","manufacturingPresets"]);
  const expectedSettingsVersion=expectedVersion(body.expectedVersion);
  const parsedSettings=settingsWrite({ expectedVersion:expectedSettingsVersion,...object(body.settings,"settings") }).input;
  if(!Array.isArray(body.manufacturingPresets)||body.manufacturingPresets.length>100)throw new HttpError(400,"invalid_quote_master_input","manufacturingPresets must be a bounded array");
  const manufacturingPresets=body.manufacturingPresets.map((value,index):SettingsBundlePresetWrite=>{
    const item=object(value,`manufacturingPresets[${index}]`);
    const existing=typeof item.id==="string";
    exactObject(item,[existing?"id":"clientId",...(existing?["expectedVersion"]:[]),"name","country","laborCurrency","markupRate","includeFreight","freightName","freightAmount","status"]);
    const parsed=presetWrite(item,existing);
    return existing
      ? {id:text(item.id,"id",{required:true,max:256}),expectedVersion:parsed.expectedVersion!,...parsed.input}
      : {clientId:text(item.clientId,"clientId",{required:true,max:256}),...parsed.input};
  });
  return {expectedSettingsVersion,settings:parsedSettings,manufacturingPresets};
}

export async function routeQuoteMasters(request: IncomingMessage,response:ServerResponse,dependencies:Dependencies,requestId:string):Promise<boolean>{
  const path=new URL(request.url??"/","http://localhost").pathname;
  if(!path.startsWith("/api/v1/quote-masters")&&!path.startsWith("/api/v1/quote-settings"))return false;
  const mutation=request.method==="POST"||request.method==="PATCH";
  if(mutation)assertMutationBoundary(request,dependencies.allowedOrigins);
  const actor=await authenticate(dependencies.pool,request);
  if(!actor)throw new HttpError(401,"authentication_required","Authentication is required");
  const service=createQuoteMasterService(dependencies.pool);
  const context={requestId,method:request.method,path};
  const readAny=(...permissions: Parameters<typeof requirePermission>[1][])=>{
    if(!permissions.some((permission)=>actor.permissions.includes(permission)))requirePermission(actor.permissions,permissions[0]);
  };

  if(path==="/api/v1/quote-masters/brands"){
    if(request.method==="GET"){readAny("quote.view","settings.brand.edit","settings.salesperson.edit");const p=query(request,["status"]);sendJson(response,200,{brands:await service.listBrands(queryStatus(p.get("status")))});return true;}
    if(request.method==="POST"){const parsed=brandWrite(await readJsonBody(request),false);sendJson(response,201,{brand:await service.createBrand(actor,parsed.input,context)});return true;}
  }
  const brand=/^\/api\/v1\/quote-masters\/brands\/([^/]+)$/.exec(path);
  if(brand){const id=pathId(brand[1]);if(request.method==="GET"){readAny("quote.view","settings.brand.edit","settings.salesperson.edit");const value=await service.getBrand(id);if(!value)throw new HttpError(404,"quote_master_not_found","Brand was not found");sendJson(response,200,{brand:value});return true;}if(request.method==="PATCH"){const parsed=brandWrite(await readJsonBody(request),true);sendJson(response,200,{brand:await service.updateBrand(actor,id,parsed.expectedVersion!,parsed.input,context)});return true;}}

  if(path==="/api/v1/quote-masters/customer-salespeople"){
    if(request.method==="GET"){readAny("quote.view","settings.salesperson.edit");const p=query(request,["status","brandId"]);sendJson(response,200,{customerSalespeople:await service.listSalespeople({status:queryStatus(p.get("status")),brandId:p.get("brandId")||undefined})});return true;}
    if(request.method==="POST"){const parsed=salespersonWrite(await readJsonBody(request),false);sendJson(response,201,{customerSalesperson:await service.createSalesperson(actor,parsed.input,context)});return true;}
  }
  const salesperson=/^\/api\/v1\/quote-masters\/customer-salespeople\/([^/]+)$/.exec(path);
  if(salesperson){const id=pathId(salesperson[1]);if(request.method==="GET"){readAny("quote.view","settings.salesperson.edit");const value=await service.getSalesperson(id);if(!value)throw new HttpError(404,"quote_master_not_found","Customer salesperson was not found");sendJson(response,200,{customerSalesperson:value});return true;}if(request.method==="PATCH"){const parsed=salespersonWrite(await readJsonBody(request),true);sendJson(response,200,{customerSalesperson:await service.updateSalesperson(actor,id,parsed.expectedVersion!,parsed.input,context)});return true;}}

  if(path==="/api/v1/quote-masters/fabrics"){
    if(request.method==="GET"){readAny("quote.view","settings.fabric.edit");const p=query(request,["search"]);sendJson(response,200,{fabrics:await service.listFabrics((p.get("search")??"").normalize("NFKC").trim().toLocaleLowerCase("zh-CN"))});return true;}
    if(request.method==="POST"){const parsed=fabricWrite(await readJsonBody(request),false);sendJson(response,201,{fabric:await service.createFabric(actor,parsed.input,context)});return true;}
  }
  const fabric=/^\/api\/v1\/quote-masters\/fabrics\/([^/]+)$/.exec(path);
  if(fabric){const id=pathId(fabric[1]);if(request.method==="GET"){readAny("quote.view","settings.fabric.edit");const value=await service.getFabric(id);if(!value)throw new HttpError(404,"quote_master_not_found","Fabric was not found");sendJson(response,200,{fabric:value});return true;}if(request.method==="PATCH"){const parsed=fabricWrite(await readJsonBody(request),true);sendJson(response,200,{fabric:await service.updateFabric(actor,id,parsed.expectedVersion!,parsed.input,context)});return true;}}

  if(path==="/api/v1/quote-masters/trims"){
    if(request.method==="GET"){readAny("quote.view","settings.trim.edit","settings.brand.edit","settings.salesperson.edit");const p=query(request,["search"]);sendJson(response,200,{trims:await service.listTrims((p.get("search")??"").normalize("NFKC").trim().toLocaleLowerCase("zh-CN"))});return true;}
    if(request.method==="POST"){const parsed=trimWrite(await readJsonBody(request),false);sendJson(response,201,{trim:await service.createTrim(actor,parsed.input,context)});return true;}
  }
  const trim=/^\/api\/v1\/quote-masters\/trims\/([^/]+)$/.exec(path);
  if(trim){const id=pathId(trim[1]);if(request.method==="GET"){readAny("quote.view","settings.trim.edit","settings.brand.edit","settings.salesperson.edit");const value=await service.getTrim(id);if(!value)throw new HttpError(404,"quote_master_not_found","Trim was not found");sendJson(response,200,{trim:value});return true;}if(request.method==="PATCH"){const parsed=trimWrite(await readJsonBody(request),true);sendJson(response,200,{trim:await service.updateTrim(actor,id,parsed.expectedVersion!,parsed.input,context)});return true;}}

  if(path==="/api/v1/quote-masters/supplier-suggestions"&&request.method==="GET"){readAny("quote.view","settings.fabric.edit","settings.trim.edit");const p=query(request,["search"]);sendJson(response,200,{suppliers:await service.supplierSuggestions((p.get("search")??"").normalize("NFKC").trim().toLocaleLowerCase("zh-CN"))});return true;}
  if(path==="/api/v1/quote-settings/bundle"&&request.method==="PATCH"){const parsed=settingsBundleWrite(await readJsonBody(request));sendJson(response,200,await service.saveSettingsBundle(actor,parsed,context));return true;}
  if(path==="/api/v1/quote-settings"){
    if(request.method==="GET"){readAny("quote.view","settings.global.edit");sendJson(response,200,{settings:await service.getGlobalSettings()});return true;}
    if(request.method==="PATCH"){const parsed=settingsWrite(await readJsonBody(request));sendJson(response,200,{settings:await service.updateGlobalSettings(actor,parsed.expectedVersion,parsed.input,context)});return true;}
  }
  if(path==="/api/v1/quote-settings/manufacturing-presets"){
    if(request.method==="GET"){readAny("quote.view","settings.global.edit");const p=query(request,["status"]);sendJson(response,200,{manufacturingPresets:await service.listPresets(queryStatus(p.get("status")))});return true;}
    if(request.method==="POST"){const parsed=presetWrite(await readJsonBody(request),false);sendJson(response,201,{manufacturingPreset:await service.createPreset(actor,parsed.input,context)});return true;}
  }
  const preset=/^\/api\/v1\/quote-settings\/manufacturing-presets\/([^/]+)$/.exec(path);
  if(preset){const id=pathId(preset[1]);if(request.method==="GET"){readAny("quote.view","settings.global.edit");const value=await service.getPreset(id);if(!value)throw new HttpError(404,"quote_master_not_found","Manufacturing preset was not found");sendJson(response,200,{manufacturingPreset:value});return true;}if(request.method==="PATCH"){const parsed=presetWrite(await readJsonBody(request),true);sendJson(response,200,{manufacturingPreset:await service.updatePreset(actor,id,parsed.expectedVersion!,parsed.input,context)});return true;}}
  if(path==="/api/v1/quote-settings/resolved-defaults"&&request.method==="GET"){readAny("quote.view");const p=query(request,["brandId","salespersonId"]);sendJson(response,200,{defaults:await service.resolveDefaults(p.get("brandId")||undefined,p.get("salespersonId")||undefined)});return true;}
  throw new HttpError(404,"not_found","Route not found");
}
