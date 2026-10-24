// Actual built routes, session API and owned disposable PostgreSQL/Chromium only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.ts';
import { waitForChromiumEndpoint, stopOwnedChromium } from './chromium-endpoint.mjs';
import { runMigrations } from '../db/migration-runner.ts';
import { synchronizePermissionCatalog } from '../auth/permissions.ts';
import { bootstrapAdmin } from '../auth/bootstrap.ts';
import { createApp } from '../app.ts';

const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label, timeout = 16000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { try { if (await read()) return; } catch (error) { if (!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context/.test(String(error))) throw error; } await wait(60); }
  throw Error(label + ' timed out');
}
async function startFixture(staticDirectory) {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase('production_resource_ui') });
  const errors = [], origins = [], server = createServer(createApp({ pool, staticDirectory, allowedOrigins: origins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: event => errors.push(event) } }));
  const close = async () => { if (server.listening) await new Promise(done => server.close(done)); await pool.end(); await db.stop(); };
  try {
    await runMigrations(pool, resolve('database/migrations')); await synchronizePermissionCatalog(pool);
    const password = 'Synthetic-Resource-Only', root = 'resource.root';
    await bootstrapAdmin(pool, { username: root, displayName: '合成生产资料管理员', password });
    const user = async (username, permissions) => {
      const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt($2,gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [username, password])).rows[0];
      await pool.query('INSERT INTO app_roles(id,name) VALUES($1,$1)', [username]); await pool.query('INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)', [row.id, username]);
      for (const permission of permissions) await pool.query('INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)', [username, permission]);
      return row;
    };
    await user('resource.second', ['quote.view', 'settings.production_infrastructure.edit', 'settings.production_group.edit', 'settings.outsource_factory.edit']);
    await user('resource.viewer', ['quote.view', 'schedule.view']); await user('resource.denied', ['quote.view']);
    await new Promise(done => server.listen(0, '127.0.0.1', done)); const base = 'http://127.0.0.1:' + server.address().port; origins.push(base);
    const login = async username => {
      const response = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Zhixu-Request': '1' }, body: JSON.stringify({ username, password }) });
      assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0];
    };
    const cookie = await login(root);
    const save = async (kind, data, identity = {}) => {
      const command = { requestId: randomUUID(), kind, action: 'create', resourceId: null, expectedVersion: 0, ...identity, data };
      const response = await fetch(base + '/api/v1/production-resources/commands', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: base, 'X-Zhixu-Request': '1' }, body: JSON.stringify(command) });
      const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result.resource;
    };
    return { pool, errors, base, root, password, login, save, user, close };
  } catch (error) { await close(); throw error; }
}

