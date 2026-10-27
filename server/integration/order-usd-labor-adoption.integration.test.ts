import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { closingFixture, closingCode } from './closing-fixture.js';
import { runMigrations } from '../db/migration-runner.js';
import { readOrderCommercialState } from '../sales-orders/commercial-version-service.js';
import { previewLaborAdoption, executeLaborAdoption, readLaborAdoptionReceipt, readLaborAdoptionHistory } from '../sales-orders/labor-adoption-service.js';
import { LABOR_ADOPTION_PERMISSIONS } from '../sales-orders/labor-adoption-model.js';
import { readClosingOrderBasis } from '../closing/basis-service.js';
import { previewClosingCommand } from '../closing/service.js';
import { previewSaleAdjustment, commitSaleAdjustment } from '../sales-orders/sale-adjustment-service.js';
import { findSalesOrderIdsByQuoteProvenance } from '../confirmed-commercial-terms/repository.js';
import { updateConfirmedCommercialTermsByQuote } from '../confirmed-commercial-terms/service.js';
import { applyQuoteVersionCommand } from '../quotes/version-workflows.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { normalizationReferences } from '../sales-orders/normalization-preview.js';
import {migrationFilesAfter} from './current-migration-ledger-fixture.js';

test('Gate8C explicit USD labor adoption preserves independent order, product, batch and closing facts', { timeout: 240000 }, async t => {
  const x = await closingFixture(t, 45, true), { pool, editor } = x;
  const a = await x.order(), b = await x.order(), process = await x.processing('CNY');
  const prior = (await pool.query("SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY id)::text) hash FROM sales_order_commercial_versions v")).rows[0].hash;
  await t.test('nonempty 45→current is additive, idempotent and keeps prior commercial rows byte-equivalent', async () => {
    assert.deepEqual((await runMigrations(pool, resolve('database/migrations'))).applied, migrationFilesAfter(45));
    assert.equal((await pool.query("SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY id)::text) hash FROM sales_order_commercial_versions v")).rows[0].hash, prior);
    assert.equal((await pool.query('SELECT count(*)::int n FROM order_labor_adoption_commands')).rows[0].n, 0);
    assert.deepEqual((await runMigrations(pool, resolve('database/migrations'))).applied, []);
  });
  async function http(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie: string | null = editor.cookie) {
    const response = await fetch(x.base + '/api/v1/' + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { Origin: x.base, 'X-Zhixu-Request': '1', 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); return { status: response.status, text, body: JSON.parse(text) as Record<string, unknown> };
  }
  async function state(id: string) { const s = await readOrderCommercialState(pool, id); assert.ok(s.current); return s.current; }
  async function intent(id: string, targetRevisionId?: string, colorIds?: (string | null)[]) {
    const s = await state(id); return { orderId: id, expectedVersion: s.version, targetRevisionId: targetRevisionId ?? s.revisionId,
      colorIds: colorIds ?? (s.lines?.map(line => line.colorId) ?? [null]), productUnchangedConfirmed: true as const, reason: 'Explicit synthetic USD terms' };
  }
  async function command(id: string, revisionId: string, colorIds?: (string | null)[]) {
    const current = await state(id), selectedIds = colorIds ?? current.lines?.filter(line => line.laborCurrency === 'CNY').map(line => line.colorId) ?? [null];
    const preview = await previewLaborAdoption(pool, editor.actor, await intent(id, revisionId, selectedIds)); return { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash };
  }
  async function successor(id: string, price = '4.25', fromRevisionId?: string) {
    const source = await state(id), before = (await x.repository.getById(source.quoteId))!;
    const created = await http('quotes/' + source.quoteId + '/version-workflows', { action: 'revision.create', expectedVersion: before.version,
      sourceRevisionId: fromRevisionId ?? source.revisionId, reason: '工价调整', note: 'Explicit USD confirmation only' }); assert.equal(created.status, 200, created.text);
    let record = (await x.repository.getById(source.quoteId))!;
    const revision = record.quote.revisions.find(row => row.revisionId === record.quote.defaultRevisionId)!;
    for (const pv of revision.priceVersions) pv.pricingParameters.laborCurrency = 'USD';
    const saved = await http('quotes/' + source.quoteId, { quote: record.quote, expectedVersion: record.version }, 'PUT'); assert.equal(saved.status, 200, saved.text);
    for (const pv of revision.priceVersions) {
      record = (await x.repository.getById(source.quoteId))!;
      const confirmed = await http('quotes/' + source.quoteId + '/confirmation-workflows', { action: 'confirmation.save', expectedVersion: record.version,
        revisionId: revision.revisionId, priceVersionId: pv.id, confirmedLaborPrice: price, confirmedGarmentPrice: revision.baseInfo.quoteType === 'processing' ? null : '9999', note: 'USD explicitly confirmed' });
      assert.equal(confirmed.status, 200, confirmed.text);
    }
    return revision.revisionId;
  }
  const white = a.basis.priceLines.find(row => row.colorName === 'White')!.colorId!;
  await t.test('legacy PV confirmation cannot be relabelled through HTTP; creation fields cannot be rewritten', async () => {
    const record = (await x.repository.getById(x.distribution.q.id))!, revision = record.quote.revisions.find(row => row.revisionId === record.quote.defaultRevisionId)!;
    revision.priceVersions[1].pricingParameters.laborCurrency = 'USD';
    const response = await http('quotes/' + record.quote.id, { quote: record.quote, expectedVersion: record.version }, 'PUT'); assert.equal(response.status, 409); assert.match(response.text, /confirmed_labor_currency_requires_revision/u);
    const another = (await x.repository.getById(x.distribution.q.id))!, originalParent = another.quote.revisions.find(row => row.revisionId === another.quote.defaultRevisionId)!.parentRevisionId;
    another.quote.revisions.find(row => row.revisionId === another.quote.defaultRevisionId)!.parentRevisionId = null;
    assert.notEqual((await http('quotes/' + another.quote.id, { quote: another.quote, expectedVersion: another.version }, 'PUT')).status, 200);
    assert.equal((await x.repository.getById(another.quote.id))!.quote.revisions.find(row => row.revisionId === another.quote.defaultRevisionId)!.parentRevisionId, originalParent);
    await assert.rejects(async () => previewLaborAdoption(pool, editor.actor, { ...await intent(a.id), colorIds: [a.basis.priceLines[0].colorId] }), closingCode('labor_confirmation_currency_evidence_required'));
  });
  const revisionId = await successor(a.id), processingRevision = await successor(process.id, '0');
  await t.test('confirmation currency is server generated; explicit USD zero survives exact persistence', async () => {
    const r = (await x.repository.getById((await state(process.id)).quoteId))!;
    assert.equal(r.quote.revisions.find(row => row.revisionId === processingRevision)!.priceVersions[0].confirmation!.laborCurrencyAtConfirmation, 'USD');
    const response = await http('quotes/' + r.quote.id + '/confirmation-workflows', { action: 'confirmation.save', expectedVersion: r.version, revisionId: processingRevision,
      priceVersionId: r.quote.revisions.at(-1)!.priceVersions[0].id, confirmedLaborPrice: '1', confirmedGarmentPrice: null, note: '', laborCurrencyAtConfirmation: 'CNY' }); assert.equal(response.status, 400);
  });
  await t.test('preview is read-only, exposes only work channel, and requires actual fresh labor grants', async () => {
    const worker = await x.user('labor.only', LABOR_ADOPTION_PERMISSIONS), input = await intent(a.id, revisionId, [white]);
    const response = await http('quotes/order-labor-adoptions/preview', input, 'POST', worker.cookie); assert.equal(response.status, 200, response.text);
    for (const key of ['salePrice', 'baseSalePrice', 'fabrics', 'unitPrice', 'productHash', 'source_snapshot', '9999']) assert.equal(response.text.includes(key), false, key);
    assert.equal((await pool.query('SELECT count(*)::int n FROM order_labor_adoption_commands')).rows[0].n, 0);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='commercial.labor.edit'", [worker.role]);
    assert.equal((await http('quotes/order-labor-adoptions/preview', input, 'POST', worker.cookie)).status, 403);
    assert.equal((await http('quotes/order-labor-adoptions/preview', input, 'POST', null)).status, 401);
  });
  const originalA = await state(a.id), originalB = await state(b.id), selected = await command(a.id, revisionId, [white]);
  await t.test('two concurrent requests produce one immutable version and preserve sale, product, other colors and other order', async () => {
    const results = await Promise.all([executeLaborAdoption(pool, editor.actor, selected), executeLaborAdoption(pool, editor.actor, selected)]);
    assert.equal(results.filter(row => 'replayed' in row && row.replayed).length, 1); assert.ok(results.every(row => row.status === 'applied'));
    const current = await state(a.id); assert.equal(current.version, originalA.version + 1); assert.deepEqual(await state(b.id), originalB);
    for (const [index, old] of originalA.lines!.entries()) {
      const line = current.lines![index]; assert.deepEqual(line.source, old.source); assert.deepEqual(line.product, old.product); assert.equal(line.productHash, old.productHash);
      assert.equal(line.salePrice, old.salePrice); assert.equal(line.baseSalePrice, old.baseSalePrice); assert.equal(line.quantity, old.quantity);
      if (old.colorId === white) { assert.equal(line.laborCurrency, 'USD'); assert.equal(line.laborPrice, '4.25'); assert.equal(line.laborConfirmationSource!.revisionId, revisionId); }
      else assert.deepEqual(line, old);
    }
    assert.equal((await readLaborAdoptionReceipt(pool, editor.actor, selected.requestId)).state, 'recorded');
    await assert.rejects(() => executeLaborAdoption(pool, editor.actor, { ...selected, intent: { ...selected.intent, reason: 'different' } }), closingCode('labor_adoption_request_conflict'));
  });
  await t.test('same selected confirmation is an explicit no-op; runtime pause preserves historical replay', async () => {
    const c = await command(a.id, revisionId, [white]); const result = await executeLaborAdoption(pool, editor.actor, c); assert.equal(result.status, 'unchanged');
    assert.equal((await executeLaborAdoption(pool, editor.actor, c, 'frozen')).status, 'unchanged');
    await assert.rejects(() => executeLaborAdoption(pool, editor.actor, { ...c, requestId: randomUUID() }, 'frozen'), closingCode('order_commands_frozen'));
  });
  await t.test('processing original CNY blocks closing, explicit USD adoption keeps exact batch consumption and enables service-only closing', async () => {
    const period = (await x.apply({ action: 'create_period', month: '2026-10', taxRatePercent: '8', taxRateConfirmed: true, remark: 'Synthetic USD' })).result;
    const data = { quantity: '2', colorId: null, assignmentId: null, executor: { type: 'internal', id: x.group.id }, channels: { sales: false, work: true }, remark: '' };
    await assert.rejects(() => previewClosingCommand(pool, editor.actor, { action: 'create_allocation', periodId: period.periodId, expectedPeriodVersion: period.periodVersion, orderId: process.id, data }), closingCode('closing_usd_work_basis_required'));
    const batch = (await pool.query('SELECT to_jsonb(b) b FROM processing_order_batch_consumptions b WHERE sales_order_id=$1', [process.id])).rows;
    const before = await state(process.id), response = await http('quotes/order-labor-adoptions/commands', await command(process.id, processingRevision)); assert.equal(response.status, 200, response.text);
    const after = await state(process.id); assert.equal(after.laborCurrency, 'USD'); assert.equal(after.lines![0].laborPrice, '0'); assert.equal(after.lines![0].salePrice, null);
    assert.deepEqual((await pool.query('SELECT to_jsonb(b) b FROM processing_order_batch_consumptions b WHERE sales_order_id=$1', [process.id])).rows, batch);
    assert.equal((await pool.query('SELECT confirmed_labor_price::text p,labor_currency c FROM sales_order_commercial_versions WHERE id=$1', [before.id])).rows[0].c, 'CNY');
    const saved = await x.apply({ action: 'create_allocation', periodId: period.periodId, expectedPeriodVersion: period.periodVersion, orderId: process.id, data }); assert.equal(saved.result.status, 'applied');
    const basis = await readClosingOrderBasis(pool, editor.actor, process.id); assert.equal('garmentSale' in basis.priceLines[0], false);
    assert.ok((await findSalesOrderIdsByQuoteProvenance(pool, { quoteId: after.quoteId, revisionId: processingRevision, priceVersionId: after.lines![0].priceVersionId })).includes(process.id));
    const history = await readLaborAdoptionHistory(pool, editor.actor, new URLSearchParams({ orderId: process.id }));
    assert.equal(history.items[0].before[0].laborCurrency, 'CNY'); assert.equal(history.items[0].after[0].laborCurrency, 'USD');
    assert.equal(history.items[0].before[0].laborPrice, before.laborPrice);
  });
  await t.test('sale adjustment preserves separate USD confirmation and old commercial versions', async () => {
    const old = await state(a.id), item = { salesOrderId: a.id }, rule = { kind: 'amount' as const, value: '-1' };
    const preview = await previewSaleAdjustment(pool, editor.actor, { items: [item], rule });
    const pricePreview = preview.items[0]; assert.equal(pricePreview.status, 'ready'); if (pricePreview.status !== 'ready') assert.fail('Sale preview must be ready');
    const result = await commitSaleAdjustment(pool, editor.actor, { requestId: randomUUID(), reason: 'Synthetic sale only', rule, items: [{ ...item, expectedVersion: old.version, fingerprint: pricePreview.fingerprint }] });
    assert.equal(result.items[0].status, 'updated'); const current = await state(a.id);
    assert.deepEqual(current.lines!.map(line => line.laborConfirmationSource), old.lines!.map(line => line.laborConfirmationSource));
    assert.deepEqual(current.lines!.map(line => line.laborPrice), old.lines!.map(line => line.laborPrice));
    const history = await readLaborAdoptionHistory(pool, editor.actor, new URLSearchParams({ orderId: a.id })); assert.ok(history.items.length >= 2); assert.equal(JSON.stringify(history).includes('salePrice'), false);
  });
  await t.test('stale preview is durably rejected, and replay does not depend on current quote availability', async () => {
    const c = await command(b.id, revisionId);
    const current = (await x.repository.getById(x.distribution.q.id))!; current.quote.revisions.at(-1)!.note += ' later'; await x.repository.save(current.quote, current.version);
    const rejected = await executeLaborAdoption(pool, editor.actor, c); assert.equal(rejected.status, 'rejected'); assert.equal(rejected.status === 'rejected' && rejected.error.code, 'labor_adoption_preview_changed');
    assert.equal((await executeLaborAdoption(pool, editor.actor, c)).status, 'rejected'); assert.equal((await executeLaborAdoption(pool, editor.actor, selected)).status, 'applied');
  });
  await t.test('audit failure rolls back line, version, head and receipt atomically', async () => {
    const c = await command(b.id, revisionId), before = await state(b.id);
    await pool.query("CREATE FUNCTION fail_labor_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'workflow'='usd_labor_adoption' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_labor_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION fail_labor_audit()");
    try { await assert.rejects(() => executeLaborAdoption(pool, editor.actor, c)); } finally { await pool.query('DROP TRIGGER fail_labor_audit ON operation_logs; DROP FUNCTION fail_labor_audit()'); }
    assert.deepEqual(await state(b.id), before); assert.equal((await readLaborAdoptionReceipt(pool, editor.actor, c.requestId)).state, 'unknown');
  });
  await t.test('lost COMMIT acknowledgement is verified through the original receipt and does not repeat application', async () => {
    const c = await command(b.id, revisionId), original = pool.connect.bind(pool);
    const controlled = new Proxy(pool, { get(target, key) { if (key !== 'connect') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
      return async () => { const connection = await original(), query = connection.query.bind(connection); let armed = false;
        return new Proxy(connection, { get(target, key) { if (key !== 'query') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
          return async (sql: string, params: unknown[]) => { if (sql.startsWith('INSERT INTO order_labor_adoption_commands')) armed = true; const result = await query(sql, params);
            if (sql === 'COMMIT' && armed) { armed = false; throw Error('Synthetic lost receipt'); } return result; }; } }); }; } }) as pg.Pool;
    assert.equal((await executeLaborAdoption(controlled, editor.actor, c)).status, 'unverified'); assert.equal((await readLaborAdoptionReceipt(pool, editor.actor, c.requestId)).state, 'recorded');
    assert.equal((await executeLaborAdoption(pool, editor.actor, c)).status, 'applied');
    assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions WHERE actor_id=$1 AND request_id=$2', [editor.actor.internalUserId, c.requestId])).rows[0].n, 1);
  });
  await t.test('SQL blocks overwritten evidence and standalone fabricated receipts', async () => {
    await assert.rejects(() => pool.query("UPDATE sales_order_commercial_lines SET labor_confirmation_source='{}' WHERE sales_order_id=$1", [a.id]));
    await assert.rejects(() => pool.query("DELETE FROM order_labor_adoption_commands WHERE request_id=$1", [selected.requestId]));
    await assert.rejects(() => pool.query(`INSERT INTO order_labor_adoption_commands(actor_id,request_id,declared_order_id,payload_hash,command,result)
      VALUES($1,$2,$3,$4,'{}','{}')`, [editor.actor.internalUserId, randomUUID(), a.id, 'a'.repeat(64)]));
  });
  await t.test('existing CCT null never falls back to PV; CCT-only changes invalidate an outstanding preview', async () => {
    const pending = await x.order(), pendingWhite = pending.basis.priceLines.find(row => row.colorName === 'White')!.colorId!;
    const current = await state(a.id), line = current.lines!.find(row => row.colorId === white)!, record = (await x.repository.getById(current.quoteId))!;
    const provenance = { quoteId: current.quoteId, revisionId, priceVersionId: line.priceVersionId };
    const first = await updateConfirmedCommercialTermsByQuote(pool, editor.actor, provenance, { expectedVersion: 0, expectedQuoteVersion: record.version, confirmedLaborPrice: null, laborCurrency: 'USD' });
    await assert.rejects(async () => previewLaborAdoption(pool, editor.actor, await intent(pending.id, revisionId, [pendingWhite])), closingCode('labor_usd_confirmation_required'));
    const second = await updateConfirmedCommercialTermsByQuote(pool, editor.actor, provenance, { expectedVersion: first.current!.version, expectedQuoteVersion: record.version, confirmedLaborPrice: '6', laborCurrency: 'USD' });
    const c = await command(pending.id, revisionId, [pendingWhite]);
    await updateConfirmedCommercialTermsByQuote(pool, editor.actor, provenance, { expectedVersion: second.current!.version, expectedQuoteVersion: record.version, confirmedLaborPrice: '7', laborCurrency: 'USD' });
    const result = await executeLaborAdoption(pool, editor.actor, c); assert.equal(result.status, 'rejected'); assert.equal(result.status === 'rejected' && result.error.code, 'labor_adoption_preview_changed');
    assert.equal((await state(a.id)).lines!.find(row => row.colorId === white)!.laborPrice, '4.25');
  });
  await t.test('a real two-level successor works; product differences block even with a fresh USD confirmation', async () => {
    const order = await x.processing('CNY'), first = await successor(order.id), second = await successor(order.id, '1.75', first);
    assert.equal((await executeLaborAdoption(pool, editor.actor, await command(order.id, second))).status, 'applied');
    const record = (await x.repository.getById((await state(order.id)).quoteId))!; record.quote.revisions.at(-1)!.priceVersions[0].labor.description = 'A different process';
    const saved = await http('quotes/' + record.quote.id, { quote: record.quote, expectedVersion: record.version }, 'PUT'); assert.equal(saved.status, 200, saved.text);
    await assert.rejects(async () => previewLaborAdoption(pool, editor.actor, await intent(order.id, second)), closingCode('labor_product_changed'));
  });
  await t.test('generic PUT-created successor and duplicate creation audits cannot manufacture trusted lineage', async () => {
    const order = await x.processing('CNY'), source = await state(order.id), record = (await x.repository.getById(source.quoteId))!;
    const built = applyQuoteVersionCommand(record.quote, { action: 'revision.create', expectedVersion: record.version, sourceRevisionId: source.revisionId, reason: '其他', note: 'Client-built legacy path' },
      { id: randomUUID, actor: 'Client provided name', now: new Date().toISOString() });
    const saved = await http('quotes/' + record.quote.id, { quote: built, expectedVersion: record.version }, 'PUT'); assert.equal(saved.status, 200, saved.text);
    await assert.rejects(async () => previewLaborAdoption(pool, editor.actor, await intent(order.id, built.defaultRevisionId)), closingCode('labor_revision_creation_evidence_required'));
    const trusted = await successor(order.id), proof = (await pool.query("SELECT * FROM operation_logs WHERE quote_id=$1 AND context->>'revisionId'=$2 AND metadata->>'workflowAction'='revision.create'", [source.quoteId, trusted])).rows[0];
    const client = await pool.connect(); try {
      await client.query('BEGIN'); await appendOperationLog(client, editor.actor, { module: '报价中心', action: '保存报价', entityType: 'Quote', entityId: source.quoteId, quoteId: source.quoteId,
        context: proof.context, beforeData: proof.before_data, afterData: proof.after_data, metadata: proof.metadata }); await client.query('COMMIT');
    } finally { client.release(); }
    await assert.rejects(async () => previewLaborAdoption(pool, editor.actor, await intent(order.id, trusted)), closingCode('labor_revision_creation_evidence_required'));
  });
  await t.test('USD→USD price or same-price provenance changes are outside D162; mixed selections fail atomically', async () => {
    async function denied(input: Awaited<ReturnType<typeof intent>>) {
      await assert.rejects(() => previewLaborAdoption(pool, editor.actor, input), closingCode('labor_conversion_scope_cny_required'));
      const requestId = randomUUID(), before = await state(input.orderId);
      const response = await http('quotes/order-labor-adoptions/commands', { requestId, intent: input, previewHash: '0'.repeat(64) });
      assert.equal(response.status, 409); assert.match(response.text, /labor_conversion_scope_cny_required/u);
      const receipt = await readLaborAdoptionReceipt(pool, editor.actor, requestId); assert.equal(receipt.state, 'recorded');
      assert.equal('result' in receipt && receipt.result.status, 'rejected'); assert.deepEqual(await state(input.orderId), before);
    }
    const order = await x.processing('CNY'), first = await successor(order.id, '2');
    const saved = await executeLaborAdoption(pool, editor.actor, await command(order.id, first)); assert.equal(saved.status, 'applied');
    const different = await successor(order.id, '3');
    await denied(await intent(order.id, different));
    const same = await successor(order.id, '2');
    await denied(await intent(order.id, same));
    const mixed = await x.order(); const before = await state(mixed.id);
    await denied(await intent(mixed.id, revisionId));
    assert.deepEqual(await state(mixed.id), before);
  });
  await t.test('completed orders reject new adoption, while exact original receipts stay readable', async () => {
    await pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1", [process.id]);
    await assert.rejects(async () => previewLaborAdoption(pool, editor.actor, await intent(process.id, processingRevision)), closingCode('order_commercial_frozen'));
    const history = await readLaborAdoptionHistory(pool, editor.actor, new URLSearchParams({ orderId: process.id })); assert.equal(history.items[0].before[0].laborCurrency, 'CNY');
  });
  await t.test('CNY→USD adoption cannot reprice existing locked closing snapshots or their earlier versions', async () => {
    const order = await x.order(), source = await state(order.id), color = source.lines!.find(row => row.colorName === 'White')!;
    const created = (await x.apply({ action: 'create_period', month: '2026-12', taxRatePercent: '0', taxRateConfirmed: true, remark: 'Preserve old USD closing' })).result;
    const allocation = (await x.apply({ action: 'create_allocation', periodId: created.periodId, expectedPeriodVersion: created.periodVersion, orderId: order.id,
      data: { quantity: '2', colorId: color.colorId, assignmentId: null, executor: null, channels: { sales: true, work: false }, remark: '' } })).result;
    const confirmed = (await x.apply({ action: 'confirm_period', periodId: created.periodId, expectedPeriodVersion: allocation.periodVersion, reason: 'Explicit confirmation' })).result;
    await x.apply({ action: 'lock_period', periodId: created.periodId, expectedPeriodVersion: confirmed.periodVersion, reason: 'Explicit lock' });
    const frozen = (await pool.query('SELECT to_jsonb(v) snapshot FROM server_closing_allocation_versions v WHERE sales_order_id=$1 ORDER BY version', [order.id])).rows;
    assert.equal((await executeLaborAdoption(pool, editor.actor, await command(order.id, revisionId))).status, 'applied');
    assert.equal(color.laborCurrency, 'CNY'); assert.equal((await state(order.id)).lines!.find(row => row.colorId === color.colorId)!.laborCurrency, 'USD');
    assert.deepEqual((await pool.query('SELECT to_jsonb(v) snapshot FROM server_closing_allocation_versions v WHERE sales_order_id=$1 ORDER BY version', [order.id])).rows, frozen);
    const client = await pool.connect(); try { await client.query('BEGIN READ ONLY'); const references = await normalizationReferences(client);
      assert.ok(references.some(([table, column]) => table === 'order_labor_adoption_commands' && column === 'sales_order_id'));
      assert.ok(references.some(([table, column]) => table === 'order_labor_adoption_commands' && column === 'declared_order_id')); await client.query('COMMIT');
    } finally { client.release(); }
  });
  await t.test('owned full backup/restore preserves labor provenance, immutable receipts and original physical identities', async () => {
    const source = (await pool.query('SELECT current_database() name')).rows[0].name as string;
    const targetUrl = await x.postgres.createDatabase('labor_restore'), targetName = new URL(targetUrl).pathname.slice(1);
    assert.match(source, /^zhixu_it_closing_commands_[a-f0-9]{8}$/u); assert.match(targetName, /^zhixu_it_labor_restore_[a-f0-9]{8}$/u); assert.notEqual(source, targetName);
    const restored = new pg.Pool({ connectionString: targetUrl });
    const digest = async (db: pg.Pool) => {
      const result: Record<string, unknown> = {};
      for (const { tablename } of (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows) {
        assert.match(tablename, /^[a-z0-9_]+$/u); result[tablename] = (await db.query(`SELECT count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) hash FROM public."${tablename}" t`)).rows[0];
      } return result;
    };
    try {
      assert.equal((await restored.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
      const before = await digest(pool), docker = (args: string[]) => promisify(execFile)('docker', ['exec', x.postgres.containerName, ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true });
      await docker(['pg_dump', '-U', 'postgres', '-d', source, '-Fc', '-f', '/tmp/labor-owned-synthetic.dump']);
      await docker(['pg_restore', '-U', 'postgres', '--exit-on-error', '--no-owner', '-d', targetName, '/tmp/labor-owned-synthetic.dump']);
      assert.deepEqual(await digest(restored), before); assert.deepEqual((await runMigrations(restored, resolve('database/migrations'))).applied, []);
      assert.deepEqual(await readLaborAdoptionReceipt(restored, editor.actor, selected.requestId), await readLaborAdoptionReceipt(pool, editor.actor, selected.requestId));
      assert.deepEqual(await state(a.id), (await readOrderCommercialState(restored, a.id)).current);
      assert.deepEqual(await digest(restored), before);
    } finally { await restored.end(); }
  });
});
