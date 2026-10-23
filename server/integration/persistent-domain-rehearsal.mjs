// Test-driver guards. No Docker configuration or application behavior is changed.
import assert from 'node:assert/strict';

const localEndpoints = new Set([
  'npipe:////./pipe/docker_engine',
  'npipe:////./pipe/dockerDesktopLinuxEngine',
]);
// Self-contained so the driver can serialize this exact tested guard into the
// native fixture. It runs before importing config or constructing any Pool.
export function assertOwnedDatabaseEnvironment(environment, commit) {
  const required = { ZHIXU_GIT_COMMIT: commit, DB_HOST: 'database', DB_PORT: '5432', DB_NAME: 'quote_trial', DB_USER: 'quote_trial' };
  if (environment.DATABASE_URL || Object.entries(required).some(([key, value]) => environment[key] !== value)) {
    const error = new Error('synthetic_database_scope_invalid'); error.code = 'synthetic_database_scope_invalid'; throw error;
  }
}
export function localDockerEnvironment(environment, endpoint) {
  assert.ok(localEndpoints.has(endpoint), 'domain_recovery_requires_local_docker');
  if (environment.DOCKER_HOST) assert.equal(environment.DOCKER_HOST, endpoint, 'docker_host_scope_conflict');
  assert.ok(!environment.DOCKER_TLS_VERIFY && !environment.DOCKER_CERT_PATH, 'docker_tls_override_refused');
  const result = { ...environment, DOCKER_HOST: endpoint };
  delete result.DOCKER_CONTEXT;
  return result;
}
export function requirePinnedImage(inspected, expected) {
  assert.match(expected.id || '', /^sha256:[a-f0-9]{64}$/);
  assert.match(expected.commit || '', /^[a-f0-9]{40}$/);
  assert.ok(typeof expected.buildId === 'string' && expected.buildId.length > 0);
  assert.ok(typeof expected.buildTime === 'string' && Number.isFinite(Date.parse(expected.buildTime)));
  assert.equal(inspected.Id, expected.id, 'domain_image_id_changed');
  const labels = inspected.Config?.Labels || {};
  assert.equal(labels['org.opencontainers.image.revision'], expected.commit);
  assert.equal(labels['io.zhixu.build-id'], expected.buildId);
  assert.equal(labels['org.opencontainers.image.created'], expected.buildTime);
}
export function requireOwnedContainer(inspected, { project, service, imageId, dbVolume }) {
  assert.match(project, /^zhixu-quote-trial-(?:it|recovery)-[a-f0-9]{10}$/);
  const labels = inspected.Config?.Labels || {};
  assert.equal(labels['com.docker.compose.project'], project, 'domain_container_project_changed');
  assert.equal(labels['com.docker.compose.service'], service, 'domain_container_service_changed');
  assert.match(inspected.Id || '', /^[a-f0-9]{64}$/);
  if (imageId) assert.equal(inspected.Image, imageId, 'domain_container_image_changed');
  if (dbVolume) assert.deepEqual((inspected.Mounts || []).filter(m => m.Destination === '/var/lib/postgresql/data')
    .map(m => ({ name: m.Name, type: m.Type })), [{ name: dbVolume, type: 'volume' }]);
  return { id: inspected.Id, image: inspected.Image, project, service };
}

// Positive domain coverage is separate from equality of empty tables.
export const requiredPopulatedTables = [
  'sales_orders', 'sales_order_source_links', 'ainuoke_sales_order_contract_mirrors',
  'sales_order_color_identities', 'sales_order_delivery_plans', 'sales_order_delivery_plan_requests',
  'sales_order_commercial_heads', 'sales_order_commercial_versions', 'sales_order_commercial_lines',
  'sales_order_business_source_snapshots', 'processing_order_batches', 'processing_order_batch_consumptions',
  'production_schedule_assignments', 'production_schedule_plan_versions', 'production_schedule_commands',
  'production_schedule_executions', 'production_schedule_execution_versions',
  'confirmed_commercial_terms', 'production_calendars', 'production_sites', 'production_groups', 'production_outsource_factories',
  'production_resource_commands', 'ainuoke_source_profiles', 'ainuoke_source_runs', 'ainuoke_material_source_snapshots',
  'ainuoke_payment_snapshots', 'ainuoke_payment_heads',
  'ainuoke_garment_shipment_snapshots', 'ainuoke_garment_shipment_color_matches', 'ainuoke_garment_shipment_heads',
  'ainuoke_garment_collection_commands',
  'operation_logs',
];
export function recoveryCoverage(fingerprint) {
  assert.equal(fingerprint.schemaVersion, 'synthetic-domain-fingerprint.v1');
  const names = new Set();
  for (const row of fingerprint.tables) {
    assert.match(row.table, /^[a-z_]+$/);
    assert.ok(!names.has(row.table), 'duplicate_recovery_table'); names.add(row.table);
    assert.ok(Number.isSafeInteger(row.count) && row.count >= 0);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
  }
  for (const name of requiredPopulatedTables) {
    assert.ok(fingerprint.tables.some(row => row.table === name && row.count > 0), `unexercised_domain_table:${name}`);
  }
  return fingerprint.tables.map(row => ({ table: row.table, count: row.count,
    coverage: row.count ? 'populated-preserved' : 'empty-preserved-not-exercised' }));
}
export function compareRecoveryFingerprints(before, after) {
  assert.deepEqual(after, before, 'restored_tables_or_sequences_changed');
  return recoveryCoverage(after);
}

const identifier = value => {
  assert.match(value, /^[a-z_]+$/);
  return `"${value}"`;
};
/** No app process, pg startup hook, login, sequence allocation or value output.
 * Run only after maintenance, then on the empty-target restore before startup.
 * pgcrypto is already part of the reviewed schema, not installed by this test. */
export async function readDatabaseFingerprint(sql) {
  const tableNames = (await sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE \"C\""))
    .split(/\r?\n/).filter(Boolean);
  assert.ok(tableNames.length > 0 && tableNames.length < 500);
  const tableSql = tableNames.map(table => `SELECT jsonb_build_object('table','${identifier(table).slice(1, -1)}',
    'count',count(*),'sha256',encode(digest(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text COLLATE "C"),''),'sha256'),'hex'))::text AS row
    FROM public.${identifier(table)} t`).join('\nUNION ALL\n');
  const tables = (await sql(tableSql)).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row))
    .sort((a, b) => a.table < b.table ? -1 : a.table > b.table ? 1 : 0);
  const sequenceNames = (await sql("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname COLLATE \"C\""))
    .split(/\r?\n/).filter(Boolean);
  const sequenceSql = sequenceNames.map(name => `SELECT jsonb_build_object('name','${identifier(name).slice(1, -1)}',
    'lastValue',v.last_value::text,'isCalled',v.is_called,'start',s.seqstart::text,'increment',s.seqincrement::text,
    'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle,'type',format_type(s.seqtypid,NULL))::text AS row
    FROM public.${identifier(name)} v CROSS JOIN pg_sequence s WHERE s.seqrelid='public.${identifier(name)}'::regclass`).join('\nUNION ALL\n');
  const sequences = sequenceSql ? (await sql(sequenceSql)).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : [];
  return { schemaVersion: 'synthetic-domain-fingerprint.v1', tables, sequences };
}
