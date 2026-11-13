import test from 'node:test';
import assert from 'node:assert/strict';
import {sourcePauseMessage} from '../source-sync-status';
test('human stop and auth/identity protection take priority over stale retry clocks',()=>{
 const at='2026-11-12T00:00:00Z';
 assert.match(sourcePauseMessage({configuredEnabled:false,automaticResumeAt:at}),/管理员已停用/);
 assert.match(sourcePauseMessage({pausedReason:'invalid_credential',catalogRetryAt:at}),/认证需要核对/);
 assert.match(sourcePauseMessage({pausedReason:'catalog_identity_or_scope_changed',catalogRetryAt:at}),/一致性保护/);
 assert.match(sourcePauseMessage({pausedReason:'catalog_retries_exhausted',automaticResumeAt:at}),/正在退避/);
 assert.equal(sourcePauseMessage({configuredEnabled:true}), '');
});
