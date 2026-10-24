import assert from "node:assert/strict";
import test from "node:test";
import { projectColorSizeEvidence, projectColorSourceEvidence, type OrderSourceEvidenceContext } from "./source-evidence.js";

const context: OrderSourceEvidenceContext = { businessType: "ainuoke_contract", trustedSource: true, salesContractNo: "PI-SYNTHETIC-001" };
const metadata = () => ({ reportId: "6087105", salesContractNo: context.salesContractNo,
  quantityPendingConfirmation: false, sourceQuantity: 10, insideOrderNoDrift: false,
  sizeRule: "S,,L", sizeAllocations: [{slot: 1, sizeName: "S", quantity: 4}, {slot: 3, sizeName: "L", quantity: 6}],
  sizeMatrixStatus: "SIZE_MATRIX_VALID" });
const project = (value: unknown, quantity = 10, scope = context) => projectColorSizeEvidence(value, quantity, scope);

test("saved size projection retains gaps, explicit zero, duplicate labels and null", () => {
  const input = metadata();
  const result = project(input);
  assert.equal(result.status, "available");
  if (result.status !== "available") throw Error("missing evidence");
  assert.deepEqual(result.allocations, input.sizeAllocations);
  assert.equal(result.sourceQuantity, 10);
  const duplicate = {...input, sizeRule: "M,M,L", sizeAllocations: [
    {slot: 1, sizeName: "M", quantity: 0}, {slot: 2, sizeName: "M", quantity: null}, {slot: 3, sizeName: "L", quantity: 10},
  ]};
  const projected = project(duplicate);
  assert.equal(projected.status, "available");
  if (projected.status === "available") assert.deepEqual(projected.allocations, duplicate.sizeAllocations);
  assert.deepEqual(input, metadata());
});

test("pending source null and confirmed zero remain distinct, never inferred from a matrix sum", () => {
  const pending = {...metadata(), sourceQuantity: null, quantityPendingConfirmation: true,
    sizeAllocations: [{slot:1,sizeName:"S",quantity:null},{slot:3,sizeName:"L",quantity:null}],
    sizeMatrixStatus: "ZERO_QUANTITY_WITHOUT_SIZE"};
  const pendingResult = project(pending, 0);
  assert.equal(pendingResult.status, "available");
  if (pendingResult.status === "available") { assert.equal(pendingResult.sourceQuantity,null); assert.equal(pendingResult.quantityPendingConfirmation,true); }
  const zero = {...pending, sourceQuantity: 0, quantityPendingConfirmation: false};
  const result = project(zero, 0);
  assert.equal(result.status, "available");
  if (result.status === "available") { assert.equal(result.sourceQuantity, 0); assert.equal(result.quantityPendingConfirmation, false); }
  for (const value of [{...pending, sourceQuantity:0}, {...pending,sizeAllocations:[{slot:1,sizeName:"S",quantity:0},{slot:3,sizeName:"L",quantity:null}]}])
    assert.deepEqual(project(value,0), {status:"invalid",reason:"malformed_evidence"});
  assert.deepEqual(project(pending,1), {status:"invalid",reason:"malformed_evidence"});
});

test("business matrix anomalies stay recorded without recomputing incomplete raw facts", () => {
  for (const matrix of ["SIZE_MATRIX_QUANTITY_MISMATCH", "SIZE_MATRIX_MISSING", "SIZE_RULE_MISSING", "ZERO_QUANTITY_WITH_SIZE", "ZERO_QUANTITY_WITHOUT_SIZE"] as const) {
    const result = project({...metadata(), sizeMatrixStatus:matrix});
    assert.equal(result.status,"available");
    if (result.status === "available") assert.equal(result.matrixStatus, matrix);
  }
  const names = Array.from({length:28},(_,i)=>"SIZE"+(i+1));
  const value = {...metadata(),sizeRule:names.join(","),sizeAllocations:names.map((name,i)=>({slot:i+1,sizeName:name,quantity:i<26?0:null})),sizeMatrixStatus:"SIZE_MATRIX_RULE_OVERFLOW"};
  const result = project(value);
  assert.equal(result.status,"available");
  if (result.status === "available") { assert.equal(result.allocations.length,28); assert.deepEqual(result.allocations.at(-1),{slot:28,sizeName:"SIZE28",quantity:null}); }
});

test("legacy absence, untrusted identity and processing are explicit and contain no inferred sizes", () => {
  for (const value of [undefined,null,{}, {legacy:true,secretPrice:99}]) assert.deepEqual(project(value),{status:"not_recorded"});
  assert.deepEqual(project(metadata(),10,{...context,trustedSource:false}),{status:"invalid",reason:"untrusted_source"});
  assert.deepEqual(project(metadata(),10,{...context,businessType:"unclassified"}),{status:"invalid",reason:"untrusted_source"});
  assert.deepEqual(project(metadata(),10,{...context,businessType:"processing"}),{status:"not_applicable"});
  assert.deepEqual(project({...metadata(),reportId:"6086997"}),{status:"invalid",reason:"unsupported_report"});
  assert.deepEqual(project({...metadata(),salesContractNo:"PI-OTHER"}),{status:"invalid",reason:"contract_mismatch"});
  const result=project({...metadata(),salesContractNo:"ＰＩ- synthetic-001"});
  assert.equal(result.status,"available");
});

