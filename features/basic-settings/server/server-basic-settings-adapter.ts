import type { PermissionKey } from "../../permissions/model/permissions";
import type {
  BasicSettingsState,
  BrandRecord,
  CustomerSalespersonRecord,
  DefaultQuoteConfiguration,
  FabricLibraryItem,
  TrimLibraryItem,
} from "../model/basic-settings";
import type { BasicSettingsPersistResult } from "../components/basic-settings-controller";
import { browserNumberFromExactDecimal } from "../../quote-center/server/quote-server-editor-adapter";
import { canonicalDecimal } from "../../../server/quotes/decimal-projection";
import type { BrandDto, FabricDto, GlobalQuoteSettingsDto, QuoteDefaultsDto, SalespersonDto, TrimDto } from "../../../server/quote-masters/model";
import { quoteMasterServerClient, type QuoteMasterServerClient } from "./quote-master-server-client";

export type BasicSettingsServerScope = "brands" | "salespeople" | "fabrics" | "trims";

const emptyState = (): BasicSettingsState => ({
  systemDefaults: { usdCnyRate: null, markupRate: null, laborCurrency: "CNY", defaultOtherCost: null },
  brands: [], customerSalespeople: [], fabricLibrary: [], trimLibrary: [], brandAliases: [], purchasedTrimCostRules: [],
});

function numberFromDecimal(value: string | null, path: string): number | null {
  return value === null ? null : browserNumberFromExactDecimal(value, path);
}

function decimalFromNumber(value: number | null): string | null {
  return value === null ? null : canonicalDecimal(String(value));
}

function defaultsFromServer(value: QuoteDefaultsDto, path: string): DefaultQuoteConfiguration {
  return {
    defaultUsdCnyRate: numberFromDecimal(value.defaultUsdCnyRate, `${path}.defaultUsdCnyRate`),
    defaultOtherCost: value.defaultOtherCost ? { name: value.defaultOtherCost.name, amount: numberFromDecimal(value.defaultOtherCost.amount, `${path}.defaultOtherCost.amount`) } : null,
    defaultTrims: value.defaultTrims.map((trim) => ({
      id: trim.id,
      trimLibraryItemId: trim.trimLibraryItemId,
      quantity: null,
      overrideLossRate: numberFromDecimal(trim.overrideLossRate, `${path}.defaultTrims.${trim.id}.overrideLossRate`),
      overrideUnitPrice: numberFromDecimal(trim.overrideUnitPrice, `${path}.defaultTrims.${trim.id}.overrideUnitPrice`),
    })),
  };
}

function defaultsToServer(value: DefaultQuoteConfiguration) {
  return {
    defaultUsdCnyRate: decimalFromNumber(value.defaultUsdCnyRate),
    defaultOtherCost: value.defaultOtherCost ? { name: value.defaultOtherCost.name, amount: decimalFromNumber(value.defaultOtherCost.amount) } : null,
    defaultTrims: value.defaultTrims.map((trim) => ({
      trimLibraryItemId: trim.trimLibraryItemId,
      overrideLossRate: decimalFromNumber(trim.overrideLossRate),
      overrideUnitPrice: decimalFromNumber(trim.overrideUnitPrice),
    })),
  };
}

const brandFromServer = (value: BrandDto): BrandRecord => ({ id:value.id,name:value.name,status:value.status,defaults:defaultsFromServer(value.defaults,`brand.${value.id}`) });
const salespersonFromServer = (value: SalespersonDto): CustomerSalespersonRecord => ({ id:value.id,name:value.name,brandId:value.brandId,status:value.status,defaults:defaultsFromServer(value.defaults,`salesperson.${value.id}`) });
const fabricFromServer = (value: FabricDto): FabricLibraryItem => ({
  id:value.id,name:value.name,composition:value.composition,netWidthCm:numberFromDecimal(value.netWidthCm,`fabric.${value.id}.netWidthCm`),gsm:numberFromDecimal(value.gsm,`fabric.${value.id}.gsm`),defaultLossRate:numberFromDecimal(value.defaultLossRate,`fabric.${value.id}.defaultLossRate`),supplier:value.supplier,unitPrice:numberFromDecimal(value.unitPrice,`fabric.${value.id}.unitPrice`),purchaseUnit:value.purchaseUnit,createdAt:value.createdAt,updatedAt:value.updatedAt,
});
const trimFromServer = (value: TrimDto): TrimLibraryItem => ({
  id:value.id,name:value.name,specification:value.specification,supplier:value.supplier,unit:value.unit,defaultLossRate:numberFromDecimal(value.defaultLossRate,`trim.${value.id}.defaultLossRate`),unitPrice:numberFromDecimal(value.unitPrice,`trim.${value.id}.unitPrice`),createdAt:value.createdAt,updatedAt:value.updatedAt,
});

