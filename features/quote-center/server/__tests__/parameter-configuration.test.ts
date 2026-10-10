import test from "node:test";
import assert from "node:assert/strict";
import { parameterConfigurationIsComplete } from "../../model/parameter-configuration.js";
const snapshot = {manufacturingCountry:"Synthetic",manufacturingPresetId:"preset",markupRate:0,laborCurrency:"CNY",usdCnyRate:null,includeFreight:false,freightName:"",freightAmount:null};
test("configuration displays current valid legacy/selected preset snapshots without changing them",()=>{
  const before=structuredClone(snapshot);assert.equal(parameterConfigurationIsComplete(snapshot),true);assert.deepEqual(snapshot,before);
  assert.equal(parameterConfigurationIsComplete({...snapshot,markupRate:null}),false);
  assert.equal(parameterConfigurationIsComplete({...snapshot,manufacturingCountry:""}),false);
});
test("technical currency and unset freight are not silently confirmed; exact/null/zero stay distinct",()=>{
  assert.equal(parameterConfigurationIsComplete({...snapshot,manufacturingPresetId:null}),false);
  assert.equal(parameterConfigurationIsComplete({...snapshot,configuration:{sources:[{field:"laborCurrency",source:"technical_default"},{field:"freight",source:"preset"}]}}),false);
  assert.equal(parameterConfigurationIsComplete({...snapshot,laborCurrency:"USD",usdCnyRate:"0",includeFreight:true,freightName:"Synthetic",freightAmount:"0"}),true);
  assert.equal(parameterConfigurationIsComplete({...snapshot,laborCurrency:"USD",usdCnyRate:null}),false);
});
