import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { closingFixture } from './closing-fixture.ts';
import { prepareClosingUiFixture } from './closing-ui-fixture.ts';
import { readOrderCommercialState } from '../sales-orders/commercial-version-service.ts';
import { readOrderProductionPlans, previewProductionPlan, executeProductionPlan } from '../production-scheduling/service.ts';
import { waitForChromiumEndpoint, stopOwnedChromium } from './chromium-endpoint.mjs';

const delay = ms => new Promise(done => setTimeout(done, ms));
test('approved closing UI uses real built Server, owned synthetic PostgreSQL and actual Chromium', { timeout: 240000 }, async t => {
  const staticDirectory = resolve(process.env.CLOSING_UI_STATIC_DIR ?? 'dist/client'), build = JSON.parse(await readFile(join(staticDirectory, 'build-info.json'), 'utf8'));
  const expectedSource = process.env.CLOSING_UI_EXPECTED_SOURCE;
  assert.match(expectedSource ?? '', /^[0-9a-f]{40}$/u); assert.equal(build.gitCommit, expectedSource);
  assert.equal(build.quoteAuthority, 'server'); assert.equal(build.identityMode, 'session'); assert.equal(build.orderRead, 'snapshot');
  const x = await closingFixture(t, false, true, { staticDirectory }), seeded = await prepareClosingUiFixture(x);
  const temp = await mkdtemp(join(await realpath(tmpdir()), 'zhixu-closing-ui-browser-')), profile = join(temp, 'profile');
  const evidence = resolve('outputs/closing-adjustment-ui-current-20261027/browser-' + Date.now()); await mkdir(evidence, { recursive: true });
  const pending = new Map(), errors = [], network = []; let sequence = 0, session, ws, command, cleaned = false;
  const browser = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const cleanup = async () => { if (cleaned) return; cleaned = true; try { await stopOwnedChromium(browser, { gracefulClose: ws?.readyState === WebSocket.OPEN && command ? () => command('Browser.close', {}, null) : undefined }); }
    finally { ws?.close(); for (const call of pending.values()) clearTimeout(call.timer); } };
  t.after(cleanup);
  const [port, endpoint] = await waitForChromiumEndpoint(profile, { timeoutMs: 30000 }); ws = new WebSocket('ws://127.0.0.1:' + port + endpoint);
  await new Promise((done, reject) => { const timer = setTimeout(() => reject(Error('CDP connection deadline')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); done(); }, { once: true }); ws.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true }); });
  command = (method, params = {}, sid = session) => new Promise((done, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 20000); pending.set(id, { done, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); });
  ws.addEventListener('message', ({ data }) => { const event = JSON.parse(String(data)), call = pending.get(event.id); if (call) { pending.delete(event.id); clearTimeout(call.timer); if (event.error) call.reject(Error(JSON.stringify(event.error))); else call.done(event.result); }
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
    if (event.method === 'Network.requestWillBeSent') network.push({ method: event.params.request.method, path: new URL(event.params.request.url).pathname });
    if (event.method === 'Page.javascriptDialogOpening') void command('Page.handleJavaScriptDialog', { accept: true }); });
  const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async (read, label) => { const end = Date.now() + 18000; while (Date.now() < end) { try { if (await read()) return; } catch (error) { if (!/context|navigated|closed/u.test(String(error))) throw error; } await delay(60); } throw Error(label + ' timed out'); };
  const has = text => until(() => evaluate('document.body?.innerText.includes(' + JSON.stringify(text) + ')'), text);
  const click = async (label, selector = 'button') => { const find = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())===${JSON.stringify(label)}&&!n.matches(':disabled')&&n.getClientRects().length)`;
    await until(() => evaluate('Boolean(' + find + ')'), 'enabled ' + label); await evaluate(find + '.click()'); };
  const field = async (selector, value, tag = 'HTMLInputElement') => { await until(() => evaluate('Boolean(document.querySelector(' + JSON.stringify(selector) + '))'), 'field');
    await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event(${tag === 'HTMLSelectElement' ? "'change'" : "'input'"},{bubbles:true}))})()`); };
  const shot = async name => { const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(join(evidence, name + '.png'), Buffer.from(image.data, 'base64')); };
  const posts = () => network.filter(row => row.method === 'POST' && row.path.endsWith('/month-plans/commands')).length;
  const phase = async (name, run) => { let error; await t.test(name, async () => { try { await run(); } catch (value) { error = value; throw value; } }); if (error) throw error; };
  try {
    const target = await command('Target.createTarget', { url: 'about:blank' }, null); session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null)).sessionId;
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    // Install once before application clients capture fetch. Mutating a shared
    // global delegate after mounting can recurse or miss the client entirely.
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const nativeFetch=window.fetch.bind(window);window.droppedClosingMonthAcks=0;window.droppedLaborAcks=0;window.droppedSaleAcks=0;window.fetch=async(...args)=>{const response=await nativeFetch(...args);if(window.dropNextClosingMonthAck&&String(args[0]).endsWith('/month-plans/commands')){window.dropNextClosingMonthAck=false;window.droppedClosingMonthAcks++;await response.text();throw Error('synthetic committed acknowledgement lost')}if(window.dropNextLaborAck&&String(args[0]).endsWith('/order-labor-adoptions/commands')){window.dropNextLaborAck=false;window.droppedLaborAcks++;await response.text();throw Error('synthetic committed labor acknowledgement lost')}if(window.dropNextSaleAck&&String(args[0]).endsWith('/api/v1/order-price-adjustments')){window.dropNextSaleAck=false;window.droppedSaleAcks++;await response.text();throw Error('synthetic committed sale acknowledgement lost')}if(window.saleReceiptProbe&&String(args[0]).includes('/order-price-adjustments/requests/')){const actual=await response.json(),state=window.saleReceiptProbe;window.saleReceiptProbe=null;const value=state==='not_found'?{state,requestId:actual.requestId,items:[]}:{state:'pending',requestId:actual.requestId,operationId:actual.operationId,items:actual.items.map(row=>({salesOrderId:row.salesOrderId,status:'pending'}))};return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}})}return response}})()` });
    const i = x.editor.cookie.indexOf('='); await command('Network.setCookie', { name: x.editor.cookie.slice(0, i), value: x.editor.cookie.slice(i + 1), domain: '127.0.0.1', path: '/', httpOnly: true });
    const navigate = async path => { await command('Page.navigate', { url: x.base + path }); await has('全年成衣销售产值'); await until(() => evaluate("document.querySelectorAll('.sc-month-card').length===12"), '12 months'); };
    await phase('desktop annual view has exactly two outputs and isolates Browser stores', async () => {
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await navigate('/closing-center?year=2027'); await evaluate("localStorage.setItem('zhixu.erp.local.closing-center','KEEP')");
      assert.equal(await evaluate("document.querySelectorAll('.sc-annual-totals .qc-card').length"), 2); await has('制作完成'); await shot('desktop-annual');
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
    });
    await phase('outsource scope changes both total and detail; whole preview still includes hidden portions', async () => {
      await field('select[aria-label="关账显示范围"]', 'outsource', 'HTMLSelectElement'); await until(() => evaluate("document.querySelectorAll('.sc-order-table tbody tr').length===1"), 'one outsource'); await has('¥2,000');
      await click('调整月份'); await has('可调数量'); await field('select[aria-label="调整范围"]', 'whole', 'HTMLSelectElement'); await field('input[aria-label="目标月份"]', '2027-11'); await field('input[aria-label="调整原因"]', '整单包含当前隐藏的内制与未分配'); await click('预览调整'); await has('调整后完整月份分配');
      assert.equal(await evaluate("document.querySelectorAll('.sc-preview > .sc-table-scroll:first-of-type tbody tr').length"), 3); await has('两项产值参考'); await until(() => evaluate("document.querySelectorAll('.sc-value-difference tbody tr').length===2"), 'two changed months'); await shot('whole-preview'); const before = posts(); await click('取消', '[role=dialog] button'); assert.equal(posts(), before);
    });
    await phase('real incremental text entry keeps the same focused search node across query generations', async () => {
      await evaluate("window.closingSearchNode=document.querySelector('input[aria-label=搜索关账订单]');closingSearchNode.focus()");
      for (const char of 'SYN-CLOSE') { await command('Input.insertText', { text: char }); await delay(35); assert.equal(await evaluate('document.activeElement===closingSearchNode&&closingSearchNode.isConnected'), true); }
      await command('Input.insertText', { text: ' 合成' }); assert.equal(await evaluate('document.activeElement===closingSearchNode&&closingSearchNode.value.endsWith("合成")'), true);
      await field('input[aria-label=搜索关账订单]', ''); await until(() => evaluate("document.querySelectorAll('.sc-order-table tbody tr').length===1"), 'scope restored');
    });
    await phase('partial quantity save recovers a committed but lost acknowledgement without a second POST', async () => {
      await field('select[aria-label="关账显示范围"]', 'all', 'HTMLSelectElement'); await has('制作完成'); await click('调整月份'); await has('可调数量');
      await field('input[aria-label="目标月份"]', '2027-03'); await field('input[aria-label="调整原因"]', '合成实机部分调月'); await field('.sc-adjustment-fields tbody input', '10'); await click('预览调整'); await has('调整后完整月份分配');
      const dropped = await evaluate('window.droppedClosingMonthAcks'); await evaluate('window.dropNextClosingMonthAck=true');
      const before = posts(); await click('确认调整'); await has('原请求已核实'); assert.equal(posts(), before + 1); assert.equal(await evaluate('window.droppedClosingMonthAcks'), dropped + 1); await click('完成', '[role=dialog] button');
      assert.equal(await evaluate("Object.keys(sessionStorage).some(k=>k.startsWith('zhixu.server.closing-month.pending.v1.'))"), false); assert.equal(await evaluate("localStorage.getItem('zhixu.erp.local.closing-center')"), 'KEEP');
    });
    await phase('source review reads the whole order behind an outsource filter and recovers one committed response', async () => {
      const before = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body.plan;
      const executions = (await x.pool.query('SELECT * FROM production_schedule_executions ORDER BY assignment_id')).rows;
      // This changes only saved Source facts in the caller-owned synthetic DB.
      // The existing persistent fixture separately tests actual Source refresh.
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=120 WHERE sales_order_id=$1', [seeded.first.id]);
      await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN 70 ELSE 50 END WHERE sales_order_id=$1", [seeded.first.id]);
      await field('select[aria-label="关账显示范围"]', 'outsource', 'HTMLSelectElement'); await has('来源待复核');
      const menu = await evaluate("document.querySelector('.sc-order-table tbody tr .qc-floating-menu-trigger').getAttribute('aria-label')");
      await click(menu); await click('复核来源数量'); await has('当前来源量 120');
      assert.equal(await evaluate("document.querySelectorAll('table[aria-label=来源复核原片段] tbody tr').length"), before.lines.length);
      await has('新增待分月 / 未分配'); await field('input[aria-label=来源复核原因]', '全单新增量保持未分配'); await click('预览复核'); await has('复核后完整月份分配');
      assert.equal(await evaluate("/[¥$]|CNY|USD/u.test(document.querySelector('[role=dialog]').innerText)"), false);
      await shot('source-complete-order-preview');
      const dropped = await evaluate('window.droppedClosingMonthAcks'); await evaluate('window.dropNextClosingMonthAck=true');
      const count = posts(); await click('确认复核'); await has('原请求已核实'); assert.equal(posts(), count + 1); assert.equal(await evaluate('window.droppedClosingMonthAcks'), dropped + 1);
      const after = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body;
      assert.equal(after.plan.sourceQuantity, '120'); assert.equal(after.sourceChanged, false);
      for (const line of before.lines) assert.deepEqual(after.plan.lines.find(value => value.id === line.id), line);
      const added = after.plan.lines.filter(line => !before.lines.some(old => old.id === line.id));
      assert.equal(added.length, 1); assert.equal(added[0].quantity, '20'); assert.equal(added[0].month, null); assert.equal(added[0].assignmentId, null);
      assert.deepEqual((await x.pool.query('SELECT * FROM production_schedule_executions ORDER BY assignment_id')).rows, executions);
      await click('完成', '[role=dialog] button');
    });
    await phase('a second Source change after UI preview is rejected without another month version', async () => {
      const before = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body.plan;
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=130 WHERE sales_order_id=$1', [seeded.first.id]);
      await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN 80 ELSE 50 END WHERE sales_order_id=$1", [seeded.first.id]);
      await click('刷新'); await has('来源待复核');
      const menu = await evaluate("document.querySelector('.sc-order-table tbody tr .qc-floating-menu-trigger').getAttribute('aria-label')");
      await click(menu); await click('复核来源数量'); await has('当前来源量 130'); await field('input[aria-label=来源复核原因]', '预览后的来源竞争'); await click('预览复核'); await has('复核后完整月份分配');
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=140 WHERE sales_order_id=$1', [seeded.first.id]);
      await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN 90 ELSE 50 END WHERE sales_order_id=$1", [seeded.first.id]);
      const count = posts(); await click('确认复核'); await has('原请求已核实为未应用');
      assert.equal(posts(), count + 1); const after = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body;
      assert.equal(after.plan.version, before.version); assert.deepEqual(after.plan.lines, before.lines); assert.equal(after.sourceChanged, true);
      await click('取消', '[role=dialog] button');
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=120 WHERE sales_order_id=$1', [seeded.first.id]);
      await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN 70 ELSE 50 END WHERE sales_order_id=$1", [seeded.first.id]);
      await field('select[aria-label="关账显示范围"]', 'all', 'HTMLSelectElement'); await has('制作完成');
    });
    await phase('executor matching assigns only the selected unassigned quantity and keeps its exact remainder', async () => {
      const before = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body.plan;
      const pending = before.lines.find(line => line.assignmentId === null && line.month === null && line.quantity === '20'); assert.ok(pending);
      const facts = (await x.pool.query('SELECT * FROM production_schedule_executions ORDER BY assignment_id')).rows;
      await field('select[aria-label="关账显示范围"]', 'outsource', 'HTMLSelectElement');
      await until(() => evaluate("document.querySelectorAll('.sc-order-table tbody tr .qc-floating-menu-trigger').length>=1"), 'source-order fragment menu after filter');
      const menu = await evaluate("document.querySelector('.sc-order-table tbody tr .qc-floating-menu-trigger').getAttribute('aria-label')");
      await click(menu); await click('匹配执行方'); await has('未分配片段'); await field('select[aria-label=待匹配月份片段]', pending.id, 'HTMLSelectElement');
      await until(() => evaluate("document.querySelectorAll('table[aria-label=执行方匹配候选] tbody tr').length===2"), 'same order same color candidates');
      await field('input[aria-label="匹配数量 ' + seeded.internal + '"]', '5'); await field('input[aria-label="匹配数量 ' + seeded.outsourced + '"]', '10');
      await has('余量 5 保持未分配'); await field('input[aria-label=执行方匹配原因]', '明确内外发归属并保留余量'); await click('预览匹配'); await has('匹配后完整月份分配');
      await has('归属量超过排单 / 完成参考量'); assert.equal(await evaluate("/[¥$]|CNY|USD/u.test(document.querySelector('[role=dialog]').innerText)"), false); await shot('executor-unassigned-preview');
      const dropped = await evaluate('window.droppedClosingMonthAcks'); await evaluate('window.dropNextClosingMonthAck=true');
      const count = posts(); await click('确认匹配'); await has('原请求已核实'); assert.equal(posts(), count + 1); assert.equal(await evaluate('window.droppedClosingMonthAcks'), dropped + 1);
      const after = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body.plan;
      for (const line of before.lines.filter(line => line.id !== pending.id)) assert.deepEqual(after.lines.find(value => value.id === line.id), line);
      assert.deepEqual(after.lines.find(line => line.id === pending.id), { ...pending, quantity: '5' });
      const added = after.lines.filter(line => !before.lines.some(old => old.id === line.id));
      assert.deepEqual(added.map(line => [line.assignmentId, line.quantity]).sort(), [[seeded.internal, '5'], [seeded.outsourced, '10']].sort()); assert(added.every(line => line.colorId === pending.colorId && line.month === pending.month));
      assert.deepEqual((await x.pool.query('SELECT * FROM production_schedule_executions ORDER BY assignment_id')).rows, facts); await click('完成', '[role=dialog] button');
      await field('select[aria-label="关账显示范围"]', 'all', 'HTMLSelectElement'); await has('制作完成');
    });
    await phase('locked month has no ordinary close/edit and an explicit new period has a blank tax', async () => {
      await click('管理 2027-12'); await has('重开月份'); assert.equal(await evaluate("document.querySelector('select[aria-label=月份操作]').options.length"), 1); await click('关闭', '[role=dialog] button');
      await click('管理 2027-06'); await has('期间税率'); assert.equal(await evaluate("document.querySelector('input[aria-label=期间税率]').value"), ''); await click('关闭', '[role=dialog] button');
    });
    await phase('refresh after a committed original remains recoverable without edit rights or a visible SO', async () => {
      const state = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body;
      const p = (await x.request('/month-plans/preview', { action: 'move_months', orderId: seeded.first.id, expectedVersion: state.plan.version, targetMonth: '2027-11', reason: 'Synthetic lost acknowledgement before refresh', selection: { mode: 'whole' } })).body;
      const original = { requestId: randomUUID(), intent: p.intent, previewHash: p.previewHash };
      assert.equal((await x.request('/month-plans/commands', original)).body.status, 'applied');
      const key = 'zhixu.server.closing-month.pending.v1.' + x.editor.actor.userId;
      await evaluate(`sessionStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({ schemaVersion: 1, userId: x.editor.actor.userId, savedAt: new Date().toISOString(), command: original }))})`);
      await x.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.edit'", [x.editor.role]);
      const before = posts(); await navigate('/closing-center?year=2028'); await has('当前范围没有订单片段'); await click('核对月份调整原请求'); await click('核对原请求', '[role=dialog] button'); await has('原请求已核实');
      assert.equal(posts(), before); assert.equal(await evaluate('sessionStorage.getItem(' + JSON.stringify(key) + ')'), null); await shot('read-only-original-recovery'); await click('返回', '[role=dialog] button');
      await x.pool.query("INSERT INTO app_role_permissions VALUES($1,'closing.edit')", [x.editor.role]); await navigate('/closing-center?year=2027');
    });
    await phase('a fresh 403 removes formerly visible annual amounts and detail', async () => {
      await x.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.view'", [x.editor.role]);
      await click('刷新'); await until(() => evaluate("!document.querySelector('.sc-annual-totals')&&!document.querySelector('.sc-order-table')"), 'revoked read clears old data');
      await x.pool.query("INSERT INTO app_role_permissions VALUES($1,'closing.view')", [x.editor.role]); await navigate('/closing-center?year=2027');
    });
    await phase('390px actual layout keeps page and modal within viewport with intentional table scrolling', async () => {
      await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(150); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true); await shot('mobile-annual');
      await click('调整月份'); await has('可调数量'); assert.equal(await evaluate("(()=>{const r=document.querySelector('.sc-adjustment-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.height<=innerHeight})()"), true); await shot('mobile-adjust'); await click('取消', '[role=dialog] button');
    });
    await phase('zero-output changed attribution recovers through the actual matching dialog without changing production or month quantities',async()=>{
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      const order=await x.order(false),initial=(await x.request('/orders/'+order.id+'/month-plan')).body.plan,line=initial.lines[0],assignment=await x.assignment(order.id,line.colorId);
      let p=(await x.request('/month-plans/preview',{action:'match_executors',orderId:order.id,expectedVersion:1,reason:'Synthetic recovery original',items:[{lineId:line.id,parts:[{assignmentId:assignment,quantity:'10'},{assignmentId:null,quantity:'40'}]}]})).body;
      assert.equal((await x.request('/month-plans/commands',{requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash})).body.status,'applied');
      const state=await readOrderProductionPlans(x.pool,x.editor.actor,order.id),assigned=state.assignments.find(row=>row.id===assignment);
      p=await previewProductionPlan(x.pool,x.editor.actor,{action:'update',orderId:order.id,assignmentId:assignment,expectedVersion:assigned.version,expectedPlanVersion:state.order.planVersion,reason:'Legal unstarted recoloring',data:{executionType:'internal',executorId:x.group.id,colorId:initial.lines[1].colorId,plannedQuantity:'30',duration:{mode:'workdays',workdays:2},dates:{mode:'auto_queue',startDate:'2027-01-04'},remark:''}});
      assert.equal((await executeProductionPlan(x.pool,x.editor.actor,{requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash})).status,'applied');
      const before=(await x.request('/orders/'+order.id+'/month-plan')).body.plan,facts=(await x.pool.query('SELECT to_jsonb(a) value FROM production_schedule_assignments a ORDER BY id')).rows;
      const orderNo=(await x.pool.query('SELECT order_no FROM sales_orders WHERE id=$1',[order.id])).rows[0].order_no;
      await navigate('/closing-center?year=2027');await field('input[aria-label=搜索关账订单]',orderNo);await until(()=>evaluate("(()=>{const rows=[...document.querySelectorAll('.sc-order-table tbody tr')];return rows.length>0&&rows.every(row=>row.innerText.includes("+JSON.stringify(orderNo)+"))})()"),'only recovery order fragments');
      const menu=await evaluate("document.querySelector('.sc-order-table tbody tr .qc-floating-menu-trigger').getAttribute('aria-label')");await click(menu);await click('匹配执行方');await has('原执行归属已变化');
      await field('input[aria-label=执行方匹配原因]','明确恢复无产出归属');await click('预览恢复未分配');await has('恢复后完整月份分配');await shot('executor-zero-output-recovery');
      const count=posts();await click('确认恢复未分配');await has('原请求已核实');assert.equal(posts(),count+1);
      const after=(await x.request('/orders/'+order.id+'/month-plan')).body.plan;assert.deepEqual(after.lines,before.lines.map(row=>row.assignmentId===assignment?{...row,assignmentId:null}:row));
      assert.deepEqual((await x.pool.query('SELECT to_jsonb(a) value FROM production_schedule_assignments a ORDER BY id')).rows,facts);await click('完成','[role=dialog] button');
    });
    const http=async(path,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(x.base+'/api/v1/'+path,{method,headers:{Cookie:x.editor.cookie,...(body===undefined?{}:{Origin:x.base,'X-Zhixu-Request':'1','Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await response.text();assert.equal(response.status,200,text);return JSON.parse(text);};
    const successor=async(orderId,price)=>{
      const source=(await readOrderCommercialState(x.pool,orderId)).current;let record=await x.repository.getById(source.quoteId);
      await http('quotes/'+source.quoteId+'/version-workflows',{action:'revision.create',expectedVersion:record.version,sourceRevisionId:source.revisionId,reason:'工价调整',note:'Synthetic explicit USD'});
      record=await x.repository.getById(source.quoteId);let revision=record.quote.revisions.find(row=>row.revisionId===record.quote.defaultRevisionId);for(const pv of revision.priceVersions)pv.pricingParameters.laborCurrency='USD';
      await http('quotes/'+source.quoteId,{quote:record.quote,expectedVersion:record.version},'PUT');
      for(const pv of revision.priceVersions){record=await x.repository.getById(source.quoteId);await http('quotes/'+source.quoteId+'/confirmation-workflows',{action:'confirmation.save',expectedVersion:record.version,revisionId:revision.revisionId,priceVersionId:pv.id,confirmedLaborPrice:price,confirmedGarmentPrice:revision.baseInfo.quoteType==='processing'?null:'7777',note:'Synthetic confirmed USD'});}
      return {quoteId:source.quoteId,revisionId:revision.revisionId};
    };
    const worker=await x.user('usd.ui',['quote.view','order.view','commercial.labor.view','order.commercial.adopt','commercial.labor.edit']);
    const laborPosts=()=>network.filter(row=>row.method==='POST'&&row.path.endsWith('/order-labor-adoptions/commands')).length;
    const setWorker=async()=>{const at=worker.cookie.indexOf('=');await command('Network.setCookie',{name:worker.cookie.slice(0,at),value:worker.cookie.slice(at+1),domain:'127.0.0.1',path:'/',httpOnly:true});};
    const openLabor=async quoteId=>{await command('Page.navigate',{url:x.base+'/quote-center/detail?id='+encodeURIComponent(quoteId)});await has('内部成本受限');await click('关联订单');await has('查询工价订单');await until(()=>evaluate("document.querySelectorAll('[role=dialog]').length===1"),'one modal');};
    let usdTarget,usdOther,usdSource;
    await phase('labor-only user selects exact CNY color and confirmed USD revision; one lost acknowledgement changes only that order',async()=>{
      usdTarget=await x.order();usdOther=await x.order();usdSource=await successor(usdTarget.id,'4.25');const before=(await readOrderCommercialState(x.pool,usdTarget.id)).current,other=(await readOrderCommercialState(x.pool,usdOther.id)).current;
      const quoteBefore=await x.repository.getById(usdSource.quoteId),terms=(await x.pool.query('SELECT to_jsonb(c) value FROM confirmed_commercial_terms c ORDER BY id')).rows;
      await setWorker();const salesQueries=network.filter(row=>row.path==='/api/v1/quote-order-prices').length;await openLabor(usdSource.quoteId);
      const orderNo=(await x.pool.query('SELECT order_no FROM sales_orders WHERE id=$1',[usdTarget.id])).rows[0].order_no;await click('选择工价订单 '+orderNo,'input');await has('选择已确认 USD 的报价修订');
      await field('select[aria-label="USD 工价报价修订"]',usdSource.revisionId,'HTMLSelectElement');await click('采用工价颜色 White','input');
      assert.equal(await evaluate("document.querySelector('input[aria-label=确认产品条件不变]').checked"),false);await field('textarea[aria-label="USD 工价采用原因"]','明确采用可信USD后继','HTMLTextAreaElement');
      assert.equal(await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent==='预览 USD 工价').disabled"),true);await click('确认产品条件不变','input');await click('预览 USD 工价');await has('工价采用预览');
      assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('7777')"),false);await shot('usd-color-adoption-preview');
      const count=laborPosts();await evaluate('window.dropNextLaborAck=true');await click('确认采用 USD 工价');await has('工价采用已核实');assert.equal(laborPosts(),count+1);assert.equal(await evaluate('window.droppedLaborAcks'),1);
      const after=(await readOrderCommercialState(x.pool,usdTarget.id)).current;assert.equal(after.version,before.version+1);assert.equal(after.lines.find(row=>row.colorName==='White').laborPrice,'4.25');assert.equal(after.lines.find(row=>row.colorName==='White').laborCurrency,'USD');
      assert.deepEqual(after.lines.find(row=>row.colorName==='Blue'),before.lines.find(row=>row.colorName==='Blue'));assert.deepEqual((await readOrderCommercialState(x.pool,usdOther.id)).current,other);assert.deepEqual(await x.repository.getById(usdSource.quoteId),quoteBefore);assert.deepEqual((await x.pool.query('SELECT to_jsonb(c) value FROM confirmed_commercial_terms c ORDER BY id')).rows,terms);
      assert.equal(network.filter(row=>row.path==='/api/v1/quote-order-prices').length,salesQueries);await click('工价采用历史');await has('4.25 USD');await shot('usd-adoption-history');await click('关闭','[role=dialog] button');
    });
    await phase('processing work adoption uses whole-order null color and confirmed zero without sales controls; 320px modal remains usable',async()=>{
      const order=await x.processing('CNY'),source=await successor(order.id,'0'),before=(await x.pool.query('SELECT to_jsonb(c) value FROM processing_order_batch_consumptions c WHERE sales_order_id=$1',[order.id])).rows;
      await openLabor(source.quoteId);const orderNo=(await x.pool.query('SELECT order_no FROM sales_orders WHERE id=$1',[order.id])).rows[0].order_no;await click('选择工价订单 '+orderNo,'input');await has('选择已确认 USD 的报价修订');
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].some(n=>n.textContent==='订单成交价')"),false);
      await field('select[aria-label="USD 工价报价修订"]',source.revisionId,'HTMLSelectElement');await click('采用工价颜色 整单','input');await click('确认产品条件不变','input');await field('textarea[aria-label="USD 工价采用原因"]','明确采用USD零工价','HTMLTextAreaElement');await click('预览 USD 工价');await has('工价采用预览');
      await command('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});await delay(150);assert.equal(await evaluate("(()=>{const r=document.querySelector('.oc-source-modal').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.height<=innerHeight})()"),true);await shot('usd-processing-mobile-preview');
      await click('确认采用 USD 工价');await has('工价采用已核实');const adopted=(await readOrderCommercialState(x.pool,order.id)).current;assert.equal(adopted.lines[0].colorId,null);assert.equal(adopted.lines[0].laborPrice,'0');assert.equal(adopted.lines[0].laborCurrency,'USD');assert.deepEqual((await x.pool.query('SELECT to_jsonb(c) value FROM processing_order_batch_consumptions c WHERE sales_order_id=$1',[order.id])).rows,before);await click('完成','[role=dialog] button');
    });
    await phase('committed sale acknowledgement loss followed by fresh 403 keeps the original and removes old amounts before any labor workflow',async()=>{
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      const at=x.editor.cookie.indexOf('=');await command('Network.setCookie',{name:x.editor.cookie.slice(0,at),value:x.editor.cookie.slice(at+1),domain:'127.0.0.1',path:'/',httpOnly:true});
      await command('Page.navigate',{url:x.base+'/quote-center/detail?id='+encodeURIComponent(usdSource.quoteId)});await click('关联订单');await has('统一调整规则');
      const orderNo=(await x.pool.query('SELECT order_no FROM sales_orders WHERE id=$1',[usdOther.id])).rows[0].order_no;await click('选择订单 '+orderNo,'input');await field('input[aria-label=调价规则数值]','-1');await click('预览调整');await has('拟成交价');await field('[role=dialog] textarea','已提交但回执丢失后的撤权保护','HTMLTextAreaElement');
      const key='zhixu.server.order-price.pending.v1.'+x.editor.actor.userId,count=laborPosts();await evaluate('window.dropNextSaleAck=true');await click('确认订单调价');await has('请求结果未确认');assert.equal(await evaluate('window.droppedSaleAcks'),1);
      const raw=await evaluate('sessionStorage.getItem('+JSON.stringify(key)+')');assert.ok(raw);
      await x.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='commercial.sale.view'",[x.editor.role]);await click('重试原提交');
      await until(()=>evaluate("!document.querySelector('[role=dialog] input[aria-label*=拟成交价]')"),'fresh forbidden removes old sale fields');
      assert.equal(await evaluate('sessionStorage.getItem('+JSON.stringify(key)+')'),raw);assert.equal(laborPosts(),count);
      await x.pool.query("INSERT INTO app_role_permissions VALUES($1,'commercial.sale.view')",[x.editor.role]);
      await command('Page.navigate',{url:x.base+'/quote-center/detail?id='+encodeURIComponent(usdSource.quoteId)});await click('关联订单');await has(JSON.parse(raw).requestId);await click('核对原请求');await has('结束本次操作');await click('结束本次操作');assert.equal(await evaluate('sessionStorage.getItem('+JSON.stringify(key)+')'),null);await click('关闭','[role=dialog] button');
      await setWorker();
    });
    await phase('successful sale POST never clears an original when its GET is not_found or pending',async()=>{
      const at=x.editor.cookie.indexOf('=');await command('Network.setCookie',{name:x.editor.cookie.slice(0,at),value:x.editor.cookie.slice(at+1),domain:'127.0.0.1',path:'/',httpOnly:true});
      for(const probe of ['not_found','pending']){
        const order=await x.order(),orderNo=(await x.pool.query('SELECT order_no FROM sales_orders WHERE id=$1',[order.id])).rows[0].order_no;
        await command('Page.navigate',{url:x.base+'/quote-center/detail?id='+encodeURIComponent(usdSource.quoteId)});await click('关联订单');await has('统一调整规则');await click('选择订单 '+orderNo,'input');await field('input[aria-label=调价规则数值]','-1');await click('预览调整');await has('拟成交价');await field('[role=dialog] textarea','模拟非终态读取 '+probe,'HTMLTextAreaElement');
        await evaluate('window.saleReceiptProbe='+JSON.stringify(probe));await click('确认订单调价');await has('已处理 1 张');const key='zhixu.server.order-price.pending.v1.'+x.editor.actor.userId;
        assert.ok(await evaluate('sessionStorage.getItem('+JSON.stringify(key)+')'),probe+' original retained');await click('核对原请求');await has('结束本次操作');await click('结束本次操作');assert.equal(await evaluate('sessionStorage.getItem('+JSON.stringify(key)+')'),null);await click('关闭','[role=dialog] button');
      }
      await setWorker();
    });
    await phase('a damaged sale original blocks new work adoption and is retained verbatim',async()=>{
      const key='zhixu.server.order-price.pending.v1.'+worker.actor.userId;await evaluate('sessionStorage.setItem('+JSON.stringify(key)+',"{damaged-original")');const count=laborPosts();await openLabor(usdSource.quoteId);await has('存在未核实的成衣调价请求');assert.equal(await evaluate('sessionStorage.getItem('+JSON.stringify(key)+')'),'{damaged-original');assert.equal(laborPosts(),count);await click('关闭','[role=dialog] button');
      // Owned synthetic browser fixture only, not a product recovery shortcut.
      await evaluate('sessionStorage.removeItem('+JSON.stringify(key)+')');
    });
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []); await writeFile(join(evidence, 'result.json'), JSON.stringify({ build, status: 'PASS', errors, network, firstOrder: seeded.first.id, limitations: 'owned synthetic Chromium only, no user acceptance or deployment' }, null, 2));
  } catch (error) { await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: String(error), body: await evaluate('document.body?.innerText').catch(() => ''), errors, network }, null, 2)); throw error; }
  finally { await cleanup(); }
});
