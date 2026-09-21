import assert from "node:assert/strict";
import test from "node:test";
import { createServerBasicSettingsAdapter } from "../../../basic-settings/server/server-basic-settings-adapter";
import { createServerGlobalQuoteSettingsAdapter } from "../../../basic-settings/server/server-global-quote-settings-adapter";
import { previewMasterSettingsMigration } from "../../../basic-settings/server/master-settings-migration-preview";
import type { QuoteMasterServerClient } from "../../../basic-settings/server/quote-master-server-client";

const time="2026-09-21T00:00:00.000Z";
const emptyClient=():QuoteMasterServerClient=>({
  listBrands:async()=>[],createBrand:async()=>{throw new Error("unused");},updateBrand:async()=>{throw new Error("unused");},
  listSalespeople:async()=>[],createSalesperson:async()=>{throw new Error("unused");},updateSalesperson:async()=>{throw new Error("unused");},
  listFabrics:async()=>[],createFabric:async()=>{throw new Error("unused");},updateFabric:async()=>{throw new Error("unused");},
  listTrims:async()=>[],createTrim:async()=>{throw new Error("unused");},updateTrim:async()=>{throw new Error("unused");},supplierSuggestions:async()=>[],
  getSettings:async()=>null,listPresets:async()=>[],saveSettingsBundle:async()=>{throw new Error("unused");},
});

test("Server basic-settings adapter preserves null/zero, gets Server IDs and omits legacy quantity",async()=>{
  let sent:unknown;
  const client=emptyClient();
  client.listTrims=async()=>[{id:"trim-existing",name:"主唛",specification:"",supplier:"自由文本",unit:"枚",defaultLossRate:null,unitPrice:"0",version:2,createdAt:time,updatedAt:time}];
  client.supplierSuggestions=async()=>["自由文本"];
  client.createTrim=async(input)=>{sent=input;return{id:"11111111-1111-4111-8111-111111111111",...input,version:0,createdAt:time,updatedAt:time};};
  const adapter=createServerBasicSettingsAdapter({scope:"trims",permissions:["settings.trim.edit"],client});
  const state=await adapter.load();
  assert.equal(state.trimLibrary[0].defaultLossRate,null);assert.equal(state.trimLibrary[0].unitPrice,0);
  const temporary={...state.trimLibrary[0],id:"trim-browser-temporary",name:"洗标",defaultLossRate:0,unitPrice:null};
  const saved=await adapter.persist(state,{...state,trimLibrary:[...state.trimLibrary,temporary]});
  assert.equal(saved.createdId,"11111111-1111-4111-8111-111111111111");
  assert.deepEqual(sent,{name:"洗标",specification:"",supplier:"自由文本",unit:"枚",defaultLossRate:"0",unitPrice:null});
  assert.equal(Object.hasOwn(sent as object,"quantity"),false);
});

test("Server decimal projection fails closed when the accepted UI number cannot round-trip",async()=>{
  const client=emptyClient();
  client.listFabrics=async()=>[{id:"unsafe",name:"Unsafe",composition:"",netWidthCm:"9007199254740993",gsm:null,defaultLossRate:null,supplier:"",unitPrice:null,purchaseUnit:"kg",version:0,createdAt:time,updatedAt:time}];
  const adapter=createServerBasicSettingsAdapter({scope:"fabrics",permissions:["settings.fabric.edit"],client});
  await assert.rejects(()=>adapter.load(),(error:unknown)=>error instanceof Error&&error.name==="UnsafeServerQuoteDecimalError");
});