test('Gate6A built resource pages preserve empty Server ownership, dates, receipts, CAS and session boundaries', { timeout: 240000 }, async t => {
  const staticDirectory = resolve(process.env.RESOURCE_UI_STATIC_DIR ?? 'dist/client');
  if (process.env.RESOURCE_UI_STATIC_DIR) assert.equal(process.env.RESOURCE_UI_BEFORE, '1', 'Only an explicit before observation may use a separately identified build');
  const build = JSON.parse(readFileSync(join(staticDirectory, 'build-info.json'), 'utf8')); assert.equal(build.quoteAuthority, 'server'); assert.equal(build.identityMode, 'session');
  const x = await startFixture(staticDirectory), temp = await mkdtemp(join(tmpdir(), 'zhixu-resource-ui-'));
  const evidence = resolve('outputs/production-resources-ui', `${process.env.RESOURCE_UI_BEFORE === '1' ? 'before' : 'after'}-${build.gitCommit}-${Date.now()}`); await mkdir(evidence, { recursive: true });
  let browser, ws, session, sequence = 0, closeBrowser, evaluate;
  const pending = new Map(), errors = [], network = [], commandResponses = [], geometry = [];
  const phase = async (name, run) => {
    let failure;
    await t.test(name, async () => { try { await run(); } catch (error) { failure = error; throw error; } });
    if (failure) {
      const focus = evaluate ? await evaluate("(()=>{const n=document.activeElement,d=document.querySelector('[role=dialog]');return {tag:n?.tagName,type:n?.getAttribute('type'),insideDialog:Boolean(d?.contains(n)),drawerClose:n===d?.querySelector('header>button')}})()").catch(() => null) : null;
      console.error('Owned resource UI diagnostic: ' + JSON.stringify({ name, focus, commandPosts: network.filter(row => row.method === 'POST' && row.path === '/api/v1/production-resources/commands').length, commandStatuses: commandResponses.map(row => row.status) }));
      await writeFile(join(evidence, 'failure.json'), JSON.stringify({ name, body: evaluate ? await evaluate('document.body?.innerText').catch(() => '') : '', fields: evaluate ? await evaluate("[...document.querySelectorAll('[role=dialog] input,[role=dialog] select,[role=dialog] textarea')].map(n=>({label:n.getAttribute('aria-label')??n.closest('label')?.textContent,value:n.value}))").catch(() => []) : [], errors, network }, null, 2));
      throw Error('Resource UI prerequisite failed: ' + name, { cause: failure });
    }
  };
  try {
    const profile = join(temp, 'profile');
    browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const [port, endpoint] = await waitForChromiumEndpoint(profile, { timeoutMs: 30000 }); ws = new WebSocket('ws://127.0.0.1:' + port + endpoint);
    await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, sid = session) => new Promise((done, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 20000);
      pending.set(id, { done, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
    });
    closeBrowser = () => command('Browser.close', {}, null);
    ws.addEventListener('message', ({ data }) => {
      const event = JSON.parse(String(data)), call = pending.get(event.id);
      if (call) { pending.delete(event.id); clearTimeout(call.timer); if (event.error) call.reject(Error(JSON.stringify(event.error))); else call.done(event.result); }
      if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
      if (event.method === 'Network.requestWillBeSent') network.push({ method: event.params.request.method, path: new URL(event.params.request.url).pathname });
      if (event.method === 'Network.responseReceived' && new URL(event.params.response.url).pathname === '/api/v1/production-resources/commands') commandResponses.push({ status: event.params.response.status });
      if (event.method === 'Page.javascriptDialogOpening') void command('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    });
    ws.addEventListener('close', () => { for (const call of pending.values()) { clearTimeout(call.timer); call.reject(Error('Owned browser closed')); } pending.clear(); });
    const target = await command('Target.createTarget', { url: 'about:blank' }, undefined); session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)).sessionId;
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const navigate = async path => { const marker = Date.now() + Math.random(); await evaluate('window.navEpoch=' + marker); await command('Page.navigate', { url: x.base + path }); await until(() => evaluate('window.navEpoch!==' + marker + "&&document.readyState==='complete'"), 'navigation'); };
    const has = text => until(() => evaluate('Boolean(document.body?.innerText.includes(' + JSON.stringify(text) + '))'), text);
    const click = async (label, selector = 'button,a') => {
      const predicate = `n=>(n.getAttribute('aria-label')??n.textContent.trim())===${JSON.stringify(label)}&&!n.matches(':disabled')&&n.getClientRects().length`;
      await until(() => evaluate(`Boolean([...document.querySelectorAll(${JSON.stringify(selector)})].find(${predicate}))`), 'enabled ' + label);
      await evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(selector)})].find(${predicate});n.click()})()`);
    };
    const field = (selector, value, tag = 'HTMLInputElement') => evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('missing field '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event(${tag === 'HTMLSelectElement' ? "'change'" : "'input'"},{bubbles:true}))})()`);
    const formField = async (label, value) => { await until(() => evaluate(`Boolean([...document.querySelectorAll('[role=dialog] label.qc-form-item')].find(n=>n.querySelector('span')?.textContent.replace(/\\s*\\*/g,'').trim()===${JSON.stringify(label)}))`), 'form field ' + label); return evaluate(`(()=>{const box=document.querySelector('[role=dialog]');const label=[...box.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent.replace(/\\s*\\*/g,'').trim()===${JSON.stringify(label)});const n=label?.querySelector('input,textarea,select');if(!n)throw Error('missing form label');const proto=n.tagName==='SELECT'?HTMLSelectElement.prototype:n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`) };
    const loginCookie = async username => { const cookie = await x.login(username), i = cookie.indexOf('='); await command('Network.setCookie', { name: cookie.slice(0, i), value: cookie.slice(i + 1), domain: '127.0.0.1', path: '/', httpOnly: true }); };
    const loginUI = async username => { await field('input[name=username]', username); await field('input[name=password]', x.password); await click('登录织序'); };
    const posts = () => network.filter(row => row.method === 'POST' && row.path === '/api/v1/production-resources/commands').length;
    const count = async table => (await x.pool.query('SELECT count(*)::int n FROM ' + table)).rows[0].n;
    const shot = async name => { const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(join(evidence, name + '.png'), Buffer.from(result.data, 'base64')); };
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.resourceMode='ready';window.resourceListMode='ready';window.resourceReceiptMode='ready';window.resourceWaiters=[];window.resourcePostWaiters=[];window.resourceReceiptWaiters=[];
      const resourceFetch=fetch;
      window.fetch=async(...args)=>{
        const url=new URL(String(args[0]),location.href),method=args[1]?.method??'GET';
        if(url.pathname==='/api/v1/production-resources/commands'&&method==='POST'){
          const mode=resourceMode;resourceMode='ready';
          if(mode==='before-network')return Response.json({error:{code:'synthetic_unavailable'}},{status:503});
          const response=await resourceFetch(...args);if(mode==='lost')throw Error('synthetic lost receipt');
          if(mode==='delay200'||mode==='delay401'){const data=await response.json();return new Promise(done=>resourcePostWaiters.push(()=>done(mode==='delay401'?Response.json({error:{code:'synthetic_old_expired'}},{status:401}):Response.json(data,{status:response.status}))));}
          if(mode==='mismatch'){const data=await response.json();return Response.json({...data,payloadHash:'0'.repeat(64)});}
          return response;
        }
        if(url.pathname.startsWith('/api/v1/production-resources/commands/')){
          const mode=resourceReceiptMode;resourceReceiptMode='ready';
          if(mode==='once401')return Response.json({error:{code:'synthetic_current_expired'}},{status:401});
          const response=await resourceFetch(...args);if(mode==='delay200'||mode==='delay401'){const data=await response.json();return new Promise(done=>resourceReceiptWaiters.push(()=>done(mode==='delay401'?Response.json({error:{code:'synthetic_old_expired'}},{status:401}):Response.json(data,{status:response.status}))));}return response;
        }
        if(/^\\/api\\/v1\\/production-resources\\/(factories|sites|groups|calendars)$/.test(url.pathname)&&method==='GET'){
          const mode=resourceListMode;resourceListMode='ready';const response=await resourceFetch(...args);
          if(mode==='delay200'||mode==='delay401')return new Promise(done=>resourceWaiters.push(()=>done(mode==='delay401'?Response.json({error:{code:'synthetic_old_expired'}},{status:401}):response)));
          return response;
        }
        return resourceFetch(...args);
      };` });
    await loginCookie(x.root);
    if (process.env.RESOURCE_UI_BEFORE === '1') {
      assert.match(process.env.RESOURCE_UI_BEFORE_SHA ?? '', /^[a-f0-9]{40}$/);
      assert.equal(build.gitCommit, process.env.RESOURCE_UI_BEFORE_SHA);
      await phase('the exact prior Server build keeps resource routes closed and never mounts Browser resources', async () => {
        for (const width of [1440, 390]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 });
          for (const [name, path] of [['groups', '/basic-settings/production-groups'], ['factories', '/basic-settings/outsource-factories'], ['infrastructure', '/system-settings/production-infrastructure']]) {
            await navigate(path); await has('此模块尚未接通 Server');
            assert.equal(await evaluate("Object.keys(localStorage).some(k=>k==='zhixu.erp.local.operations-settings')"), false);
            if (name === 'infrastructure') await shot('infrastructure-' + width);
          }
        }
        for (const table of ['production_calendars', 'production_sites', 'production_groups', 'production_outsource_factories', 'sales_orders', 'quote_center_quotes']) assert.equal(await count(table), 0);
        assert.equal(posts(), 0);
        assert.equal(network.filter(row => row.path.startsWith('/api/v1/production-resources')).length, 0);
        assert.deepEqual(errors, []); assert.deepEqual(x.errors, []);
      });
      return;
    }
    await phase('empty actual routes do not seed Browser defaults, quotes, orders, logistics or resources', async () => {
      for (const path of ['/basic-settings/production-groups', '/basic-settings/outsource-factories', '/system-settings/production-infrastructure']) { await navigate(path); await has('没有匹配的'); }
      await has('没有匹配的工作日历');
      for (const table of ['production_calendars', 'production_sites', 'production_groups', 'production_outsource_factories', 'sales_orders', 'quote_center_quotes']) assert.equal(await count(table), 0);
      assert.equal(posts(), 0); assert.equal(await evaluate("Object.keys(localStorage).some(k=>k==='zhixu.erp.local.operations-settings')"), false);
      assert.equal(await evaluate("document.body.innerText.includes('新增运输方案')"), false);
    });
    let calendar, site;
    await phase('calendar form creates explicit dates and subsequent editing preserves the complete exception body', async () => {
      await click('＋ 工作日历'); await formField('日历名称', '合成验收日历'); await click('＋ 添加特殊日期');
      await field('input[aria-label=特殊日期]', '2027-01-01'); await field('input[aria-label=特殊日期说明]', '合成假日');
      const before = posts(); await evaluate("(()=>{const n=[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent==='保存工作日历');n.click();n.click()})()");
      await has('工作日历已保存'); assert.equal(posts(), before + 1); assert.equal(await count('production_calendars'), 1);
      calendar = (await x.pool.query('SELECT id::text,version FROM production_calendars')).rows[0];
      await click('编辑工作日历'); await until(() => evaluate("document.querySelector('input[aria-label=特殊日期]')?.value==='2027-01-01'"), 'full calendar detail');
      await formField('备注', '只修改备注'); await click('保存工作日历'); await has('工作日历已保存');
      assert.equal(await count('production_calendar_exceptions'), 1); assert.equal((await x.pool.query('SELECT name FROM production_calendar_exceptions')).rows[0].name, '合成假日');
      calendar.version = 2; await shot('calendar-list');
    });
    await phase('site/group references require an explicit choice, cover paging, and preserve stable identity', async () => {
      for (let i = 0; i < 22; i++) await x.save('calendars', { name: `Z合成分页日历${String(i).padStart(2, '0')}`, enabled: true, remark: '', workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
      await has('没有匹配的生产地点'); await click('＋ 生产地点');
      await formField('地点名称', '合成验收地点'); await formField('国家 / 地区', '柬埔寨 / 金边');
      assert.equal(await evaluate("document.querySelector('select[aria-label=工作日历选择]').value"), '');
      await has('23 条'); await click('下页工作日历'); await has('第 2 页');
      await field('[role=dialog] input[aria-label=搜索工作日历]', '合成验收 日历'); await until(() => evaluate(`Boolean(document.querySelector('select[aria-label=工作日历选择] option[value="${calendar.id}"]'))`), 'filtered calendar option loaded'); await field('select[aria-label=工作日历选择]', calendar.id, 'HTMLSelectElement');
      await formField('产前准备提前天数', '5'); await click('保存生产地点'); await has('生产地点已保存');
      site = (await x.pool.query('SELECT id::text,country_code FROM production_sites')).rows[0]; assert.equal(site.country_code, '柬埔寨 / 金边');
      await navigate('/basic-settings/production-groups'); await has('没有匹配的生产组'); await click('＋ 新增生产组'); await formField('名称', '合成生产A组');
      assert.equal(await evaluate("document.querySelector('select[aria-label=生产地点选择]').value"), ''); await until(() => evaluate(`Boolean(document.querySelector('select[aria-label=生产地点选择] option[value="${site.id}"]'))`), 'site option loaded'); await field('select[aria-label=生产地点选择]', site.id, 'HTMLSelectElement'); await formField('排序', '1.5');
      await click('保存生产组'); await has('生产组已保存'); await has('合成验收地点'); assert.equal(await count('production_groups'), 1);
      await navigate('/basic-settings/production-groups'); await has('合成生产A组'); assert.equal((await x.pool.query('SELECT sort_order::text n FROM production_groups')).rows[0].n, '1.5');
      await click('编辑'); await formField('名称', '合成生产A组'); const beforeSearch = posts(); await field('[role=dialog] input[aria-label=搜索生产地点]', '合成验收 地点');
      await evaluate("document.querySelector('[role=dialog] input[aria-label=搜索生产地点]').focus()");
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await has('1 条'); assert.equal(posts(), beforeSearch, 'Enter inside a reference search must not submit the resource form'); await click('取消');
    });
    await phase('CAS rejection keeps the draft and reads latest only after explicit discard', async () => {
      await navigate('/basic-settings/outsource-factories'); await has('没有匹配的外发厂'); await click('＋ 新增外发厂'); await formField('名称', '合成验收外发厂'); await formField('联系人', '合成联系人'); await click('保存外发厂'); await has('外发厂已保存');
      await click('编辑'); await formField('备注', '尚未保存的旧版本');
      const row = (await x.pool.query('SELECT id::text FROM production_outsource_factories')).rows[0];
      const latest = await x.save('factories', { name: '合成验收外发厂', enabled: true, remark: '另一人已保存', shortName: '', contactPerson: '合成联系人', phone: '' }, { action: 'update', resourceId: row.id, expectedVersion: 1 });
      await evaluate("resourceListMode='delay200'"); await click('保存外发厂'); await has('资料已被其他人更新'); assert.equal((await x.pool.query('SELECT remark FROM production_outsource_factories WHERE id=$1', [row.id])).rows[0].remark, latest.remark);
      assert.equal(await evaluate("document.querySelector('[role=dialog] textarea').value"), '尚未保存的旧版本');
      await until(() => evaluate('resourceWaiters.length===1'), 'conflict directory authority held');
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent==='读取最新版本').matches(':disabled')"), true, 'reload stays disabled until current directory authority returns');
      await evaluate('resourceWaiters.splice(0).forEach(done=>done())');
      await click('读取最新版本'); await until(() => evaluate("document.querySelector('[role=dialog] textarea').value==='另一人已保存'"), 'latest detail');
      await click('取消'); assert.equal(await count('production_outsource_factories'), 1);
    });
    await phase('calendar edited from a site card refreshes current calendar and site facts', async () => {
      await navigate('/system-settings/production-infrastructure'); await has('合成验收地点'); await click('编辑工作日历', 'section[aria-label=生产地点] button'); await formField('日历名称', '合成验收日历已修订');
      await evaluate("(()=>{const box=document.querySelector('[role=dialog]');const n=[...box.querySelectorAll('.qc-weekday-field label')].find(n=>n.textContent==='周六').querySelector('input');n.click()})()");
      await click('＋ 添加特殊日期');
      await evaluate("(()=>{const n=[...document.querySelectorAll('input[aria-label=特殊日期]')].at(-1);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'2027-01-02');n.dispatchEvent(new Event('input',{bubbles:true}));const note=[...document.querySelectorAll('input[aria-label=特殊日期说明]')].at(-1);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(note,'第二合成日期');note.dispatchEvent(new Event('input',{bubbles:true}))})()");
      await click('保存工作日历'); await has('工作日历已保存');
      await until(() => evaluate("(()=>{const site=[...document.querySelectorAll('.qc-infrastructure-entity-card')].find(n=>n.querySelector('strong')?.textContent==='合成验收地点');return site?.innerText.includes('周一至周五')&&site.innerText.includes('2 条')&&site.innerText.includes('合成验收日历已修订')})()"), 'site calendar references refreshed');
      await until(() => evaluate("(()=>{const calendar=[...document.querySelectorAll('.qc-infrastructure-entity-card')].find(n=>n.querySelector('strong')?.textContent==='合成验收日历已修订');return calendar?.innerText.includes('周一至周五')&&calendar.innerText.includes('2 条')})()"), 'current calendar card refreshed');
      assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_calendar_exceptions WHERE calendar_id=$1', [calendar.id])).rows[0].n, 2);
      await shot('production-infrastructure-related-current');
      await navigate('/basic-settings/outsource-factories'); await has('合成验收外发厂');
    });
    await phase('committed write with lost receipt survives refresh and GET recovery without another POST', async () => {
      await click('＋ 新增外发厂'); await formField('名称', '合成回执丢失外发厂'); await evaluate("resourceMode='lost'"); const before = posts();
      await click('保存外发厂'); await has('原保存请求尚未确认'); await until(async () => await count('production_outsource_factories') === 2, 'real lost-reply transaction committed');
      await navigate('/basic-settings/outsource-factories'); await has('原保存请求尚未确认'); assert.equal(posts(), before + 1);
      await click('核对原请求'); await has('外发厂已保存'); assert.equal(posts(), before + 1);
      assert.equal(await evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('zhixu.server.production-resource.pending.v1.')).length"), 0);
    });
    await phase('non-applied unknown command retries only its exact original body after explicit receipt check', async () => {
      await click('＋ 新增外发厂'); await formField('名称', '合成明确重试外发厂'); await evaluate("resourceMode='before-network'"); const before = posts();
      await click('保存外发厂'); await has('原保存请求尚未确认'); const original = await evaluate("JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k=>k.startsWith('zhixu.server.production-resource.pending.v1.')))).command");
      await navigate('/basic-settings/outsource-factories'); await has('原保存请求尚未确认'); await click('核对原请求'); await has('暂未查到原请求结果');
      await click('重试原请求'); await has('外发厂已保存'); assert.equal(posts(), before + 1);
      assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_resource_commands WHERE request_id=$1', [original.requestId])).rows[0].n, 1); assert.equal(await count('production_outsource_factories'), 3);
    });
    await phase('mismatched receipt keeps original bytes and cannot unlock another creation', async () => {
      await click('＋ 新增外发厂'); await formField('名称', '合成摘要核对外发厂'); await evaluate("resourceMode='mismatch'"); const before = posts(); await click('保存外发厂'); await has('核对结果与原请求不一致');
      assert.equal(await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent==='＋ 新增外发厂').matches(':disabled')"), true);
      await navigate('/basic-settings/outsource-factories'); await has('原保存请求尚未确认'); await click('核对原请求'); await has('外发厂已保存'); assert.equal(posts(), before + 1);
    });
    await phase('read-only and unauthorized users cannot submit, including implicit Enter', async () => {
      const n = await count('production_outsource_factories'), before = posts();
      for (const username of ['resource.viewer', 'resource.denied']) {
        await loginCookie(username); await navigate('/basic-settings/outsource-factories'); await has(username === 'resource.viewer' ? '合成验收外发厂' : '没有执行此操作的权限');
        assert.equal(await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent==='＋ 新增外发厂').matches(':disabled')"), true);
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      }
      assert.equal(posts(), before); assert.equal(await count('production_outsource_factories'), n);
      await loginCookie(x.root); await navigate('/basic-settings/outsource-factories'); await has('合成验收外发厂');
    });
    await phase('late list200/list401 is ignored across real SPA A to B to A identity changes', async () => {
      for (const mode of ['delay200', 'delay401']) {
        await evaluate(`resourceListMode=${JSON.stringify(mode)}`); await click('重新读取'); await until(() => evaluate('resourceWaiters.length===1'), 'held old list');
        for (const username of ['resource.second', x.root]) { await click('用户菜单'); await click('退出登录'); await has('忘记密码？请联系系统管理员'); await loginUI(username); await has('合成验收外发厂'); }
        assert.equal(await evaluate('resourceWaiters.length'), 1); await evaluate('resourceWaiters.splice(0).forEach(done=>done())'); await wait(150);
        assert.equal(await evaluate("Boolean(document.querySelector('input[name=username]'))"), false); await has('合成验收外发厂');
      }
    });
    await phase('fresh server grants block stale form Enter after revocation and preserve the exact retry identity', async () => {
      await x.user('resource.revoked', ['quote.view', 'settings.outsource_factory.edit']); await loginCookie('resource.revoked'); await navigate('/basic-settings/outsource-factories'); await has('合成验收外发厂');
      const n = await count('production_outsource_factories');
      // Hold, then execute the real initial-focus frame to reproduce the race in
      // the old harness. No synthetic submit or second Enter is used.
      await evaluate("(()=>{const original=requestAnimationFrame.bind(window);window.resourceFocusFrame={original,held:[]};window.requestAnimationFrame=callback=>original(timestamp=>resourceFocusFrame.held.push(()=>callback(timestamp)))})()");
      try {
        await click('＋ 新增外发厂'); await formField('名称', '合成撤权保护外发厂');
        await until(() => evaluate("document.body.style.overflow==='hidden'"), 'drawer focus lifecycle installed');
        await evaluate('new Promise(done=>resourceFocusFrame.original(done))');
        assert.ok(await evaluate('resourceFocusFrame.held.length>0'), 'the real overlay focus frame is held');
        assert.equal(await evaluate("(()=>{const n=document.querySelector('[role=dialog] input');n.focus();return document.activeElement===n})()"), true);
        await evaluate('(()=>{requestAnimationFrame=resourceFocusFrame.original;resourceFocusFrame.held.splice(0).forEach(run=>run())})()');
        assert.equal(await evaluate("document.activeElement===document.querySelector('[role=dialog] header>button')"), true, 'the pending initial frame can replace an early input focus');
      } finally {
        await evaluate('(()=>{if(window.resourceFocusFrame){requestAnimationFrame=resourceFocusFrame.original;resourceFocusFrame.held.splice(0).forEach(run=>run())}})()');
      }
      await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='resource.revoked' AND permission_key='settings.outsource_factory.edit'");
      const before = posts(), responseStart = commandResponses.length;
      assert.equal(await evaluate("(()=>{const d=document.querySelector('[role=dialog]'),n=d.querySelector('input'),submit=d.querySelector('button[type=submit]');n.focus();return document.activeElement===n&&n.value==='合成撤权保护外发厂'&&!n.matches(':disabled')&&!submit.matches(':disabled')&&d.checkValidity()})()"), true, 'one native Enter starts from the ready form input');
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await until(() => posts() === before + 1, 'one native Enter reaches the resource API');
      await until(() => commandResponses.length === responseStart + 1, 'revoked command response');
      assert.equal(commandResponses.at(-1).status, 403);
      await has('没有执行此操作的权限'); assert.equal(await count('production_outsource_factories'), n);
      const original = await evaluate("JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k=>k.startsWith('zhixu.server.production-resource.pending.v1.')))).command");
      assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_resource_commands WHERE request_id=$1', [original.requestId])).rows[0].n, 0);
      await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('resource.revoked','settings.outsource_factory.edit')");
      await click('核对原请求', '[role=dialog] button'); await has('暂未查到原请求结果'); await click('重试原请求', '[role=dialog] button'); await has('外发厂已保存'); assert.equal(await count('production_outsource_factories'), n + 1);
      assert.equal(posts(), before + 2, 'only the explicit original retry sends one additional POST');
      assert.equal((await x.pool.query('SELECT count(*)::int n FROM production_resource_commands WHERE request_id=$1', [original.requestId])).rows[0].n, 1);
      await loginCookie(x.root); await navigate('/basic-settings/outsource-factories'); await has('合成验收外发厂');
    });
    await phase('held committed POST and known receipt200/401 cannot consume the returned A session pending request', async () => {
      for (const [channel, status] of [['post', '200'], ['post', '401'], ['receipt', '200'], ['receipt', '401']]) {
        await navigate('/system-settings/production-infrastructure'); await has('合成验收地点'); await has('＋ 工作日历');
        await evaluate("resourceListMode='delay401'"); await click('重新读取', 'section[aria-label=生产地点] button'); await until(() => evaluate('resourceWaiters.length===1'), 'in-flight current list');
        await click('＋ 工作日历'); await formField('日历名称', '合成跨会话日历' + channel + status); const before = posts();
        await evaluate(`resourceMode=${JSON.stringify(channel === 'post' ? 'delay' + status : 'lost')}`); await click('保存工作日历');
        if (channel === 'receipt') {
          await until(() => evaluate("[...document.querySelectorAll('[role=dialog] button')].some(n=>n.textContent==='核对原请求'&&!n.matches(':disabled'))"), 'lost POST finished');
          await evaluate(`resourceReceiptMode=${JSON.stringify('delay' + status)}`); await click('核对原请求', '[role=dialog] button');
        }
        const waiters = channel === 'post' ? 'resourcePostWaiters' : 'resourceReceiptWaiters'; await until(() => evaluate(waiters + '.length===1'), 'held old ' + channel);
        const key = await evaluate("Object.keys(sessionStorage).find(k=>k.startsWith('zhixu.server.production-resource.pending.v1.')&&k.endsWith('.calendars'))"), raw = await evaluate('sessionStorage.getItem(' + JSON.stringify(key) + ')');
        await evaluate('resourceWaiters.splice(0).forEach(done=>done())'); await has('忘记密码？请联系系统管理员');
        await loginUI('resource.second'); await has('合成验收地点'); assert.equal(await evaluate("document.body.innerText.includes('原保存请求尚未确认')"), false, 'B never reads A pending command');
        await click('用户菜单'); await click('退出登录'); await has('忘记密码？请联系系统管理员'); await loginUI(x.root); await has('原保存请求尚未确认');
        await evaluate(waiters + '.splice(0).forEach(done=>done())'); await wait(100);
        assert.equal(await evaluate('sessionStorage.getItem(' + JSON.stringify(key) + ')'), raw, 'old owner cannot acknowledge A returned session'); assert.equal(await evaluate("Boolean(document.querySelector('input[name=username]'))"), false);
        await click('核对原请求'); await has('工作日历已保存'); assert.equal(posts(), before + 1);
      }
      await navigate('/basic-settings/outsource-factories'); await has('合成验收外发厂');
    });
    await phase('existing responsive table/drawer and navigation keep page width at six sizes; dirty input is guarded', async () => {
      for (const width of [1920, 1536, 1440, 1280, 900, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 }); await navigate('/basic-settings/outsource-factories'); await has('合成验收外发厂');
        await click('＋ 新增外发厂'); await formField('名称', '未保存资料');
        const metrics = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,drawer:document.querySelector('[role=dialog]').getBoundingClientRect().toJSON()})");
        assert.ok(metrics.scroll <= width + 1, JSON.stringify(metrics)); assert.ok(metrics.drawer.width <= width + 1); geometry.push(metrics); await shot('factory-form-' + width);
        await click('取消'); await has('有未保存修改'); await click('放弃修改');
      }
      for (const width of [1440, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 }); await navigate('/system-settings/production-infrastructure'); await has('合成验收地点'); await click('编辑工作日历', 'section[aria-label=生产地点] button');
        await until(() => evaluate("document.querySelector('input[aria-label=特殊日期]')?.value==='2027-01-01'"), 'responsive calendar detail');
        const metrics = await evaluate("({page:'calendar',width:innerWidth,scroll:document.documentElement.scrollWidth,drawer:document.querySelector('[role=dialog]').getBoundingClientRect().toJSON()})");
        assert.ok(metrics.scroll <= width + 1, JSON.stringify(metrics)); assert.ok(metrics.drawer.width <= width + 1); geometry.push(metrics); await shot('calendar-form-' + width); await click('取消');
      }
    });
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []); assert.equal(await count('sales_orders'), 0); assert.equal(await count('quote_center_quotes'), 0);
    assert.equal(await evaluate("Object.keys(localStorage).some(k=>k==='zhixu.erp.local.operations-settings')"), false);
  } finally {
    let evidenceError, browserStopError, browserStopped = false;
    try { await writeFile(join(evidence, 'build-and-checks.json'), JSON.stringify({ build, geometry, errors }, null, 2) + '\n'); }
    catch (error) { evidenceError = error; }
    try { await stopOwnedChromium(browser, { gracefulClose: closeBrowser }); browserStopped = true; }
    catch (error) { browserStopError = error; }
    finally {
      ws?.close();
      for (const call of pending.values()) { clearTimeout(call.timer); call.reject(Error('Owned production-resource fixture closed')); }
      pending.clear();
    }
    try { await x.close(); }
    finally {
      const distance = relative(resolve(tmpdir()), resolve(temp));
      assert.ok(distance && !distance.startsWith('..') && !isAbsolute(distance) && temp.includes('zhixu-resource-ui-'));
      if (browserStopped) await rm(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
      else t.diagnostic('Owned Chromium exit unconfirmed; private profile retained at ' + temp);
    }
    if (browserStopError) throw browserStopError;
    if (evidenceError) throw evidenceError;
    t.diagnostic('Owned production-resource Chromium/HTTP/PG cleanup PASS; no real environment access');
  }
});
