import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryState } from '../git-delivery-state.mjs';
const targetSha='a'.repeat(40), remoteSha='b'.repeat(40);
const base={phase:'push',exitCode:1,targetSha,clean:true,baselineExists:true};
test('network failure permits independent local engineering, never retry or fake success',()=>{
  assert.deepEqual(deliveryState({...base,stderr:'Connection reset token=PRIVATE cookie=PRIVATE'}),{state:'LOCAL_PASS_REMOTE_UNVERIFIED',continueLocal:true,retry:false});
  assert.ok(!JSON.stringify(deliveryState({...base,stderr:'Connection reset password=PRIVATE'})).includes('PRIVATE'));
});
test('response lost but exact remote SHA verified means delivered, no duplicate push',()=>{
  assert.equal(deliveryState({...base,stderr:'EOF',remoteSha:targetSha,remoteVerified:true}).state,'DELIVERED_VERIFIED');
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
  assert.equal(deliveryState({...base,exitCode:0}).state,'LOCAL_PASS_REMOTE_UNVERIFIED');
  assert.equal(deliveryState({...base,remoteSha:'short'}).state,'STOP_INVALID_EVIDENCE');
  assert.equal(deliveryState({...base,stderr:'unknown error'}).continueLocal,false);
});
test('Schannel, close_notify and TLS EOF are uncertain transport; verified old remote is not delivered',()=>{
  for (const stderr of ['schannel: failed to receive handshake','missing close_notify','TLS unexpected EOF']) {
    assert.equal(deliveryState({...base,stderr}).state,'LOCAL_PASS_REMOTE_UNVERIFIED');
    assert.equal(deliveryState({...base,stderr,remoteSha,remoteVerified:true}).state,'LOCAL_PASS_REMOTE_NOT_DELIVERED');
    assert.equal(deliveryState({...base,stderr,remoteSha:targetSha,remoteVerified:true}).state,'DELIVERED_VERIFIED');
  }
});
test('known inherited dirty requires exact approved SHA256, mismatch remains STOP',()=>{
  const fingerprint='c'.repeat(64);
  assert.equal(deliveryState({...base,exitCode:0,clean:false,dirtyFingerprint:fingerprint,expectedDirtyFingerprint:fingerprint,remoteSha:targetSha,remoteVerified:true}).state,'DELIVERED_VERIFIED');
  assert.equal(deliveryState({...base,clean:false,dirtyFingerprint:fingerprint,expectedDirtyFingerprint:'d'.repeat(64)}).state,'STOP_UNKNOWN_WORKTREE');
  assert.equal(deliveryState({...base,remoteRelation:'diverged',stderr:'TLS EOF'}).state,'STOP_AUTH_OR_DIVERGENCE');
});
test('certificate trust/expiry and unsupported TLS config are STOP, not transient transport recovery',()=>{
  for(const stderr of ['SSL certificate problem: unable to get local issuer certificate','schannel SEC_E_UNTRUSTED_ROOT','SEC_E_CERT_EXPIRED','unsupported SSL backend',
    'schannel: SNI or certificate check failed: SEC_E_WRONG_PRINCIPAL', 'SSL: no alternative certificate subject name matches target hostname', 'target principal name is incorrect']) {
    assert.equal(deliveryState({...base,stderr}).state,'STOP_TLS_IDENTITY_OR_CONFIGURATION');
    assert.equal(deliveryState({...base,stderr,remoteSha:targetSha,remoteVerified:true}).state,'STOP_TLS_IDENTITY_OR_CONFIGURATION');
  }
});

test('DNS/connect failures preserve pending delivery while HTTP permission errors remain STOP',()=>{
  for(const stderr of ['Could not resolve host','Could not resolve proxy','Failed to connect'])
    assert.equal(deliveryState({...base,stderr}).state,'LOCAL_PASS_REMOTE_UNVERIFIED');
  for(const stderr of ['HTTP 401','HTTP 403'])
    assert.equal(deliveryState({...base,stderr}).state,'STOP_AUTH_OR_DIVERGENCE');
});

test('normal successful push branch names are not certificate failures',()=>{
  for(const branch of ['fix/certificate-label','fix/SEC_E_WRONG_PRINCIPAL','fix/CERT_E_example']) {
    const stderr=`To https://github.com/example/repo.git\n * [new branch] abc -> ${branch}\n`;
    assert.equal(deliveryState({...base,exitCode:0,stderr,remoteSha:targetSha,remoteVerified:true}).state,'DELIVERED_VERIFIED');
  }
});

test('successful ref messages cannot turn independent exact delivery into authentication failure',()=>{
  for(const branch of ['fix/conflict-report','fix/divergence-proof','fix/rejected-marker','fix/non-fast-forward-notes']) {
    const stderr=`To https://github.com/example/repo.git\n * [new branch] abc -> ${branch}\n`;
    assert.equal(deliveryState({...base,exitCode:0,stderr,remoteSha:targetSha,remoteVerified:true}).state,'DELIVERED_VERIFIED');
    assert.equal(deliveryState({...base,exitCode:0,stderr}).state,'LOCAL_PASS_REMOTE_UNVERIFIED');
    assert.equal(deliveryState({...base,exitCode:0,stderr,remoteSha,remoteVerified:true}).state,'LOCAL_PASS_REMOTE_NOT_DELIVERED');
  }
});

test('zero exit does not bypass certificate identity or malformed remote evidence',()=>{
  assert.equal(deliveryState({...base,exitCode:0,stderr:'SSL certificate verify failed',remoteSha:targetSha,remoteVerified:true}).state,'STOP_TLS_IDENTITY_OR_CONFIGURATION');
  assert.equal(deliveryState({...base,exitCode:0,stderr:'conflict report',remoteSha:'short',remoteVerified:true}).state,'STOP_INVALID_EVIDENCE');
  assert.equal(deliveryState({...base,exitCode:1,stderr:'HTTP 403',remoteSha:targetSha,remoteVerified:true}).state,'STOP_AUTH_OR_DIVERGENCE');
  assert.equal(deliveryState({...base,exitCode:0,remoteSha:targetSha,remoteVerified:false}).state,'LOCAL_PASS_REMOTE_UNVERIFIED');
  for(const observed of [remoteSha,targetSha])
    assert.equal(deliveryState({...base,exitCode:0,remoteSha:observed,remoteVerified:true,remoteRelation:'diverged'}).state,'STOP_AUTH_OR_DIVERGENCE');
});

test('explicit access denials and rejected status remain STOP even at zero exit',()=>{
  for(const stderr of ['authentication failed','permission denied (publickey)','access denied','could not read Username','invalid username or password','HTTP 403','HTTP/2 401','The requested URL returned error:403','! [rejected] HEAD -> fix/example','remote: ! [remote rejected] HEAD -> fix/example']) {
    const result=deliveryState({...base,exitCode:0,stderr,remoteSha:targetSha,remoteVerified:true});
    assert.equal(result.state,'STOP_AUTH_OR_DIVERGENCE',stderr);
    assert.equal(result.continueLocal,false);
    assert.equal(result.retry,false);
  }
});