function settingsIntoState(state: BasicSettingsState, settings: GlobalQuoteSettingsDto | null): BasicSettingsState {
  if (!settings) return state;
  return { ...state, systemDefaults: {
    usdCnyRate:numberFromDecimal(settings.defaultUsdCnyRate,"settings.defaultUsdCnyRate"),
    markupRate:numberFromDecimal(settings.defaultMarkupRate,"settings.defaultMarkupRate"),
    laborCurrency:settings.defaultLaborCurrency,
    // Retained legacy global fees are no longer automatic Server Quote defaults.
    // Do not project a hidden exact decimal into this editable number-based view.
    defaultOtherCost:null,
  } };
}

function changed<T>(before: T, after: T): boolean { return JSON.stringify(before)!==JSON.stringify(after); }

export function createServerBasicSettingsAdapter(options: {
  scope: BasicSettingsServerScope;
  permissions: readonly PermissionKey[];
  client?: QuoteMasterServerClient;
}) {
  const client=options.client??quoteMasterServerClient;
  const versions={brands:new Map<string,number>(),salespeople:new Map<string,number>(),fabrics:new Map<string,number>(),trims:new Map<string,number>()};
  let supplierOptions:string[]=[];
  const can=(permission:PermissionKey)=>options.permissions.includes(permission);

  const load=async():Promise<BasicSettingsState>=>{
    const state=emptyState();
    const needBrands=options.scope==="brands"||options.scope==="salespeople";
    const needSalespeople=options.scope==="salespeople";
    const needTrims=options.scope==="brands"||options.scope==="salespeople"||options.scope==="trims";
    const [brands,salespeople,fabrics,trims,settings,suppliers]=await Promise.all([
      needBrands?client.listBrands():Promise.resolve([]),
      needSalespeople?client.listSalespeople():Promise.resolve([]),
      options.scope==="fabrics"?client.listFabrics():Promise.resolve([]),
      needTrims?client.listTrims():Promise.resolve([]),
      can("quote.view")||can("settings.global.edit")?client.getSettings():Promise.resolve(null),
      options.scope==="fabrics"||options.scope==="trims"||can("settings.trim.edit")?client.supplierSuggestions():Promise.resolve([]),
    ]);
    versions.brands=new Map(brands.map((item)=>[item.id,item.version]));
    versions.salespeople=new Map(salespeople.map((item)=>[item.id,item.version]));
    versions.fabrics=new Map(fabrics.map((item)=>[item.id,item.version]));
    versions.trims=new Map(trims.map((item)=>[item.id,item.version]));
    supplierOptions=suppliers;
    return settingsIntoState({ ...state,brands:brands.map(brandFromServer),customerSalespeople:salespeople.map(salespersonFromServer),fabricLibrary:fabrics.map(fabricFromServer),trimLibrary:trims.map(trimFromServer) },settings);
  };

  const persist=async(current:BasicSettingsState,next:BasicSettingsState):Promise<BasicSettingsPersistResult>=>{
    const deltas=[
      ...next.brands.filter((item)=>!current.brands.some((old)=>old.id===item.id)||changed(current.brands.find((old)=>old.id===item.id),item)).map((item)=>({kind:"brand" as const,item})),
      ...next.customerSalespeople.filter((item)=>!current.customerSalespeople.some((old)=>old.id===item.id)||changed(current.customerSalespeople.find((old)=>old.id===item.id),item)).map((item)=>({kind:"salesperson" as const,item})),
      ...next.fabricLibrary.filter((item)=>!current.fabricLibrary.some((old)=>old.id===item.id)||changed(current.fabricLibrary.find((old)=>old.id===item.id),item)).map((item)=>({kind:"fabric" as const,item})),
      ...next.trimLibrary.filter((item)=>!current.trimLibrary.some((old)=>old.id===item.id)||changed(current.trimLibrary.find((old)=>old.id===item.id),item)).map((item)=>({kind:"trim" as const,item})),
    ];
    if(deltas.length!==1)throw new Error("Server candidate accepts exactly one bounded master mutation");
    const delta=deltas[0];
    let state=current;let createdId:string|undefined;
    if(delta.kind==="brand"){
      const input={name:delta.item.name,status:delta.item.status,defaults:defaultsToServer(delta.item.defaults)};
      const version=versions.brands.get(delta.item.id);const saved=version===undefined?await client.createBrand(input):await client.updateBrand(delta.item.id,version,input);versions.brands.set(saved.id,saved.version);createdId=version===undefined?saved.id:undefined;
      state={...current,brands:version===undefined?[...current.brands.filter((item)=>item.id!==delta.item.id),brandFromServer(saved)]:current.brands.map((item)=>item.id===saved.id?brandFromServer(saved):item)};
    }else if(delta.kind==="salesperson"){
      const input={name:delta.item.name,brandId:delta.item.brandId,status:delta.item.status,defaults:defaultsToServer(delta.item.defaults)};
      const version=versions.salespeople.get(delta.item.id);const saved=version===undefined?await client.createSalesperson(input):await client.updateSalesperson(delta.item.id,version,input);versions.salespeople.set(saved.id,saved.version);createdId=version===undefined?saved.id:undefined;
      state={...current,customerSalespeople:version===undefined?[...current.customerSalespeople.filter((item)=>item.id!==delta.item.id),salespersonFromServer(saved)]:current.customerSalespeople.map((item)=>item.id===saved.id?salespersonFromServer(saved):item)};
    }else if(delta.kind==="fabric"){
      const input={name:delta.item.name,composition:delta.item.composition,netWidthCm:decimalFromNumber(delta.item.netWidthCm),gsm:decimalFromNumber(delta.item.gsm),defaultLossRate:decimalFromNumber(delta.item.defaultLossRate),supplier:delta.item.supplier,unitPrice:decimalFromNumber(delta.item.unitPrice),purchaseUnit:delta.item.purchaseUnit};
      const version=versions.fabrics.get(delta.item.id);const saved=version===undefined?await client.createFabric(input):await client.updateFabric(delta.item.id,version,input);versions.fabrics.set(saved.id,saved.version);createdId=version===undefined?saved.id:undefined;
      state={...current,fabricLibrary:version===undefined?[...current.fabricLibrary.filter((item)=>item.id!==delta.item.id),fabricFromServer(saved)]:current.fabricLibrary.map((item)=>item.id===saved.id?fabricFromServer(saved):item)};
    }else{
      const input={name:delta.item.name,specification:delta.item.specification,supplier:delta.item.supplier,unit:delta.item.unit,defaultLossRate:decimalFromNumber(delta.item.defaultLossRate),unitPrice:decimalFromNumber(delta.item.unitPrice)};
      const version=versions.trims.get(delta.item.id);const saved=version===undefined?await client.createTrim(input):await client.updateTrim(delta.item.id,version,input);versions.trims.set(saved.id,saved.version);createdId=version===undefined?saved.id:undefined;
      state={...current,trimLibrary:version===undefined?[...current.trimLibrary.filter((item)=>item.id!==delta.item.id),trimFromServer(saved)]:current.trimLibrary.map((item)=>item.id===saved.id?trimFromServer(saved):item)};
    }
    if(options.scope==="fabrics"||options.scope==="trims"||can("settings.trim.edit")) {
      try { supplierOptions=await client.supplierSuggestions(); } catch { /* mutation already committed; retain the last safe suggestions */ }
    }
    return {state,createdId,supplierOptions};
  };
  return {load,persist,getSupplierOptions:()=>supplierOptions};
}
