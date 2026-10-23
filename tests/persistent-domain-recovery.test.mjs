import test from 'node:test';
import assert from 'node:assert/strict';
import { localDockerEnvironment, requirePinnedImage, requireOwnedContainer, requireIsolatedApplicationNetwork, requiredPopulatedTables,
  recoveryCoverage, compareRecoveryFingerprints, readDatabaseFingerprint, assertOwnedDatabaseEnvironment } from '../server/integration/persistent-domain-rehearsal.mjs';

const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const image = { id: 'sha256:' + 'a'.repeat(64), commit: 'b'.repeat(40), buildId: 'synthetic-build', buildTime: '2026-10-23T00:00:00Z' };
test('serialized native guard refuses DATABASE_URL pollution before a Pool can be constructed', () => {
  const env = { ZHIXU_GIT_COMMIT: image.commit, DB_HOST: 'database', DB_PORT: '5432', DB_NAME: 'quote_trial', DB_USER: 'quote_trial' };
  assertOwnedDatabaseEnvironment(env, image.commit);
  for (const changed of [{ DATABASE_URL: 'postgresql://outside.invalid/protected' }, { DB_HOST: 'localhost' },
    { DB_NAME: 'zhixu' }, { DB_USER: 'postgres' }, { DB_PORT: '5433' }, { ZHIXU_GIT_COMMIT: 'wrong' }]) {
    let opened = false;
    assert.throws(() => { assertOwnedDatabaseEnvironment({ ...env, ...changed }, image.commit); opened = true; },
      error => error.code === 'synthetic_database_scope_invalid');
    assert.equal(opened, false);
  }
  assert.ok(!/import|require\(|process\.env/.test(assertOwnedDatabaseEnvironment.toString()));
});
test('domain driver pins only a verified local endpoint and leaves shared environment unchanged', () => {
  const original = { DOCKER_CONTEXT: 'desktop-linux', PATH: 'synthetic', DOCKER_HOST: endpoint };
  const pinned = localDockerEnvironment(original, endpoint);
  assert.equal(pinned.DOCKER_HOST, endpoint); assert.equal(pinned.DOCKER_CONTEXT, undefined);
  assert.equal(original.DOCKER_CONTEXT, 'desktop-linux');
  for (const remote of ['tcp://localhost:2375', 'ssh://remote', 'tcp://example.invalid:2376', ''])
    assert.throws(() => localDockerEnvironment({}, remote));
  assert.throws(() => localDockerEnvironment({ DOCKER_HOST: 'tcp://remote:2375' }, endpoint));
  for (const key of ['DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) assert.throws(() => localDockerEnvironment({ [key]: 'set' }, endpoint));
});
test('exact image needs ID and all build facts, not a mutable tag or commit label alone', () => {
  const inspected = { Id: image.id, Config: { Labels: { 'org.opencontainers.image.revision': image.commit,
    'io.zhixu.build-id': image.buildId, 'org.opencontainers.image.created': image.buildTime } } };
  requirePinnedImage(inspected, image);
  assert.throws(() => requirePinnedImage({ ...inspected, Id: 'sha256:' + 'c'.repeat(64) }, image));
  for (const key of Object.keys(inspected.Config.Labels)) {
    const changed = structuredClone(inspected); changed.Config.Labels[key] = 'different';
    assert.throws(() => requirePinnedImage(changed, image));
  }
  assert.throws(() => requirePinnedImage(inspected, { ...image, buildId: undefined }));
  assert.throws(() => requirePinnedImage(inspected, { ...image, buildTime: 'unknown' }));
});
test('domain containers must have the exact owned project, service, image and DB volume', () => {
  const project = 'zhixu-quote-trial-it-0123456789';
  const row = { Id: 'd'.repeat(64), Image: image.id, Config: { Labels: {
    'com.docker.compose.project': project, 'com.docker.compose.service': 'database' } },
  Mounts: [{ Destination: '/var/lib/postgresql/data', Name: project + '_data', Type: 'volume' }] };
  const scope = { project, service: 'database', imageId: image.id, dbVolume: project + '_data' };
  requireOwnedContainer(row, scope);
  for (const change of [{ project: 'zhixu-quote-trial-server-g1' }, { service: 'app' }, { imageId: 'sha256:' + 'e'.repeat(64) }, { dbVolume: 'protected_data' }])
    assert.throws(() => requireOwnedContainer(row, { ...scope, ...change }));
  assert.throws(() => requireOwnedContainer({ ...row, Mounts: [{ ...row.Mounts[0], Type: 'bind' }] }, scope));
});
function fingerprint() {
  return { schemaVersion: 'synthetic-domain-fingerprint.v1',
    tables: [...requiredPopulatedTables.map(table => ({ table, count: 1, sha256: 'a'.repeat(64) })),
      { table: 'empty_future_domain', count: 0, sha256: 'b'.repeat(64) }],
    sequences: [{ name: 'sales_order_no_seq', lastValue: '2', isCalled: true, increment: '1' }] };
}

test('synthetic compiled collection cannot run with an external or unrelated application network', () => {
  const project = 'zhixu-quote-trial-it-0123456789', name = `${project}_default`;
  const app = { Id: 'd'.repeat(64), Config: { Labels: { 'com.docker.compose.project': project, 'com.docker.compose.service': 'app' } },
    NetworkSettings: { Networks: { [name]: {} } } };
  const network = { Name: name, Internal: true, Labels: { 'com.docker.compose.project': project, 'com.docker.compose.network': 'default' } };
  requireIsolatedApplicationNetwork(app, network, project);
  for (const Networks of [{}, { [name]: {}, [`${project}_ingress`]: {} }, { protected_network: {} }])
    assert.throws(() => requireIsolatedApplicationNetwork({ ...app, NetworkSettings: { Networks } }, network, project));
  for (const changed of [{ Internal: false }, { Name: 'protected_network' }, { Labels: {} },
    { Labels: { ...network.Labels, 'com.docker.compose.project': 'unrelated' } },
    { Labels: { ...network.Labels, 'com.docker.compose.network': 'ingress' } }])
    assert.throws(() => requireIsolatedApplicationNetwork(app, { ...network, ...changed }, project));
  assert.throws(() => requireIsolatedApplicationNetwork(app, network, 'zhixu-quote-trial-server-g1'));
});
test('empty tables are explicitly unexercised and cannot prove a required business domain', () => {
  const before = fingerprint(), coverage = recoveryCoverage(before);
  assert.equal(coverage.at(-1).coverage, 'empty-preserved-not-exercised');
  for (const table of requiredPopulatedTables) {
    const changed = structuredClone(before); changed.tables.find(row => row.table === table).count = 0;
    assert.throws(() => recoveryCoverage(changed), new RegExp(table));
  }
  const duplicate = structuredClone(before); duplicate.tables.push(duplicate.tables[0]);
  assert.throws(() => recoveryCoverage(duplicate));
});
test('collection-command recovery cannot be claimed from a missing or empty command table', () => {
  const table = 'ainuoke_garment_collection_commands';
  const missing = fingerprint(); missing.tables = missing.tables.filter(row => row.table !== table);
  assert.throws(() => recoveryCoverage(missing), /unexercised_domain_table:ainuoke_garment_collection_commands/);
  const empty = fingerprint(); empty.tables = empty.tables.filter(row => row.table !== table);
  empty.tables.push({ table, count: 0, sha256: 'b'.repeat(64) });
  assert.throws(() => recoveryCoverage(empty), /unexercised_domain_table:ainuoke_garment_collection_commands/);
});

test('restore comparison detects table removal, quantity changes and uncalled sequence changes', () => {
  const before = fingerprint(); compareRecoveryFingerprints(before, structuredClone(before));
  for (const change of [f => f.tables.pop(), f => f.tables[0].count++, f => f.tables[0].sha256 = 'c'.repeat(64),
    f => f.sequences[0].lastValue = '3', f => f.sequences[0].isCalled = false]) {
    const after = structuredClone(before); change(after);
    assert.throws(() => compareRecoveryFingerprints(before, after));
  }
});
test('whole-schema fingerprint is read-only, includes untouched sequences and rejects unsafe identifiers', async () => {
  const calls = [];
  const sql = async query => {
    calls.push(query);
    if (query.startsWith('SELECT tablename')) return 'app_users\nsales_orders';
    if (query.startsWith('SELECT c.relname')) return 'sales_order_no_seq';
    if (query.includes("'lastValue'")) return JSON.stringify({ name: 'sales_order_no_seq', lastValue: '2', isCalled: false });
    return ['sales_orders', 'app_users'].map(table => JSON.stringify({ table, count: 1, sha256: 'a'.repeat(64) })).join('\n');
  };
  const result = await readDatabaseFingerprint(sql);
  assert.equal(result.tables.length, 2); assert.equal(result.sequences[0].isCalled, false);
  assert.deepEqual(result.tables.map(row => row.table), ['app_users', 'sales_orders']);
  assert.ok(calls.some(query => query.includes('seqcache') && query.includes('seqcycle') && query.includes('seqtypid')));
  assert.ok(calls.some(query => query.includes('to_jsonb(t)::text COLLATE "C"')));
  assert.ok(calls.every(query => !/nextval|setval|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE/i.test(query)));
  await assert.rejects(readDatabaseFingerprint(async () => 'unsafe;table'));
});
