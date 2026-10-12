import assert from 'node:assert/strict';
import test from 'node:test';
import type { PermissionKey } from '../../features/permissions/model/permissions.js';
import { startCommercialSecurityFixture } from './commercial-security-fixture.js';

test('Material integration: actual session HTTP denies protected commercial bytes after PR93', async t => {
  const x = await startCommercialSecurityFixture();
  t.after(x.close);
  const common: PermissionKey[] = ['order.view', 'quote.view', 'style_progress.read'];
  const cases: { name: string; sale: boolean; labor: boolean; cost: boolean }[] = [
    { name: 'viewer', sale: false, labor: false, cost: false },
    { name: 'cost', sale: false, labor: false, cost: true },
    { name: 'sale', sale: true, labor: false, cost: false },
    { name: 'labor', sale: false, labor: true, cost: false },
    { name: 'full', sale: true, labor: true, cost: true },
  ];
  let fullCookie = '';
  await t.test('unauthenticated Order/Quote terms and aggregate return safe 401', async () => {
    for (const path of [x.orderPath, x.quoteTermsPath, x.quotePath]) {
      const r = await x.request(path);
      assert.equal(r.response.status, 401);
      assert.equal(/12345|67890|98765/.test(r.text), false);
    }
  });
  for (const c of cases) await t.test(c.name + ' independent trusted read grants', async () => {
    const keys: PermissionKey[] = [...common];
    if (c.sale) keys.push('commercial.sale.view');
    if (c.labor) keys.push('commercial.labor.view');
    if (c.cost) keys.push('quote.cost.view');
    const cookie = await x.user('material-security-' + c.name, keys);
    if (c.name === 'full') fullCookie = cookie;
    for (const path of [x.orderPath, x.quoteTermsPath]) {
      const r = await x.request(path, cookie);
      assert.equal(r.response.status, 200);
      assert.equal(r.response.headers.get('cache-control'), 'no-store');
      const dto = r.body.confirmedCommercialTerms;
      assert.equal(dto.contract, 'commercial-terms-read.v1');
      assert.equal(dto.current.sale.visibility, c.sale ? 'allowed' : 'restricted');
      assert.equal(dto.current.labor.visibility, c.labor ? 'allowed' : 'restricted');
      assert.equal(Object.hasOwn(dto.current.sale, 'value'), c.sale);
      assert.equal(Object.hasOwn(dto.current.labor, 'value'), c.labor);
      assert.equal(r.text.includes('12345'), c.sale);
      assert.equal(r.text.includes('67890'), c.labor);
      assert.equal(r.text.includes('USD'), c.labor);
      if (c.sale) assert.equal(dto.current.sale.value.price, '12345');
      if (c.labor) assert.deepEqual(dto.current.labor.value, { price: '67890', currency: 'USD' });
    }
    const aggregate = await x.request(x.quotePath, cookie);
    assert.equal(aggregate.response.status, 200);
    assert.equal(aggregate.response.headers.get('cache-control'), 'no-store');
    assert.equal(aggregate.text.includes('98765'), c.cost, 'Quote labor cost is separate from confirmed labor');
    const denied = await x.request(x.orderPath, cookie, { expectedVersion: 1, customerConfirmedPrice: '0' }, 'PATCH');
    assert.equal(denied.response.status, 403, 'read grants never authorize a write');
    assert.equal(/12345|67890|98765/.test(denied.text), false);
  });
  await t.test('existing full-reader session immediately loses revoked values without cache reuse', async () => {
    await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='material-security-full' AND (permission_key LIKE 'commercial.%' OR permission_key='quote.cost.view')");
    for (const path of [x.orderPath, x.quoteTermsPath, x.quotePath]) {
      const r = await x.request(path, fullCookie);
      assert.equal(r.response.status, 200);
      assert.equal(r.response.headers.get('cache-control'), 'no-store');
      assert.equal(/12345|67890|98765/.test(r.text), false);
    }
    assert.equal((await x.request(x.orderPath.replace('/confirmed-commercial-terms', '/material-progress'), fullCookie)).response.status, 503, 'production Source capability stays off');
    assert.equal((await x.pool.query('SELECT customer_confirmed_price::text,confirmed_labor_price::text,labor_currency FROM confirmed_commercial_terms')).rows[0].customer_confirmed_price, '12345');
    assert.deepEqual(x.errors, []);
  });
});