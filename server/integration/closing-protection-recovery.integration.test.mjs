import test from 'node:test';
import assert from 'node:assert/strict';
import { closingFixture } from './closing-fixture.ts';
import { readPersistentClosingProtection } from './persistent-financial-recovery-fixture.mjs';
import { assertPersistentDomainRecovery } from './persistent-domain-recovery-fixture.mjs';

test('owned PostgreSQL recovery evidence binds the actual enabled 0051 guard and source body', async t => {
  const f = await closingFixture(t), client = await f.pool.connect();
  try {
  const state = { prepared: true, project: 'zhixu-quote-trial-it-0051000001', sql: async query =>
    Object.values((await client.query(query)).rows[0])[0] };
  const original = await readPersistentClosingProtection(state);
  assert.equal(original.enabled, 'O'); assert.equal(original.type, 7);
  assert.equal(original.function, 'public.validate_closing_frozen_month_lines');
  assert.match(original.functionDefinitionSha256, /^[a-f0-9]{64}$/u);
  for (const [sql, error] of [
    ['ALTER TABLE server_closing_month_plan_versions DISABLE TRIGGER month_frozen_lines_validation', /frozen_closing_trigger_enabled/u],
    ['DROP TRIGGER month_frozen_lines_validation ON server_closing_month_plan_versions', /frozen_closing_trigger_required/u],
    ["CREATE OR REPLACE FUNCTION validate_closing_frozen_month_lines() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$", /frozen_closing_function_body/u],
    ["ALTER FUNCTION validate_closing_frozen_month_lines() SET search_path TO pg_catalog", /frozen_closing_trigger_identity:hasConfiguration/u],
  ]) {
    await client.query('BEGIN');
    try { await client.query(sql); await assert.rejects(readPersistentClosingProtection(state), error); }
    finally { await client.query('ROLLBACK'); }
    assert.deepEqual(await readPersistentClosingProtection(state), original);
  }
  const before = { closingFrozenProtection: original };
  assert.doesNotThrow(() => assertPersistentDomainRecovery(before, structuredClone(before)));
  for (const protection of [null, { ...original, enabled: 'D' }, { ...original, functionDefinitionSha256: '0'.repeat(64) },
    { ...original, triggerDefinitionSha256: '0'.repeat(64) }]) {
    assert.throws(() => assertPersistentDomainRecovery(before, { closingFrozenProtection: protection }), { name: 'AssertionError' });
  }
  } finally { client.release(); }
});
