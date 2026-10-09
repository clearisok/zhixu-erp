import test from 'node:test';
import assert from 'node:assert/strict';
import { projectUpdateConfig, verifyUpdateModels } from '../../ops/quote-trial/update-identity.mjs';
const old = { image: 'synthetic:old', commit: 'a'.repeat(40), buildId: 'old', buildTime: '2026-10-09T00:00:00Z' };
const next = { image: 'synthetic:new', commit: 'b'.repeat(40), buildId: 'new', buildTime: '2026-10-09T01:00:00Z' };
const model = { name: 'synthetic', services: { database: { image: 'postgres:16-alpine', volumes: ['data'], environment: { password: 'synthetic-only' } }, app: { image: old.image, environment: { ZHIXU_GIT_COMMIT: old.commit, ZHIXU_BUILD_ID: old.buildId, ZHIXU_BUILD_TIME: old.buildTime, secret: 'synthetic-only' } }, gateway: { image: old.image, ports: [18443] } }, volumes: { data: {} } };
function changed() { const n = structuredClone(model); n.services.app.image = n.services.gateway.image = next.image; Object.assign(n.services.app.environment, { ZHIXU_GIT_COMMIT: next.commit, ZHIXU_BUILD_ID: next.buildId, ZHIXU_BUILD_TIME: next.buildTime }); return n; }
test('config projection changes four identities only and preserves unrelated/secret lines', () => {
  const text = `# synthetic\r\nTRIAL_IMAGE=${old.image}\r\nTRIAL_COMMIT=${old.commit}\r\nTRIAL_BUILD_ID=old\r\nTRIAL_BUILD_TIME=${old.buildTime}\r\nTRIAL_DB_PASSWORD=synthetic-only\r\n`;
  const output = projectUpdateConfig(text, next);
  assert.ok(output.endsWith('TRIAL_DB_PASSWORD=synthetic-only\r\n'));
  assert.ok(output.includes('TRIAL_IMAGE=synthetic:new\r\n'));
  assert.equal(text.includes('synthetic:new'), false);
});
test('missing/duplicate identity fields and short commit fail closed', () => {
  assert.throws(() => projectUpdateConfig('', next));
  assert.throws(() => projectUpdateConfig('TRIAL_IMAGE=x\nTRIAL_IMAGE=y', next));
  assert.throws(() => projectUpdateConfig('', { ...next, commit: 'abc' }));
});
test('resolved model permits only app/gateway image and app build identity', () => verifyUpdateModels(model, changed(), old, next));
for (const field of ['database', 'ports', 'secret', 'volume']) test(`resolved model rejects ${field} change`, () => {
  const n = changed();
  if (field === 'database') n.services.database.image = 'other';
  if (field === 'ports') n.services.gateway.ports = [3001];
  if (field === 'secret') n.services.app.environment.secret = 'other';
  if (field === 'volume') n.volumes.data = { name: 'other' };
  assert.throws(() => verifyUpdateModels(model, n, old, next), /unexpected_compose_change/);
});