test("Global settings adapter submits one atomic bundle and receives Server preset UUID",async()=>{
  let submitted:Parameters<QuoteMasterServerClient["saveSettingsBundle"]>[0]|undefined;
  const client=emptyClient();
  client.getSettings=async()=>({defaultUsdCnyRate:null,defaultMarkupRate:"0",defaultLaborCurrency:"CNY",defaultLaborDescription:"",defaultOtherCost:null,defaultManufacturingPresetId:null,version:3,createdAt:time,updatedAt:time});
  client.listPresets=async()=>[];
  client.saveSettingsBundle=async(input)=>{
    submitted=input;
    return {settings:{defaultUsdCnyRate:null,defaultMarkupRate:"0",defaultLaborCurrency:"CNY",defaultLaborDescription:"",defaultOtherCost:null,defaultManufacturingPresetId:"22222222-2222-4222-8222-222222222222",version:4,createdAt:time,updatedAt:time},manufacturingPresets:[{id:"22222222-2222-4222-8222-222222222222",name:"中国",country:"中国",laborCurrency:"CNY",markupRate:"0",includeFreight:false,freightName:"运费",freightAmount:null,status:"active",version:0,createdAt:time,updatedAt:time}],createdPresetIds:{temporary:"22222222-2222-4222-8222-222222222222"}};
  };
  const adapter=createServerGlobalQuoteSettingsAdapter(client);
  const loaded=await adapter.load();
  const saved=await adapter.save({...loaded,defaultManufacturingPresetId:"temporary",manufacturingPresets:[{id:"temporary",name:"中国",country:"中国",laborCurrency:"CNY",markupRate:0,includeFreight:false,freightName:"运费",freightAmount:null,status:"active"}]});
  assert.equal(submitted?.expectedVersion,3);
  assert.equal("clientId" in submitted!.manufacturingPresets[0],true);
  assert.equal(saved.defaultManufacturingPresetId,"22222222-2222-4222-8222-222222222222");
  assert.equal(saved.manufacturingPresets[0].id,"22222222-2222-4222-8222-222222222222");
  assert.equal(saved.defaultMarkupRate,0);
});

test("pure migration preview reports blockers, preserves duplicate materials and drops legacy trim quantity",()=>{
  const preview=previewMasterSettingsMigration({basicSettings:{
    brands:[{id:"brand-a",name:"ＡＣＭＥ",defaults:{defaultUsdCnyRate:null,defaultTrims:[{id:"dt",trimLibraryItemId:"missing",quantity:2,overrideLossRate:null,overrideUnitPrice:0}],costs:[{name:"first",amount:0,enabled:true},{name:"second",amount:2,enabled:true}] }},{id:"brand-b",name:"acme",defaults:{defaultTrims:[]}}],
    customerSalespeople:[{id:"sales-a",name:"林",brandId:"missing-brand",defaults:{defaultTrims:[]}},{id:"sales-b",name:" 林 ",brandId:"brand-a",defaults:{defaultTrims:[]}}],
    fabricLibrary:[{id:"fabric-a",name:"同名"},{id:"fabric-a",name:"同名"}],trimLibrary:[{id:"trim-a",name:"同名"},{id:"trim-b",name:"同名"}],systemDefaults:{usdCnyRate:0},
  },globalQuoteSettings:{manufacturingPresets:[],defaultManufacturingPresetId:"missing",costs:[{name:"disabled",amount:1,enabled:false},{name:"valid",amount:0,enabled:true}]}});
  assert.equal(preview.sourceCounts.fabrics,2);assert.equal(preview.projectedCounts.trims,2);
  assert.equal(preview.duplicateNormalizedBrandNames.length,1);assert.equal(preview.duplicateNormalizedSalespersonNames.length,1);
  assert.deepEqual(preview.duplicateStableIds,["fabric:fabric-a"]);
  assert.equal(preview.missingBrandReferences.length,1);assert.equal(preview.missingTrimReferences.length,1);
  assert.equal(preview.discardedLegacyDefaultTrimQuantityCount,1);assert.equal(preview.legacyMultipleDefaultCostCollapseCount,1);
  assert.ok(preview.blockingErrors.includes("defaultManufacturingPresetId does not reference a projected preset"));
  const projectedTrim=((preview.projection.basicSettings.brands[0].defaults as Record<string,unknown>).defaultTrims as Array<Record<string,unknown>>)[0];
  assert.equal(Object.hasOwn(projectedTrim,"quantity"),false);assert.equal(projectedTrim.overrideUnitPrice,0);
  assert.equal((preview.projection.basicSettings.systemDefaults as Record<string,unknown>).usdCnyRate,0);
  assert.equal((preview.projection.basicSettings.brands[0].defaults as Record<string,unknown>).defaultUsdCnyRate,null);
});

test("migration preview reports absent manufacturing preset configuration without inventing it",()=>{
  const preview=previewMasterSettingsMigration({basicSettings:{brands:[],customerSalespeople:[],fabricLibrary:[],trimLibrary:[]},globalQuoteSettings:null});
  assert.equal(preview.projectedCounts.manufacturingPresets,0);
  assert.ok(preview.warnings.includes("Manufacturing preset configuration is absent"));
  assert.equal(preview.projection.globalQuoteSettings?.manufacturingPresets,undefined);
});
