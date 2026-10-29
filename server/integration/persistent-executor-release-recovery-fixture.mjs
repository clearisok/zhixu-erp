// Test-only evidence for the same owned persistent-image rehearsal. No Source
// IO, real target, migration implementation or replacement business writer.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function owned(state) {
  assert.equal(state.prepared, true, 'executor recovery requires successful owned preparation');
  assert.match(state.project, /^zhixu-quote-trial-(?:it|recovery)-[0-9a-f]{10}$/u);
}
export async function readPersistentExecutorReleaseProtection(state) {
  owned(state);
  const rows = JSON.parse(await state.sql(`SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'enabled',t.tgenabled,'type',t.tgtype,'deferrable',t.tgdeferrable,'initiallyDeferred',t.tginitdeferred,
    'hasCondition',t.tgqual IS NOT NULL,'arguments',t.tgnargs,'tableSchema',cn.nspname,'tableName',c.relname,
    'functionSchema',pn.nspname,'functionName',p.proname,'language',l.lanname,'returnType',p.prorettype::regtype::text,
    'functionArguments',p.pronargs,'securityDefiner',p.prosecdef,'hasConfiguration',p.proconfig IS NOT NULL,
    'body',p.prosrc,'triggerDefinition',pg_get_triggerdef(t.oid),'functionDefinition',pg_get_functiondef(p.oid)) ORDER BY t.oid),'[]'::jsonb)::text
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE cn.nspname='public' AND c.relname='server_closing_month_plan_versions'
      AND t.tgname='month_executor_release_validation' AND NOT t.tgisinternal`));
  assert.ok(Array.isArray(rows) && rows.length === 1, 'executor_release_trigger_required');
  const row = rows[0];
  for (const [key, value] of Object.entries({ enabled: 'O', type: 5, deferrable: true, initiallyDeferred: true,
    hasCondition: false, arguments: 0, tableSchema: 'public', tableName: 'server_closing_month_plan_versions',
    functionSchema: 'public', functionName: 'validate_closing_executor_release', language: 'plpgsql', returnType: 'trigger',
    functionArguments: 0, securityDefiner: false, hasConfiguration: false })) assert.equal(row[key], value, 'executor_release_trigger_identity:' + key);
  const migration = await readFile(new URL('../../database/migrations/0052_closing_executor_release.sql', import.meta.url), 'utf8');
  const expectedBody = /AS \$\$([\s\S]*?)\$\$;/u.exec(migration)?.[1];
  assert.ok(expectedBody, 'executor_release_source_body_required');
  const normalize = value => value.replace(/\r\n/gu, '\n');
  assert.equal(normalize(row.body), normalize(expectedBody), 'executor_release_function_body');
  for (const key of ['triggerDefinition', 'functionDefinition']) assert.ok(typeof row[key] === 'string' && row[key].length > 0, 'executor_release_definition_required');
  const digest = value => createHash('sha256').update(normalize(value)).digest('hex');
  return { trigger: 'month_executor_release_validation', enabled: row.enabled, type: row.type, deferrable: row.deferrable,
    initiallyDeferred: row.initiallyDeferred, table: row.tableSchema + '.' + row.tableName,
    function: row.functionSchema + '.' + row.functionName, bodySha256: digest(row.body),
    triggerDefinitionSha256: digest(row.triggerDefinition), functionDefinitionSha256: digest(row.functionDefinition) };
}
async function json(state, cookie, path, body) {
  const response = await state.request(path, { cookie, ...(body === undefined ? {} : { method: 'POST', body }) });
  assert.equal(response.status, 200, `synthetic_executor_recovery_http:${path}:${response.status}:${response.bytes.toString().slice(0, 200)}`);
  return response.json();
}
function units(value) {
  const [whole, fraction = ''] = value.split('.'); assert.ok(fraction.length <= 6);
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
function quantity(value) {
  const fraction = (value % 1000000n).toString().padStart(6, '0').replace(/0+$/u, '');
  return (value / 1000000n).toString() + (fraction ? '.' + fraction : '');
}

// save is the existing financial fixture's preview/command/original-receipt
// helper. All changes use real HTTP commands against its prepared empty target.
export async function seedPersistentExecutorReleaseRecovery(state, cookie, domain, financial, run, save) {
  owned(state); assert.match(state.project, /^zhixu-quote-trial-it-[0-9a-f]{10}$/u);
  assert.ok(domain.orderId && domain.assignments.length === 2 && Array.isArray(domain.receipts));
  assert.ok(Array.isArray(financial.periodIds));
  const orderId = domain.orderId, assignmentId = domain.assignments[1];
  const production = '/api/v1/production-scheduling', closing = '/api/v1/closing';
  const monthPath = closing + '/orders/' + orderId + '/month-plan';
  let current = await json(state, cookie, monthPath);
  const candidate = current.executorCandidates.find(row => row.assignmentId === assignmentId);
  assert.ok(candidate && candidate.executionType === 'outsource' && candidate.execution === null, 'unstarted_outsource_fixture_required');
  const line = current.plan.lines.find(row => row.month === '2027-03' && row.assignmentId === null && row.colorId === candidate.colorId && units(row.quantity) >= 2125000n);
  assert.ok(line, 'open_unassigned_march_quantity_required');
  const rest = units(line.quantity) - 2125000n;
  await save(closing + '/month-plans', { action: 'match_executors', orderId, expectedVersion: current.plan.version,
    reason: 'Synthetic persistent zero-output recovery preparation', items: [{ lineId: line.id,
      parts: [{ assignmentId, quantity: '2.125' }, ...(rest > 0n ? [{ assignmentId: null, quantity: quantity(rest) }] : [])] }] }, 'month');
  const resourcePrefix = '/api/v1/production-resources/commands';
  const resourceRequestId = randomUUID(), resource = await json(state, cookie, resourcePrefix, { requestId: resourceRequestId,
    action: 'create', kind: 'factories', resourceId: null, expectedVersion: 0,
    data: { name: '恢复合成更换外发厂', enabled: true, remark: '仅隔离恢复验收', shortName: '恢复', contactPerson: '', phone: '' } });
  assert.equal(resource.status, 'applied');
  const stored = result => { const copy = { ...result }; delete copy.replayed; delete copy.payloadHash; return copy; };
  domain.receipts.push({ path: resourcePrefix + '/' + resourceRequestId, requestId: resourceRequestId, result: stored(resource) });
  const plans = await json(state, cookie, production + '/orders/' + orderId);
  const intent = { action: 'update', orderId, assignmentId, expectedVersion: candidate.assignmentVersion,
    expectedPlanVersion: plans.order.planVersion, reason: 'Synthetic legal executor change before any output',
    data: { executionType: 'outsource', executorId: resource.resource.id, colorId: candidate.colorId, plannedQuantity: candidate.plannedQuantity,
      duration: { mode: 'workdays', workdays: 2 }, dates: { mode: 'manual_fixed', startDate: '2027-01-04', endDate: '2027-01-06' }, remark: '恢复合成排单' } };
  const preview = await json(state, cookie, production + '/preview', intent);
  const command = { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash };
  const changed = await json(state, cookie, production + '/commands', command); assert.equal(changed.status, 'applied');
  domain.receipts.push({ path: production + '/commands/' + command.requestId, requestId: command.requestId, result: stored(changed) });
  current = await json(state, cookie, monthPath);
  assert.deepEqual(current.executorChanges.map(row => row.assignmentId), [assignmentId]);
  const priorPlan = current.plan, productionBefore = await json(state, cookie, production + '/orders/' + orderId);
  const commercialBefore = await json(state, cookie, closing + '/orders/' + orderId + '/basis');
  const frozenBefore = await Promise.all(financial.periodIds.map(id => json(state, cookie, closing + '/periods/' + id)));
  const fingerprintUrl = new URL('../closing/basis-model.ts', import.meta.url).href;
  const fingerprint = await run(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `import {closingExecutionFingerprint} from ${JSON.stringify(fingerprintUrl)};process.stdout.write(closingExecutionFingerprint(${JSON.stringify(current.executorCandidates)}));`]);
  assert.match(fingerprint, /^[a-f0-9]{64}$/u);
  const result = await save(closing + '/month-plans', { action: 'release_executors', orderId, expectedVersion: priorPlan.version,
    assignmentIds: [assignmentId], observedExecutorFingerprint: fingerprint, reason: 'Explicit synthetic zero-output attribution recovery' }, 'month');
  const after = await json(state, cookie, monthPath);
  assert.deepEqual(after.plan.lines, priorPlan.lines.map(row => row.assignmentId === assignmentId ? { ...row, assignmentId: null } : row));
  assert.equal(after.plan.sourceFingerprint, priorPlan.sourceFingerprint); assert.equal(after.plan.sourceQuantity, priorPlan.sourceQuantity);
  assert.deepEqual(after.executorChanges, []);
  assert.deepEqual(await json(state, cookie, production + '/orders/' + orderId), productionBefore, 'release must not change real production');
  assert.deepEqual(await json(state, cookie, closing + '/orders/' + orderId + '/basis'), commercialBefore, 'release must not change current adopted prices or commercial versions');
  assert.deepEqual(await Promise.all(financial.periodIds.map(id => json(state, cookie, closing + '/periods/' + id))), frozenBefore, 'release must not change frozen finance');
  return { orderId, assignmentId, requestId: result.requestId, versionId: result.versionId, version: result.version, releasedQuantity: '2.125' };
}