test("malformed saved structures fail closed while preserved source quantities remain outside the evidence DTO", () => {
  const cases: unknown[] = [[],"raw", {...metadata(),quantityPendingConfirmation:"false"}, {...metadata(),sourceQuantity:null},
    {...metadata(),insideOrderNoDrift:undefined}, {...metadata(),sizeMatrixStatus:"FUTURE"}, {...metadata(),sizeRule:7},
    {...metadata(),sizeAllocations:{}}, {...metadata(),sizeAllocations:[{slot:1,sizeName:"S",quantity:-1},{slot:3,sizeName:"L",quantity:6}]},
    {...metadata(),sizeAllocations:[{slot:1,sizeName:"S",quantity:NaN},{slot:3,sizeName:"L",quantity:6}]},
    {...metadata(),sizeAllocations:[{slot:1,sizeName:"S",quantity:"4"},{slot:3,sizeName:"L",quantity:6}]},
    {...metadata(),sizeAllocations:[{slot:3,sizeName:"L",quantity:6},{slot:1,sizeName:"S",quantity:4}]},
    {...metadata(),sizeAllocations:[{slot:1,sizeName:"S",quantity:4},{slot:1,sizeName:"L",quantity:6}]},
    {...metadata(),sizeAllocations:[{slot:1,sizeName:"S",quantity:4},{slot:3,sizeName:"wrong",quantity:6}]}];
  for (const value of cases) assert.deepEqual(project(value),{status:"invalid",reason:"malformed_evidence"});
  assert.deepEqual(project(metadata(),11),{status:"invalid",reason:"quantity_changed"});
});

test("projection budgets refuse oversized evidence without truncation or dropping a color", () => {
  assert.deepEqual(project({...metadata(),sizeRule:"S".repeat(16385)}),{status:"invalid",reason:"evidence_too_large"});
  assert.deepEqual(project({...metadata(),sizeAllocations:Array(1025).fill({slot:1,sizeName:"S",quantity:0})}),{status:"invalid",reason:"evidence_too_large"});
  assert.deepEqual(project({...metadata(),sizeRule:Array(1025).fill("S").join(",")}),{status:"invalid",reason:"evidence_too_large"});
  assert.deepEqual(project({...metadata(),sizeRule:"S".repeat(1025),sizeAllocations:[{slot:1,sizeName:"S".repeat(1025),quantity:10}]}),{status:"invalid",reason:"evidence_too_large"});
});

test("unknown metadata, nested prices and source hashes never leave the allowlist", () => {
  const value = {...metadata(),secret:"private",price:123,sourceHash:"private-hash",raw:{password:"private"},
    sizeAllocations:metadata().sizeAllocations.map(row=>({...row,salePrice:999}))};
  const result=project(value);
  assert.deepEqual(result,project(metadata()));
  assert.doesNotMatch(JSON.stringify(result),/private|salePrice|sourceHash|password/);
});

test("saved color summary distinguishes source missing/invalid/usable from unrecorded and never invents freshness", () => {
  const stamp="2026-10-01T08:30:00.000Z";
  for (const status of ["missing","invalid","usable"]) {
    assert.deepEqual(projectColorSourceEvidence({schemaVersion:"ainuoke-garment-color-size.v1",reportId:"6087105",status,insideOrderNoDrift:true,sourceHash:"private",sizeEvidence:["raw"]},stamp,context),
      {status:"recorded",reportId:"6087105",colorDetailStatus:status,insideOrderNoDrift:true,savedSourceBatchAt:stamp});
  }
  assert.deepEqual(projectColorSourceEvidence(null,stamp,context),{status:"not_recorded"});
  assert.deepEqual(projectColorSourceEvidence({},stamp,context),{status:"invalid",reason:"unsupported_report"});
  assert.deepEqual(projectColorSourceEvidence(null,stamp,{...context,businessType:"processing"}),{status:"not_applicable"});
  assert.deepEqual(projectColorSourceEvidence(null,stamp,{...context,trustedSource:false}),{status:"invalid",reason:"untrusted_source"});
  for (const status of [["usable"],{status:"usable"},null,0])
    assert.deepEqual(projectColorSourceEvidence({schemaVersion:"ainuoke-garment-color-size.v1",reportId:"6087105",status,insideOrderNoDrift:false},stamp,context),{status:"invalid",reason:"malformed_evidence"});
});
