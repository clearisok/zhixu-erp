import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDelayMs, retryableCapture, validateRequestDiagnostics, type RequestDiagnostic } from './sync-diagnostics.js';

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
test('diagnostic storage is a closed whitelist, never arbitrary error text or credentials',()=>{
 assert.deepEqual(validateRequestDiagnostics([timeout]),[timeout]);
 for(const bad of [{...timeout,url:'https://private'},{...timeout,outcome:'secret password'}, {...timeout,reportId:'6087105'}, {...timeout,page:0}, {...timeout,httpStatus:900}])assert.throws(()=>validateRequestDiagnostics([bad]),/sync_diagnostics_invalid/);
 assert.throws(()=>validateRequestDiagnostics(Array(82).fill(timeout)),/sync_diagnostics_invalid/);
});
