import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogDiagnosticValidationError, validateCatalogDiagnostic, retryDelayMs, retryableCapture, validateRequestDiagnostics, diagnosticSummary, finishCaptureAttempt, type RequestDiagnostic } from './sync-diagnostics.js';
import { selectedConfig } from '../integration/selected-source-fixture.js';

const timeout:RequestDiagnostic={kind:'report',reportId:6087105,page:1,elapsedMs:45015,outcome:'timeout',httpStatus:null};
test('queue retries are bounded and only recover known transient reads',()=>{
 assert.equal(retryDelayMs(1),60000);assert.equal(retryDelayMs(2),300000);assert.equal(retryDelayMs(3),null);
 assert.equal(retryableCapture('source_unavailable',[timeout]),true);
 assert.equal(retryableCapture('source_unavailable',[{...timeout,outcome:'http_error',httpStatus:503}]),true);
 assert.equal(retryableCapture('source_unavailable',[{...timeout,outcome:'http_error',httpStatus:429}]),true);
 for(const code of ['auth_expired','invalid_credential','source_account_mismatch','selected_source_invalid','sync_result_unknown'])assert.equal(retryableCapture(code,[timeout]),false);
 for(const outcome of ['tls_error','auth_error','schema_error','unknown_error'])assert.equal(retryableCapture('source_unavailable',[{...timeout,outcome}]),false);
 assert.equal(retryableCapture('source_unavailable',null),false);
});

test('rejected payload retains only whitelisted trace, never raw credentials or unverified metrics',async()=>{
 const request={mode:'catalog-discovery' as const,contracts:[] as []};
 const raw={schemaVersion:'ainuoke-request-diagnostics.v1',capture:{password:selectedConfig.password},requests:[timeout]};
 await assert.rejects(validateCatalogDiagnostic(raw,selectedConfig,request,Date.now()),error=>{
  assert.ok(error instanceof CatalogDiagnosticValidationError);
  assert.equal(error.code,'source_secret_field');assert.deepEqual(error.diagnostics,[timeout]);
  assert.equal(JSON.stringify(error).includes(selectedConfig.password),false);
  assert.equal('metrics' in error,false);assert.equal('capture' in error,false);
  assert.equal(retryableCapture(error.code,error.diagnostics),false);return true;
 });
 await assert.rejects(validateCatalogDiagnostic({...raw,requests:[{...timeout,password:'private'}]},selectedConfig,request,Date.now()),error=>{
  assert.ok(error instanceof Error);assert.equal(error.message,'sync_diagnostics_invalid');
  assert.equal(error instanceof CatalogDiagnosticValidationError,false);return true;
 });
});
test('diagnostic storage is a closed whitelist, never arbitrary error text or credentials',()=>{
 assert.deepEqual(validateRequestDiagnostics([timeout]),[timeout]);
 for(const bad of [{...timeout,url:'https://private'},{...timeout,outcome:'secret password'}, {...timeout,reportId:'6087105'}, {...timeout,page:0}, {...timeout,httpStatus:900}])assert.throws(()=>validateRequestDiagnostics([bad]),/sync_diagnostics_invalid/);
 assert.throws(()=>validateRequestDiagnostics(Array(82).fill(timeout)),/sync_diagnostics_invalid/);
});

test('login evidence is optional for old receipts and strictly closed for new collector traces',()=>{
 const login:RequestDiagnostic={kind:'login',reportId:null,page:null,elapsedMs:303,outcome:'auth_error',httpStatus:200,
  loginEvidence:{responseShape:'data_object',result:'rejected',serverCode:'cover_confirmation',serverHint:'cover_confirmation_required'}};
 assert.deepEqual(validateRequestDiagnostics([login]),[login]);
 assert.equal(retryableCapture('invalid_credential',[login]),false);
 for(const bad of [{...login,kind:'report'}, {...login,loginEvidence:{...login.loginEvidence,raw:'private'}},
  {...login,loginEvidence:{...login.loginEvidence,serverHint:'private message'}}, {...login,loginEvidence:{...login.loginEvidence,serverCode:'secret'}},
  {...login,outcome:'complete'}])assert.throws(()=>validateRequestDiagnostics([bad]),/sync_diagnostics_invalid/);
});

test('internal login evidence persists while public summary retains its original fields',async()=>{
 const login:RequestDiagnostic={kind:'login',reportId:null,page:null,elapsedMs:305,outcome:'auth_error',httpStatus:200,
  loginEvidence:{responseShape:'data_object',result:'rejected',serverCode:'unrecognized',serverHint:'unclassified'}};
 let args:unknown[]=[];
 const db={query:async(_sql:string,values:unknown[])=>{args=values;return {rows:[],rowCount:1};}};
 await finishCaptureAttempt(db as Parameters<typeof finishCaptureAttempt>[0],'synthetic-attempt','invalid_credential',[login],null,0);
 assert.deepEqual(JSON.parse(String(args[4])),[login]);
 assert.deepEqual(diagnosticSummary([login]),{kind:'login',reportId:null,page:null,elapsedMs:305,outcome:'auth_error',httpStatus:200});
});
