import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {parseBoundRefreshArguments,parseBoundRefreshJob} from '../ainuoke-source/bound-order-refresh-cli.js';

const uuid='11111111-1111-4111-8111-111111111111',sha='a'.repeat(64);
const job={schemaVersion:'ainuoke-bound-order-refresh-job.v1',databaseUrl:'postgresql://synthetic@localhost:5432/synthetic',operatorUsername:'synthetic',
 sourceKey:'synthetic',accountFingerprint:sha,salesOrderId:uuid,evidence:{path:resolve('outputs/synthetic/evidence.json'),sha256:sha}};
test('offline refresh job is explicit, fixed and does not accept source credentials or inline mirror DTOs',()=>{
 assert.equal(parseBoundRefreshJob(job).scope.salesOrderId,uuid);
 for(const raw of [{...job,password:'secret'},{...job,evidence:{...job.evidence,rows:[]}},{...job,databaseUrl:'http://localhost'},
  {...job,accountFingerprint:'bad'},{...job,evidence:{path:'relative.json',sha256:sha}},{...job,salesOrderId:'bad'}])assert.throws(()=>parseBoundRefreshJob(raw));
});
test('operator requires one exact action; apply cannot omit consent, request identity or reviewed preview',()=>{
 const common=['--job='+resolve('outputs/synthetic/job.json'),'--job-sha256='+sha,'--private-output='+resolve('outputs/synthetic')];
 assert.equal(parseBoundRefreshArguments(['--action=plan',...common]).action,'plan');
 assert.equal(parseBoundRefreshArguments(['--action=receipt',...common,'--request-id='+uuid]).action,'receipt');
 const apply=['--action=apply',...common,'--request-id='+uuid,'--expected-preview='+sha,'--execute=I_CONFIRM_EXACT_SCOPE'];
 assert.equal(parseBoundRefreshArguments(apply).action,'apply');
 for(const args of [[],apply.slice(0,-1),[...apply,'--password=secret'],[...apply,'--action=plan'],['--action=plan',...common,'--execute=anything']])
  assert.throws(()=>parseBoundRefreshArguments(args));
});
