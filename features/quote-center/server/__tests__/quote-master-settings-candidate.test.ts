import assert from "node:assert/strict";
import test from "node:test";
import { createServerBasicSettingsAdapter } from "../../../basic-settings/server/server-basic-settings-adapter";
import { createServerGlobalQuoteSettingsAdapter } from "../../../basic-settings/server/server-global-quote-settings-adapter";
import { previewMasterSettingsBackup } from "../../../basic-settings/server/master-settings-backup-preview";
import { previewMasterSettingsMigration } from "../../../basic-settings/server/master-settings-migration-preview";
import type { QuoteMasterServerClient } from "../../../basic-settings/server/quote-master-server-client";
import { activeManufacturingPresets, applySystemDefaultsToNewQuoteRevision, normalizeGlobalQuoteSettings, setManufacturingPresetStatus } from "../../model/quote-settings";

const time="2026-09-21T00:00:00.000Z";
const emptyClient=():QuoteMasterServerClient=>({
  listBrands:async()=>[],createBrand:async()=>{throw new Error("unused");},updateBrand:async()=>{throw new Error("unused");},
  listSalespeople:async()=>[],createSalesperson:async()=>{throw new Error("unused");},updateSalesperson:async()=>{throw new Error("unused");},
  listFabrics:async()=>[],createFabric:async()=>{throw new Error("unused");},updateFabric:async()=>{throw new Error("unused");},
  listTrims:async()=>[],createTrim:async()=>{throw new Error("unused");},updateTrim:async()=>{throw new Error("unused");},supplierSuggestions:async()=>[],
  getSettings:async()=>null,listPresets:async()=>[],resolveDefaults:async()=>{throw new Error("unused");},saveSettingsBundle:async()=>{throw new Error("unused");},
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

test("hidden legacy supplements preserve raw decimal DTO across a visible settings save without being applied or rounded",async()=>{
  const client=emptyClient();
  const settings={defaultUsdCnyRate:null,defaultMarkupRate:null,defaultLaborCurrency:"CNY" as const,defaultLaborDescription:"Legacy retained",defaultOtherCost:{name:"Legacy exact",amount:"9.1234567890123456789"},defaultManufacturingPresetId:null,version:3,createdAt:time,updatedAt:time};
  client.getSettings=async()=>settings;
  client.saveSettingsBundle=async(input)=>{
    assert.deepEqual(input.settings.defaultOtherCost,settings.defaultOtherCost);
    assert.equal(input.settings.defaultLaborDescription,settings.defaultLaborDescription);
    assert.equal(input.expectedVersion,3);
    return {settings:{...settings,version:4},manufacturingPresets:[],createdPresetIds:{}};
  };
  const adapter=createServerGlobalQuoteSettingsAdapter(client),loaded=await adapter.load();
  assert.equal(loaded.defaultOtherCost,null);assert.equal(loaded.defaultLaborDescription,"");
  await adapter.save({...loaded,defaultQuoteType:"processing"});
  const basic=await createServerBasicSettingsAdapter({scope:"brands",permissions:["quote.view"],client}).load();
  assert.equal(basic.systemDefaults.defaultOtherCost,null,"hidden legacy decimal cannot block master loading or become a default");
});

test("inactive manufacturing defaults fail safe and status toggles never restore a default implicitly",async()=>{
  const normalized=normalizeGlobalQuoteSettings({
    defaultManufacturingPresetId:"inactive",
    manufacturingPresets:[
      {id:"active",name:"Active",country:"中国",laborCurrency:"CNY",markupRate:0,includeFreight:false,freightName:"运费",freightAmount:null,status:"active"},
      {id:"inactive",name:"Inactive",country:"越南",laborCurrency:"USD",markupRate:null,includeFreight:false,freightName:"运费",freightAmount:null,status:"inactive"},
    ],
  });
  assert.equal(normalized.defaultManufacturingPresetId,null);
  assert.deepEqual(activeManufacturingPresets(normalized).map((preset)=>preset.id),["active"]);

  const defaulted={...normalized,defaultManufacturingPresetId:"active"};
  const deactivated=setManufacturingPresetStatus(defaulted,"active","inactive");
  assert.equal(deactivated.defaultManufacturingPresetId,null);
  const reactivated=setManufacturingPresetStatus(deactivated,"active","active");
  assert.equal(reactivated.defaultManufacturingPresetId,null);

  const revision={priceVersions:[{id:"version",pricingParameters:{manufacturingCountry:"",manufacturingPresetId:null,manufacturingPresetName:"",laborCurrency:"CNY",usdCnyRate:null,markupRate:null,includeFreight:false,freightName:"运费",freightAmount:null},labor:{description:""},otherCosts:[]}]} as unknown as Parameters<typeof applySystemDefaultsToNewQuoteRevision>[0];
  const unsafeSettings={...normalized,defaultManufacturingPresetId:"inactive"};
  const initialized=applySystemDefaultsToNewQuoteRevision(revision,unsafeSettings,"new");
  assert.equal(initialized.priceVersions[0].pricingParameters.manufacturingPresetId,null);

  const client=emptyClient();
  client.getSettings=async()=>({defaultUsdCnyRate:null,defaultMarkupRate:null,defaultLaborCurrency:"CNY",defaultLaborDescription:"",defaultOtherCost:null,defaultManufacturingPresetId:"inactive",version:1,createdAt:time,updatedAt:time});
  client.listPresets=async()=>[{id:"inactive",name:"Inactive",country:"越南",laborCurrency:"USD",markupRate:null,includeFreight:false,freightName:"运费",freightAmount:null,status:"inactive",version:1,createdAt:time,updatedAt:time}];
  assert.equal((await createServerGlobalQuoteSettingsAdapter(client).load()).defaultManufacturingPresetId,null);
});

test("pure migration preview reports blockers, preserves duplicate materials and drops legacy trim quantity/usage",()=>{
  const preview=previewMasterSettingsMigration({basicSettings:{
    brands:[{id:"brand-a",name:"ＡＣＭＥ",defaults:{defaultUsdCnyRate:null,defaultTrims:[{id:"dt",trimLibraryItemId:"missing",quantity:2,usage:3,overrideLossRate:null,overrideUnitPrice:0}],costs:[{name:"first",amount:0,enabled:true},{name:"second",amount:2,enabled:true}] }},{id:"brand-b",name:"acme",defaults:{defaultTrims:[]}}],
    customerSalespeople:[{id:"sales-a",name:"林",brandId:"missing-brand",defaults:{defaultTrims:[]}},{id:"sales-b",name:" 林 ",brandId:"brand-a",defaults:{defaultTrims:[]}}],
    fabricLibrary:[{id:"fabric-a",name:"同名"},{id:"fabric-a",name:"同名"}],trimLibrary:[{id:"trim-a",name:"同名"},{id:"trim-b",name:"同名"}],systemDefaults:{usdCnyRate:0},
  },globalQuoteSettings:{manufacturingPresets:[],defaultManufacturingPresetId:"missing",costs:[{name:"disabled",amount:1,enabled:false},{name:"valid",amount:0,enabled:true}]}});
  assert.equal(preview.sourceCounts.fabrics,2);assert.equal(preview.projectedCounts.trims,2);
  assert.equal(preview.duplicateNormalizedBrandNames.length,1);assert.equal(preview.duplicateNormalizedSalespersonNames.length,1);
  assert.deepEqual(preview.duplicateStableIds,["fabric:fabric-a"]);
  assert.equal(preview.missingBrandReferences.length,1);assert.equal(preview.missingTrimReferences.length,1);
  assert.equal(preview.discardedLegacyDefaultTrimQuantityCount,1);assert.equal(preview.discardedLegacyDefaultTrimUsageCount,1);assert.equal(preview.legacyMultipleDefaultCostCollapseCount,1);
  assert.equal(preview.duplicateFabricNameGroups.length,1);assert.equal(preview.duplicateTrimNameGroups.length,1);assert.equal(preview.supplierMasterRows,0);
  assert.ok(preview.blockingErrors.includes("defaultManufacturingPresetId does not reference a projected preset"));
  const projectedTrim=((preview.projection.basicSettings.brands[0].defaults as Record<string,unknown>).defaultTrims as Array<Record<string,unknown>>)[0];
  assert.equal(Object.hasOwn(projectedTrim,"quantity"),false);assert.equal(Object.hasOwn(projectedTrim,"usage"),false);assert.equal(projectedTrim.overrideUnitPrice,"0");
  assert.equal((preview.projection.basicSettings.systemDefaults as Record<string,unknown>).usdCnyRate,"0");
  assert.equal((preview.projection.basicSettings.brands[0].defaults as Record<string,unknown>).defaultUsdCnyRate,null);
  assert.ok(preview.zeroDecimalValuesPreserved>=2);assert.ok(preview.nullDecimalValuesPreserved>=1);
  assert.equal(preview.projectedServerRows.total,10);
});

test("migration preview reports absent manufacturing preset configuration without inventing it",()=>{
  const preview=previewMasterSettingsMigration({basicSettings:{brands:[],customerSalespeople:[],fabricLibrary:[],trimLibrary:[]},globalQuoteSettings:null});
  assert.equal(preview.projectedCounts.manufacturingPresets,0);
  assert.ok(preview.warnings.includes("Manufacturing preset configuration is absent"));
  assert.equal(preview.projection.globalQuoteSettings?.manufacturingPresets,undefined);
});

test("migration preview clears an inactive referenced default without treating it as missing",()=>{
  const preview=previewMasterSettingsMigration({
    basicSettings:{brands:[],customerSalespeople:[],fabricLibrary:[],trimLibrary:[]},
    globalQuoteSettings:{
      manufacturingPresets:[{id:"inactive",name:"Inactive",status:"inactive"}],
      defaultManufacturingPresetId:"inactive",
    },
  });
  assert.equal(preview.projection.globalQuoteSettings?.defaultManufacturingPresetId,null);
  assert.equal(preview.inactiveManufacturingPresetDefault,"inactive");
  assert.ok(preview.warnings.includes("Default manufacturing preset references an inactive preset and will be cleared under D-090"));
  assert.ok(!preview.blockingErrors.includes("defaultManufacturingPresetId does not reference a projected preset"));
});

const backupFixture=(options:{schemaVersion?:number;createdAt?:string;basic?:Record<string,unknown>;global?:Record<string,unknown>;legacyUnwrapped?:boolean}={})=>{
  const namespace="zhixu.erp.synthetic-q3b2a";
  const schemaVersion=options.schemaVersion??13;
  const envelope=(data:Record<string,unknown>)=>options.legacyUnwrapped?data:{schemaVersion,initializedAt:"2026-09-01T00:00:00.000Z",updatedAt:"2026-09-20T00:00:00.000Z",data};
  return {
    product:"zhixu-erp",backupVersion:1,schemaVersion:13,createdAt:options.createdAt??"2026-09-22T00:00:00.000Z",environment:"production",origin:"http://127.0.0.1:3001",namespace,
    localRecords:{
      [`${namespace}.basic-settings`]:JSON.stringify(envelope(options.basic??{brands:[],customerSalespeople:[],fabricLibrary:[],trimLibrary:[],systemDefaults:{usdCnyRate:null,markupRate:0,defaultOtherCost:null}})),
      [`${namespace}.quote-global-settings`]:JSON.stringify(envelope(options.global??{defaultUsdCnyRate:null,defaultMarkupRate:0,defaultOtherCost:null,defaultManufacturingPresetId:null,manufacturingPresets:[]})),
      [`${namespace}.quote-preferences.user`]:JSON.stringify({schemaVersion:13,data:{visibleColumns:["name"]}}),
    },attachments:[],templates:[],styleProgress:{},
  };
};

test("backup preview accepts current envelopes, excludes preferences and is deterministic across capture timestamps",async()=>{
  const first=await previewMasterSettingsBackup(backupFixture());
  const second=await previewMasterSettingsBackup(backupFixture({createdAt:"2026-09-23T12:34:56.000Z"}));
  assert.equal(first.sourceHash,second.sourceHash);
  assert.equal(first.sourceRecords.basicSettings.storageKey,"zhixu.erp.synthetic-q3b2a.basic-settings");
  assert.equal(first.sourceRecords.basicSettings.format,"current-envelope");
  assert.equal(first.excludedRecordCount,1);assert.equal(first.databaseReads,0);assert.equal(first.databaseWrites,0);assert.equal(first.browserWrites,0);
  assert.deepEqual(first.preview.sourceCounts,{brands:0,customerSalespeople:0,fabrics:0,trims:0,manufacturingPresets:0,brandDefaultTrims:0,salespersonDefaultTrims:0});
  assert.equal(first.preview.blockingErrors.length,0);
});

test("backup preview accepts supported legacy and unwrapped envelopes without changing business identity",async()=>{
  const legacy=await previewMasterSettingsBackup(backupFixture({schemaVersion:12}));
  const unwrapped=await previewMasterSettingsBackup(backupFixture({legacyUnwrapped:true}));
  assert.equal(legacy.sourceRecords.basicSettings.format,"legacy-envelope");
  assert.equal(legacy.sourceRecords.basicSettings.schemaVersion,12);
  assert.equal(unwrapped.sourceRecords.globalQuoteSettings.format,"legacy-unwrapped");
  assert.equal(legacy.preview.blockingErrors.length,0);assert.equal(unwrapped.preview.blockingErrors.length,0);
});

test("migration preview preserves exact decimals/null/zero and blocks invalid decimals and scoped IDs",()=>{
  const preview=previewMasterSettingsMigration({
    basicSettings:{
      brands:[{id:"b",name:"B",defaults:{defaultUsdCnyRate:0,defaultTrims:[{id:"same",trimLibraryItemId:"t",overrideLossRate:0.125,overrideUnitPrice:null},{id:"same",trimLibraryItemId:"t",overrideLossRate:null,overrideUnitPrice:1e-7}],defaultOtherCost:{name:"fee",amount:0}}}],
      customerSalespeople:[],
      fabricLibrary:[{id:"f",name:"Fabric",netWidthCm:1e-7,gsm:null,defaultLossRate:-1,unitPrice:0}],
      trimLibrary:[{id:"t",name:"Trim",defaultLossRate:null,unitPrice:0}],
      systemDefaults:{usdCnyRate:null,markupRate:0,defaultOtherCost:null},
    },
    globalQuoteSettings:{defaultUsdCnyRate:null,defaultMarkupRate:0,defaultOtherCost:null,defaultManufacturingPresetId:null,manufacturingPresets:[]},
  });
  const fabric=preview.projection.basicSettings.fabricLibrary[0];
  assert.equal(fabric.netWidthCm,"0.0000001");assert.equal(fabric.gsm,null);assert.equal(fabric.unitPrice,"0");
  assert.equal(preview.invalidNumericValues.length,1);assert.ok(preview.blockingErrors.includes("Invalid decimal values"));
  assert.deepEqual(preview.scopedIdentityCollisions,[{scope:"brandDefaultTrim",ownerId:"b",id:"same",count:2}]);
  assert.ok(preview.blockingErrors.includes("Duplicate scoped stable IDs"));
});

test("backup preview blocks forbidden credential/session fields in selected source only",async()=>{
  const report=await previewMasterSettingsBackup(backupFixture({basic:{brands:[],customerSalespeople:[],fabricLibrary:[],trimLibrary:[],systemDefaults:{sessionToken:"forbidden"}}}));
  assert.deepEqual(report.sensitiveFieldPaths,["source.basicSettings.systemDefaults.sessionToken"]);
  assert.ok(report.preview.blockingErrors.includes("Master/settings source contains forbidden credential/session fields"));
});
