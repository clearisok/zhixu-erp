// Real built UI/session/API; only owned disposable PostgreSQL and Chromium.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.ts';
import { waitForChromiumEndpoint } from './chromium-endpoint.mjs';
import { runMigrations } from '../db/migration-runner.ts';
import { synchronizePermissionCatalog } from '../auth/permissions.ts';
import { createApp } from '../app.ts';
import { createAinuokeSalesOrder } from '../sales-orders/service.ts';

const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label, timeout = 16000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { try { if (await read()) return; } catch (error) { if (!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context/.test(String(error))) throw error; } await wait(60); }
  throw Error(label + ' timed out');
}
async function fixture(staticDirectory) {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase('production_plan_ui') });
  const errors = [], origins = [], server = createServer(createApp({ pool, staticDirectory, allowedOrigins: origins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: event => errors.push(event) } }));
  const close = async () => { if (server.listening) await new Promise(done => server.close(done)); await pool.end(); await db.stop(); };
  try {
    await runMigrations(pool, resolve('database/migrations')); await synchronizePermissionCatalog(pool);
    const password = 'Synthetic-Planning-Only';
    const permissions = ['quote.view', 'order.view', 'schedule.view', 'schedule.create', 'schedule.edit', 'ainuoke.sync', 'settings.production_infrastructure.edit', 'settings.production_group.edit', 'settings.outsource_factory.edit'];
    const user = async (username, grants = permissions) => {
      const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt($2,gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [username, password])).rows[0];
      await pool.query('INSERT INTO app_roles(id,name) VALUES($1,$1)', [username]); await pool.query('INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)', [row.id, username]);
      for (const key of grants) await pool.query('INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)', [username, key]);
      return { internalUserId: row.id, userId: row.public_id, userName: username, username, permissions: grants };
    };
    const actor = await user('plan.editor'); await user('plan.second'); await user('plan.viewer', ['quote.view', 'order.view', 'schedule.view']); await user('plan.denied', ['quote.view']);
    await new Promise(done => server.listen(0, '127.0.0.1', done)); const base = 'http://127.0.0.1:' + server.address().port; origins.push(base);
    const login = async username => { const response = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Zhixu-Request': '1' }, body: JSON.stringify({ username, password }) }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; };
    const cookie = await login('plan.editor');
    const request = async (path, body) => { const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-Zhixu-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data; };
    const resource = async (kind, data, identity = {}) => (await request('/api/v1/production-resources/commands', { requestId: randomUUID(), kind, action: 'create', resourceId: null, expectedVersion: 0, ...identity, data })).resource;
    const changeResource = (row, patch) => { const { id, kind, version, createdAt: _c, updatedAt: _u, ...data } = row; void _c; void _u; return resource(kind, { ...data, ...patch }, { action: 'update', resourceId: id, expectedVersion: version }); };
    const order = async (index, colors = [{ colorName: '黑色', quantity: 60.125 }, { colorName: '白色', quantity: 40 }]) => {
      const key = 'SYN-PLAN-' + String(index).padStart(2, '0');
      const result = await createAinuokeSalesOrder(pool, actor, { source: { sourceId: key, sourceRowIdentity: key, salesContractNo: 'CONTRACT-' + key, insideOrderNo: key, lifecycleStatusRaw: '生效', contractDate: '2027-01-01', contractDeliveryDate: '2027-02-01', styleNo: key, companyNameSnapshot: '合成公司', customerNameSnapshot: '合成客户', brandNameSnapshot: '合成品牌', quantity: 100.125, sourceHash: key, fetchedAt: '2026-10-20T00:00:00Z' },
        colors: colors.map((row, n) => ({ ...row, sourceLineIdentity: key + '-COLOR-' + n, deliveryDate: '2027-02-01', sourceHash: key + '-HASH-' + n })) });
      return result.salesOrder.id;
    };
    const plan = async (orderId, data, edit) => {
      const current = await request('/api/v1/production-scheduling/orders/' + orderId);
      const intent = { action: edit ? 'update' : 'create', orderId, assignmentId: edit?.id ?? null, expectedVersion: edit?.version ?? 0, expectedPlanVersion: current.order.planVersion, data, ...(edit ? { reason: 'Synthetic UI fixture history' } : {}) };
      const preview = await request('/api/v1/production-scheduling/preview', intent);
      return request('/api/v1/production-scheduling/commands', { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
    };
    return { pool, errors, base, password, login, user, resource, changeResource, order, plan, request, close };
  } catch (error) { await close(); throw error; }
}

test('Gate6B built scheduling preserves exact plans, recovery, source boundaries and session ownership', { timeout: 300000 }, async t => {
  const build = JSON.parse(readFileSync('dist/client/build-info.json', 'utf8')); assert.equal(build.quoteAuthority, 'server'); assert.equal(build.identityMode, 'session');
  const x = await fixture(resolve('dist/client')), temp = await mkdtemp(join(tmpdir(), 'zhixu-plan-ui-'));
  const evidence = resolve('outputs/production-planning-ui', build.gitCommit + '-' + Date.now()); await mkdir(evidence, { recursive: true });
  const pending = new Map(), errors = [], network = [], geometry = [];
  let browser, ws, session, sequence = 0, closeBrowser, evaluate;
  const phase = async (name, run) => { let failure; await t.test(name, async () => { try { await run(); } catch (error) { failure = error; throw error; } }); if (failure) { await writeFile(join(evidence, 'failure.json'), JSON.stringify({ name, body: evaluate ? await evaluate('document.body?.innerText').catch(() => '') : '', fields: evaluate ? await evaluate("[...document.querySelectorAll('[role=dialog] input,[role=dialog] select,[role=dialog] textarea')].map(n=>({label:n.getAttribute('aria-label'),value:n.value,disabled:n.matches(':disabled')}))").catch(() => []) : [], errors, network }, null, 2)); throw Error('Planning UI prerequisite failed: ' + name, { cause: failure }); } };
  try {
    const profile = join(temp, 'profile'); browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const [port, endpoint] = await waitForChromiumEndpoint(profile, { timeoutMs: 30000 }); ws = new WebSocket('ws://127.0.0.1:' + port + endpoint); await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, sid = session) => new Promise((done, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 20000); pending.set(id, { done, reject, timer }); ws.send(JSON.stringify({ id, method, params, sessionId: sid })); });
    closeBrowser = () => command('Browser.close', {}, undefined);
    ws.addEventListener('message', ({ data }) => { const event = JSON.parse(String(data)), call = pending.get(event.id); if (call) { pending.delete(event.id); clearTimeout(call.timer); if (event.error) call.reject(Error(JSON.stringify(event.error))); else call.done(event.result); } if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text); if (event.method === 'Network.requestWillBeSent') network.push({ method: event.params.request.method, path: new URL(event.params.request.url).pathname }); if (event.method === 'Page.javascriptDialogOpening') void command('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
    ws.addEventListener('close', () => { for (const call of pending.values()) { clearTimeout(call.timer); call.reject(Error('Owned browser closed')); } pending.clear(); });
    const target = await command('Target.createTarget', { url: 'about:blank' }, undefined); session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)).sessionId; await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const navigate = async path => { const marker = Date.now() + Math.random(); await evaluate('window.navEpoch=' + marker); await command('Page.navigate', { url: x.base + path }); await until(() => evaluate('window.navEpoch!==' + marker + "&&document.readyState==='complete'"), 'navigation'); };
    const has = text => until(() => evaluate('Boolean(document.body?.innerText.includes(' + JSON.stringify(text) + '))'), text);
    const click = async (label, selector = 'button,a') => { const predicate = `n=>(n.getAttribute('aria-label')??n.textContent.trim())===${JSON.stringify(label)}&&!n.matches(':disabled')&&n.getClientRects().length`; await until(() => evaluate(`Boolean([...document.querySelectorAll(${JSON.stringify(selector)})].find(${predicate}))`), 'enabled ' + label); await evaluate(`(()=>{[...document.querySelectorAll(${JSON.stringify(selector)})].find(${predicate}).click()})()`); };
    const field = async (selector, value, tag = 'HTMLInputElement') => { await until(() => evaluate('Boolean(document.querySelector(' + JSON.stringify(selector) + '))'), 'field ' + selector); if (tag === 'HTMLSelectElement') await until(() => evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].some(n=>n.value===${JSON.stringify(value)})`), 'option ' + selector); return evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event(${tag === 'HTMLSelectElement' ? "'change'" : "'input'"},{bubbles:true}))})()`); };
    const loginCookie = async username => { const cookie = await x.login(username), i = cookie.indexOf('='); await command('Network.setCookie', { name: cookie.slice(0, i), value: cookie.slice(i + 1), domain: '127.0.0.1', path: '/', httpOnly: true }); };
    const loginUI = async username => { await field('input[name=username]', username); await field('input[name=password]', x.password); await click('登录织序'); };
    const posts = () => network.filter(row => row.method === 'POST' && row.path === '/api/v1/production-scheduling/commands').length;
    const count = async table => (await x.pool.query('SELECT count(*)::int n FROM ' + table)).rows[0].n;
    const shot = async name => { const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(join(evidence, name + '.png'), Buffer.from(image.data, 'base64')); };
    const poolSearch = async name => { await click('未排订单'); await field('input[aria-label=搜索排单]', name); await has(name.split(' ')[0]); await until(() => evaluate("document.querySelectorAll('.ps-pool-row:not(.head)').length===1"), 'one order'); };
    const startPlan = async (name, group, quantity = '30') => { await poolSearch(name); await click('排单', '.ps-pool-row button'); await has('直接排单'); await field('select[aria-label=生产组选择]', group, 'HTMLSelectElement'); await field('input[aria-label=排单数量]', quantity); await field('input[aria-label=所需工作日]', '2'); await field('input[aria-label=计划开始]', '2027-01-04'); };
    const savePreview = async () => { await click('预览排单'); await has('确认排单变更'); await click('确认保存'); await has('排单已保存'); };
    const closeClean = () => click('取消', '[role=dialog] button');
    const pendingCommand = () => evaluate("JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k=>k.startsWith('zhixu.server.production-plan.pending.v1.')))).command");
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.planMode='ready';window.planListMode='ready';window.planReceiptMode='ready';window.planPreviewMode='ready';window.planWaiters=[];window.planPostWaiters=[];window.planReceiptWaiters=[];window.planPreviewWaiters=[];window.planLateWaiters=[];window.planBodies=[];
      const planFetch=fetch;window.fetch=async(...args)=>{const u=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href),m=args[1]?.method??'GET';
        if(u.pathname==='/api/v1/production-scheduling/commands'&&m==='POST'){planBodies.push(JSON.parse(args[1].body));const mode=planMode;planMode='ready';if(mode==='before-network')throw Error('synthetic offline before send');if(mode==='late'){planLateWaiters.push(()=>planFetch(...args));throw Error('synthetic response missing before late arrival');}const r=await planFetch(...args);if(mode==='lost')throw Error('synthetic lost reply');if(mode==='mismatch'){const d=await r.json();return Response.json({...d,payloadHash:'a'.repeat(64)},{status:r.status});}if(mode==='delay200'||mode==='delay401'){const d=await r.json();return new Promise(done=>planPostWaiters.push(()=>done(mode==='delay401'?Response.json({error:{code:'synthetic_old_expired'}},{status:401}):Response.json(d,{status:r.status}))));}return r;}
        if(u.pathname==='/api/v1/production-scheduling/preview'){const mode=planPreviewMode;planPreviewMode='ready';const r=await planFetch(...args);return mode==='hold'?new Promise(done=>planPreviewWaiters.push(()=>done(r))):r;}
        if(u.pathname.startsWith('/api/v1/production-scheduling/commands/')){const mode=planReceiptMode;planReceiptMode='ready';const r=await planFetch(...args);if(mode==='mismatch'){const d=await r.json();return Response.json({...d,result:d.result?{...d.result,payloadHash:'a'.repeat(64)}:d.result});}if(mode==='delay200'||mode==='delay401'){const d=await r.json();return new Promise(done=>planReceiptWaiters.push(()=>done(mode==='delay401'?Response.json({error:{code:'synthetic_old_expired'}},{status:401}):Response.json(d,{status:r.status}))));}return r;}
        if(/^\\/api\\/v1\\/production-scheduling\\/(groups|orders)$/.test(u.pathname)&&m==='GET'){const mode=planListMode;planListMode='ready';const r=await planFetch(...args);if(mode==='delay200'||mode==='delay401')return new Promise(done=>planWaiters.push(()=>done(mode==='delay401'?Response.json({error:{code:'synthetic_old_expired'}},{status:401}):r)));return r;}return planFetch(...args);};` });
    await loginCookie('plan.editor'); await navigate('/production-scheduling');
    await phase('empty Server route preserves Browser namespaces and exposes only the authorized existing menu', async () => {
      await has('暂无生产组'); assert.equal(posts(), 0); for (const table of ['production_groups', 'sales_orders', 'production_schedule_assignments', 'quote_center_quotes']) assert.equal(await count(table), 0);
      assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.'))"), []);
      assert.deepEqual(await evaluate('indexedDB.databases().then(rows=>rows.map(row=>row.name))'), []);
      await evaluate("localStorage.setItem('zhixu.erp.local.production-scheduling','synthetic-preserved-browser');localStorage.setItem('zhixu.erp.local.operations-settings','synthetic-preserved-resources')");
      assert.equal(await evaluate("document.querySelectorAll('button[aria-label=生产排单]').length"), 1); assert.equal(await evaluate("document.body.innerText.includes('关账中心')"), false);
    });
    const calendar = await x.resource('calendars', { name: '合成工作日历', enabled: true, remark: '', workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
    const site = await x.resource('sites', { name: '合成生产地点', enabled: true, remark: '', countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
    const group = await x.resource('groups', { name: 'A合成一组', enabled: true, remark: '', shortName: 'A', productionSiteId: site.id, sortOrder: 0 });
    const second = await x.resource('groups', { name: 'B合成二组', enabled: true, remark: '', shortName: 'B', productionSiteId: site.id, sortOrder: 1 });
    let factory = await x.resource('factories', { name: '合成原外发厂', enabled: true, remark: '', shortName: '', contactPerson: '', phone: '' });
    for (let n = 0; n < 21; n++) await x.resource('groups', { name: 'Z分页组' + n, enabled: true, remark: '', shortName: '', productionSiteId: site.id, sortOrder: n + 2 });
    const orders = []; for (let n = 1; n <= 24; n++) orders.push(await x.order(n));
    const ambiguous = await x.order(25, [{ colorName: '红色', quantity: 30 }, { colorName: '红色', quantity: 70.125 }]); void ambiguous;
    const data = patch => ({ executionType: 'internal', executorId: group.id, colorId: null, plannedQuantity: '10', duration: { mode: 'workdays', workdays: 2 }, dates: { mode: 'auto_queue', startDate: '2027-01-04' }, remark: '', ...patch });
    await phase('global pagination, AND search and reference paging precede an explicit exact-decimal plan', async () => {
      await click('未排订单'); await has('SYN-PLAN-01'); assert.equal(await evaluate("document.querySelectorAll('.ps-pool-row:not(.head)').length"), 20); await click('下一页'); await has('SYN-PLAN-21'); assert.equal(await evaluate("document.querySelectorAll('.ps-pool-row:not(.head)').length"), 5);
      await poolSearch('SYN-PLAN-01 合成客户'); await click('排单', '.ps-pool-row button'); await has('直接排单');
      assert.equal(await evaluate("document.querySelector('select[aria-label=生产组选择]').value"), ''); assert.equal(await evaluate("document.querySelector('input[aria-label=计划开始]').value"), '');
      await has('23 条'); await click('下页生产组'); await has('第 2 页'); await field('input[aria-label=搜索生产组]', 'A合成一组'); await has('1 条'); await field('select[aria-label=生产组选择]', group.id, 'HTMLSelectElement');
      await field('input[aria-label=排单数量]', '40.125'); await field('input[aria-label=所需工作日]', '2'); await field('input[aria-label=计划开始]', '2027-01-04');
      await until(() => evaluate("document.querySelector('input[aria-label=平均日产]').value==='21'"), 'exact ceil daily output');
      await click('预览排单'); await has('确认排单变更'); assert.equal(await count('production_schedule_assignments'), 0); const before = posts();
      await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent==='确认保存');b.click();b.click()})()"); await has('排单已保存'); assert.equal(posts(), before + 1); assert.equal(await count('production_schedule_assignments'), 1);
      const saved = (await x.pool.query('SELECT planned_quantity::text,daily_output_snapshot::text FROM production_schedule_assignments')).rows[0]; assert.equal(saved.planned_quantity, '40.125'); assert.equal(saved.daily_output_snapshot, '21'); await shot('first-plan');
    });
    await phase('ambiguous source colors never display one duplicate row as a total', async () => {
      await startPlan('SYN-PLAN-25', group.id); const options = await evaluate("[...document.querySelector('select[aria-label=排单颜色]').options].map(n=>({text:n.text,disabled:n.disabled}))");
      assert.equal(options.filter(n => n.text.includes('红色')).length, 1); assert.ok(options.find(n => n.text.includes('红色')).disabled); assert.equal(options.find(n => n.text.includes('红色')).text, '红色（数量待核对）'); await closeClean(); await has('有未保存修改'); await click('放弃修改');
    });
    await phase('a competing plan rejects stale confirmation without losing input or creating a duplicate', async () => {
      await startPlan('SYN-PLAN-02', group.id, '30'); await click('预览排单'); await has('确认排单变更'); await x.plan(orders[1], data({ executorId: second.id })); const n = await count('production_schedule_assignments');
      await click('确认保存'); await has('这张订单的排单已更新'); assert.equal(await count('production_schedule_assignments'), n); assert.equal(await evaluate("Object.keys(sessionStorage).some(k=>k.startsWith('zhixu.server.production-plan.pending.v1.'))"), false);
      await click('重新读取订单'); await has('输入已保留'); assert.equal(await evaluate("document.querySelector('input[aria-label=排单数量]').value"), '30'); await savePreview();
    });
    let externalId;
    await phase('external plans keep fixed dates and adopted resource facts through master rename and disabling', async () => {
      await poolSearch('SYN-PLAN-03'); await click('排单', '.ps-pool-row button'); await field('select[aria-label=生产组织]', 'outsource', 'HTMLSelectElement'); await field('select[aria-label=外发厂选择]', factory.id, 'HTMLSelectElement'); await field('input[aria-label=所需工作日]', '3'); await field('input[aria-label=计划开始]', '2027-01-10'); await field('input[aria-label=计划结束]', '2027-01-14'); await field('input[aria-label=排单数量]', '15'); await savePreview();
      const row = (await x.pool.query('SELECT id::text,resource_snapshot_hash,first_production_date,non_working_day_count FROM production_schedule_assignments WHERE sales_order_id=$1', [orders[2]])).rows[0]; externalId = row.id; assert.equal(row.first_production_date, null); assert.equal(row.non_working_day_count, null);
      factory = await x.changeResource(factory, { name: '主资料新厂名', enabled: false }); await click('查看排单', '.ps-pool-row button'); await has('合成原外发厂'); await click('编辑排单', '[role=dialog] button'); await has('本条已采用：合成原外发厂'); await field('textarea[aria-label=排单备注]', '只改备注', 'HTMLTextAreaElement'); await savePreview();
      assert.equal((await x.pool.query('SELECT resource_snapshot_hash FROM production_schedule_assignments WHERE id=$1', [externalId])).rows[0].resource_snapshot_hash, row.resource_snapshot_hash);
    });
    await phase('queue replan identifies each order and preserves manually fixed dates', async () => {
      const fixed = (await x.plan(orders[3], data({ plannedQuantity: '200', dates: { mode: 'manual_fixed', startDate: '2027-01-20', endDate: '2027-01-22' } }))).assignments[0];
      await x.changeResource(calendar, { exceptions: [{ date: '2027-01-06', type: 'non_working', name: '合成休息日' }] });
      await click('生产组', '.ps-view-tabs button'); await click('重新读取'); await has('A合成一组');
      await click('预览重排'); await evaluate("planPreviewMode='hold'"); await click('查看变更预览'); await until(() => evaluate('planPreviewWaiters.length===1'), 'held replan preview'); assert.equal(await evaluate("document.querySelector('input[aria-label=队列起始日期]').matches(':disabled')"), true); await evaluate('planPreviewWaiters.splice(0).forEach(done=>done())'); await has('确认排单变更'); await has('SYN-PLAN-01'); await click('确认保存'); await has('排单已保存');
      const current = await x.request('/api/v1/production-scheduling/assignments/' + fixed.id); assert.equal(current.assignment.plannedStartDate, fixed.plannedStartDate); assert.equal(current.assignment.plannedEndDate, fixed.plannedEndDate);
      await click('计划异常'); await has('SYN-PLAN-04'); assert.equal(await evaluate("document.body.innerText.includes('无风险')"), false); await shot('over-assigned');
    });
    await phase('lost reply and mismatched digest never auto-post, and exact receipt clears only its original cache', async () => {
      for (const mode of ['lost', 'mismatch']) {
        await startPlan('SYN-PLAN-05', second.id, '10'); await click('预览排单'); await has('确认排单变更'); await evaluate('planMode=' + JSON.stringify(mode)); const before = posts(); await click('确认保存'); await has(mode === 'lost' ? '保存结果尚未确认' : '核对结果与原请求不一致');
        assert.equal(posts(), before + 1); const original = await pendingCommand(); await click('核对原请求', '[role=dialog] button'); await has('排单已保存'); assert.equal(posts(), before + 1); assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_schedule_commands WHERE request_id=$1', [original.requestId])).rows[0].n, 1);
      }
    });
    await phase('cached-before-send and late-original recovery reuse the exact request after an explicit unknown check', async () => {
      for (const mode of ['before-network', 'late']) {
        await startPlan('SYN-PLAN-06', second.id, '10'); await click('预览排单'); await has('确认排单变更'); await evaluate('planMode=' + JSON.stringify(mode)); await click('确认保存'); await has('保存结果尚未确认'); const original = await pendingCommand(), before = posts();
        assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent==='重试原请求')"), false);
        if (mode === 'before-network') {
          const blocker = await x.pool.connect(), actor = (await x.pool.query("SELECT id::text FROM app_users WHERE username='plan.editor'")).rows[0].id;
          try { await blocker.query('BEGIN'); await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['production-plan:' + actor + ':' + original.requestId]); await click('核对原请求', '[role=dialog] button'); await has('原操作仍在处理中'); assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent==='重试原请求')"), false); await blocker.query('COMMIT'); }
          finally { await blocker.query('ROLLBACK'); blocker.release(); }
        }
        await click('核对原请求', '[role=dialog] button'); await has('暂未找到原操作回执'); await click('重试原请求', '[role=dialog] button'); await has('排单已保存'); assert.equal(posts(), before + 1);
        if (mode === 'late') await evaluate('Promise.all(planLateWaiters.splice(0).map(run=>run()))');
        assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_schedule_commands WHERE request_id=$1', [original.requestId])).rows[0].n, 1);
        const bodies = await evaluate('planBodies.slice(-2)'); assert.deepEqual(bodies[0], original); assert.deepEqual(bodies[1], original);
      }
    });
    await phase('cached pending guards the concrete view-order button and corrupted storage is retained', async () => {
      await startPlan('SYN-PLAN-07', second.id, '10'); await click('预览排单'); await has('确认排单变更'); await evaluate("planMode='before-network'"); await click('确认保存'); await has('保存结果尚未确认'); const original = await pendingCommand(); await navigate('/production-scheduling'); await has('有一条排单操作结果待核对');
      await click('更多排单：SYN-PLAN-01 · 1'); await click('查看订单', '[role=menu] button'); await has('请先核对原请求'); assert.equal(await evaluate('location.pathname'), '/production-scheduling');
      await click('核对原请求'); await has('暂未找到原操作回执'); await click('重试原请求'); await has('排单已保存');
      const key = 'zhixu.server.production-plan.pending.v1.' + (await x.pool.query("SELECT public_id::text FROM app_users WHERE username='plan.editor'")).rows[0].public_id;
      await evaluate('sessionStorage.setItem(' + JSON.stringify(key) + ",'invalid-preserved')"); await navigate('/production-scheduling'); await has('本机待核对记录无法安全读取'); const before = posts(); assert.equal(await evaluate('sessionStorage.getItem(' + JSON.stringify(key) + ')'), 'invalid-preserved'); assert.equal(posts(), before);
      await evaluate('sessionStorage.removeItem(' + JSON.stringify(key) + ')'); await navigate('/production-scheduling'); await has('A合成一组'); assert.ok(original.requestId);
    });
    await phase('read-only and denied roles cannot create plans or acquire monetary fields', async () => {
      const before = posts(); await loginCookie('plan.viewer'); await navigate('/production-scheduling'); await has('A合成一组'); await click('未排订单'); await has('SYN-PLAN-01'); assert.equal(await evaluate("[...document.querySelectorAll('.ps-pool-row button')].some(n=>n.textContent==='排单')"), false);
      const facts = await evaluate("fetch('/api/v1/production-scheduling/orders?allocation=all').then(r=>r.json())"); assert.equal(/confirmedLabor|salePrice|laborCurrency|confirmedGarment/u.test(JSON.stringify(facts)), false);
      await loginCookie('plan.denied'); await navigate('/production-scheduling'); await has('暂无生产排单权限'); assert.equal(await evaluate("document.querySelectorAll('button[aria-label=生产排单]').length"), 0); assert.equal(posts(), before); await loginCookie('plan.editor'); await navigate('/production-scheduling'); await has('A合成一组');
    });
    await phase('late mutation and receipt responses cannot acknowledge a new A-B-A session or expire it', async () => {
      for (const channel of ['post', 'receipt']) for (const status of [200, 401]) {
        await startPlan('SYN-PLAN-08', second.id, '1'); await evaluate("planListMode='delay401'"); await click('重新读取'); await until(() => evaluate('planWaiters.length===1'), 'held current read');
        await click('预览排单'); await has('确认排单变更'); await evaluate('planMode=' + JSON.stringify(channel === 'post' ? 'delay' + status : 'lost')); await click('确认保存');
        if (channel === 'receipt') { await has('保存结果尚未确认'); await evaluate('planReceiptMode=' + JSON.stringify('delay' + status)); await click('核对原请求', '[role=dialog] button'); }
        const waiters = channel === 'post' ? 'planPostWaiters' : 'planReceiptWaiters'; await until(() => evaluate(waiters + '.length===1'), 'held old response'); const original = await pendingCommand();
        const key = 'zhixu.server.production-plan.pending.v1.' + (await x.pool.query("SELECT public_id::text FROM app_users WHERE username='plan.editor'")).rows[0].public_id, raw = await evaluate('sessionStorage.getItem(' + JSON.stringify(key) + ')');
        await evaluate('planWaiters.splice(0).forEach(done=>done())'); await has('忘记密码？请联系系统管理员'); await loginUI('plan.second'); await has('A合成一组'); assert.equal(await evaluate("document.body.innerText.includes('有一条排单操作结果待核对')"), false);
        await click('用户菜单'); await click('退出登录'); await has('忘记密码？请联系系统管理员'); await loginUI('plan.editor'); await has('有一条排单操作结果待核对'); await evaluate(waiters + '.splice(0).forEach(done=>done())'); await wait(180);
        assert.equal(await evaluate('sessionStorage.getItem(' + JSON.stringify(key) + ')'), raw); assert.equal(await evaluate("document.body.innerText.includes('忘记密码？请联系系统管理员')"), false); assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent==='重试原请求')"), false);
        await click('核对原请求'); await has('排单已保存'); assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_schedule_commands WHERE request_id=$1', [original.requestId])).rows[0].n, 1);
      }
    });
    await phase('cancel preview freezes input and keeps the assignment and immutable history', async () => {
      await poolSearch('SYN-PLAN-03'); await click('查看排单', '.ps-pool-row button'); await click('取消排单', '[role=dialog] button'); await field('textarea[aria-label=取消排单说明]', '合成取消说明', 'HTMLTextAreaElement'); await evaluate("planPreviewMode='hold'"); await click('查看变更预览'); await until(() => evaluate('planPreviewWaiters.length===1'), 'held cancel preview'); assert.equal(await evaluate("document.querySelector('textarea[aria-label=取消排单说明]').matches(':disabled')"), true); await evaluate('planPreviewWaiters.splice(0).forEach(done=>done())'); await has('确认排单变更'); await click('确认保存'); await has('排单已保存');
      assert.equal((await x.pool.query('SELECT status FROM production_schedule_assignments WHERE id=$1', [externalId])).rows[0].status, 'cancelled'); assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_schedule_plan_versions WHERE assignment_id=$1', [externalId])).rows[0].n, 3);
    });
    await phase('history paging retains old resource summaries and its version anchor after a new append', async () => {
      let historyGroup = await x.resource('groups', { name: 'Y历史原组名', enabled: true, remark: '', shortName: '', productionSiteId: site.id, sortOrder: 40 });
      let saved = await x.plan(orders[9], data({ executorId: historyGroup.id }));
      historyGroup = await x.changeResource(historyGroup, { name: 'Y历史采用后组名' }); const queue = await x.request('/api/v1/production-scheduling/groups/' + historyGroup.id);
      const preview = await x.request('/api/v1/production-scheduling/preview', { action: 'replan', groupId: historyGroup.id, expectedQueueVersion: queue.version, anchorDate: '2027-01-04', orderedAssignmentIds: null });
      saved = await x.request('/api/v1/production-scheduling/commands', { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
      for (let n = 0; n < 50; n++) saved = await x.plan(orders[9], data({ executorId: historyGroup.id, remark: '合成历史 ' + n }), saved.assignments[0]);
      await poolSearch('SYN-PLAN-10'); await click('查看排单', '.ps-pool-row button'); await click('查看历史', '[role=dialog] button'); await has('版本 52');
      saved = await x.plan(orders[9], data({ executorId: historyGroup.id, remark: '翻页后新增53' }), saved.assignments[0]); await x.changeResource(historyGroup, { name: '当前名称不能补造历史' });
      await click('加载更早记录', '[role=dialog] button'); await until(() => evaluate("[...document.querySelectorAll('[role=dialog] strong')].some(n=>n.textContent.startsWith('版本 1 ·'))"), 'oldest exact version'); const text = await evaluate("document.querySelector('[role=dialog]').innerText"); assert.ok(text.includes('Y历史原组名')); assert.ok(text.includes('Y历史采用后组名')); assert.equal(text.includes('版本 53'), false); assert.equal(text.includes('当前名称不能补造历史'), false); await shot('anchored-history'); await click('关闭排单历史');
    });
    await phase('revoked write permission preserves pending bytes until authorized receipt lookup and exact retry', async () => {
      await x.user('plan.revoked'); await loginCookie('plan.revoked'); await navigate('/production-scheduling'); await has('A合成一组'); await startPlan('SYN-PLAN-11', second.id, '1'); await click('预览排单'); await has('确认排单变更'); await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='plan.revoked' AND permission_key IN ('schedule.create','schedule.edit')"); const n = await count('production_schedule_assignments'); await click('确认保存'); await has('没有执行此操作的权限'); const original = await pendingCommand(); assert.equal(await count('production_schedule_assignments'), n);
      await click('核对原请求', '[role=dialog] button'); await has('没有执行此操作的权限'); assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent==='重试原请求')"), false);
      await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('plan.revoked','schedule.create')"); await click('核对原请求', '[role=dialog] button'); await has('暂未找到原操作回执'); await click('重试原请求', '[role=dialog] button'); await has('排单已保存'); assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_schedule_commands WHERE request_id=$1', [original.requestId])).rows[0].n, 1); await loginCookie('plan.editor'); await navigate('/production-scheduling'); await has('A合成一组');
    });
    await phase('zero remaining quantity does not offer an accidental one-click zero edit', async () => {
      await x.plan(orders[11], data({ executorId: second.id, plannedQuantity: '100.125' })); await click('未排订单'); await click('全部订单'); await field('input[aria-label=搜索排单]', 'SYN-PLAN-12'); await has('SYN-PLAN-12'); await click('查看排单', '.ps-pool-row button'); await click('编辑排单', '[role=dialog] button'); await has('可排 0'); assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent==='全部可排数量').disabled"), true); assert.equal(await evaluate("document.querySelector('input[aria-label=排单数量]').value"), '100.125'); await closeClean();
    });
    await phase('real desktop, DPR and mobile geometry preserve usable queue and form bounds', async () => {
      for (const [width, deviceScaleFactor] of [[1920, 1], [1536, 1.25], [1440, 1], [1280, 1], [900, 1], [390, 1]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor, mobile: width === 390 }); await navigate('/production-scheduling'); await has('A合成一组');
        let metrics = await evaluate("({page:'queue',width:innerWidth,scroll:document.documentElement.scrollWidth})"); assert.ok(metrics.scroll <= width + 1, JSON.stringify(metrics)); geometry.push(metrics); await shot('queue-' + width);
        await startPlan('SYN-PLAN-09', second.id); metrics = await evaluate("({page:'form',width:innerWidth,scroll:document.documentElement.scrollWidth,panel:document.querySelector('[role=dialog]').getBoundingClientRect().toJSON(),fields:[...document.querySelectorAll('[role=dialog] input,[role=dialog] select,[role=dialog] textarea')].filter(n=>n.getClientRects().length).map(n=>({label:n.getAttribute('aria-label'),left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))})"); assert.ok(metrics.scroll <= width + 1, JSON.stringify(metrics)); assert.ok(metrics.panel.width <= width + 1); assert.ok(metrics.fields.every(row => row.left >= metrics.panel.left && row.right <= metrics.panel.right), JSON.stringify(metrics)); geometry.push(metrics); await shot('form-' + width); await closeClean(); await has('有未保存修改'); await click('放弃修改');
      }
    });
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []); assert.equal(await count('quote_center_quotes'), 0);
    assert.equal(await evaluate("localStorage.getItem('zhixu.erp.local.production-scheduling')"), 'synthetic-preserved-browser'); assert.equal(await evaluate("localStorage.getItem('zhixu.erp.local.operations-settings')"), 'synthetic-preserved-resources');
  } finally {
    await writeFile(join(evidence, 'build-and-checks.json'), JSON.stringify({ build, geometry, errors }, null, 2) + '\n');
    if (closeBrowser && ws?.readyState === WebSocket.OPEN) await Promise.race([closeBrowser().catch(() => {}), wait(2000)]); ws?.close(); if (browser && browser.exitCode === null) { browser.kill(); await wait(500); }
    await x.close(); const distance = relative(resolve(tmpdir()), resolve(temp)); assert.ok(distance && !distance.startsWith('..') && !isAbsolute(distance) && temp.includes('zhixu-plan-ui-')); await rm(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
});
