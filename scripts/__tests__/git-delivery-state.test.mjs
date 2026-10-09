import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryState } from '../git-delivery-state.mjs';
const targetSha='a'.repeat(40), remoteSha='b'.repeat(40);
const base={phase:'push',exitCode:1,targetSha,clean:true,baselineExists:true};
test('network failure permits independent local engineering, never retry or fake success',()=>{
  assert.deepEqual(deliveryState({...base,stderr:'Connection reset token=PRIVATE cookie=PRIVATE'}),{state:'LOCAL_ENGINEERING_REMOTE_PENDING',continueLocal:true,retry:false});
  assert.ok(!JSON.stringify(deliveryState({...base,stderr:'Connection reset password=PRIVATE'})).includes('PRIVATE'));
});
test('response lost but exact remote SHA verified means delivered, no duplicate push',()=>{
  assert.equal(deliveryState({...base,stderr:'EOF',remoteSha:targetSha}).state,'DELIVERED_VERIFIED');
});
test('authentication/permissions never treated as network recovery',()=>{
  for(const stderr of ['authentication failed','permission denied','rejected non-fast-forward Connection reset']) assert.equal(deliveryState({...base,stderr}).continueLocal,false);
});
test('remote divergence reject does not reset/rebase/retry',()=>assert.equal(deliveryState({...base,remoteSha,stderr:'rejected non-fast-forward'}).state,'STOP_AUTH_OR_DIVERGENCE'));
test('missing baseline blocks fetch recovery and unknown dirty blocks all continuation',()=>{
  assert.equal(deliveryState({...base,phase:'fetch',stderr:'timeout',baselineExists:false}).state,'STOP_BASELINE_MISSING');
  assert.equal(deliveryState({...base,stderr:'Connection reset',clean:false}).state,'STOP_UNKNOWN_WORKTREE');
});
test('zero exit without remote proof remains verification pending; malformed evidence/other errors stop',()=>{
  assert.equal(deliveryState({...base,exitCode:0}).state,'AWAIT_REMOTE_VERIFICATION');
  assert.equal(deliveryState({...base,remoteSha:'short'}).state,'STOP_INVALID_EVIDENCE');
  assert.equal(deliveryState({...base,stderr:'unknown error'}).continueLocal,false);
});
