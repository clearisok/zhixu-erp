// Exact built UI; only owned synthetic PostgreSQL, private Chromium and local GETs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startContinuousFixture } from './ainuoke-continuous-fixture.ts';
import { waitForChromiumEndpoint, stopOwnedChromium } from './chromium-endpoint.mjs';

const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label, timeout = 16000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await read()) return; } catch (error) { if (!/Execution context was destroyed|Cannot find context|Inspected target navigated/.test(String(error))) throw error; } await wait(60); }
  throw Error(label + ' timed out');
}

test('garment observations and history use the exact Server order detail without mutation or fallback', { timeout: 300000 }, async t => {
  const phase = async (name, run) => { let failed; await t.test(name, async () => { try { await run(); } catch (error) { failed = error; throw error; } }); if (failed) throw failed; };
  const beforeBuild = process.env.GARMENT_SHIPMENTS_UI_BEFORE === '1';
  if (!beforeBuild) assert.equal(process.env.GARMENT_SHIPMENTS_STATIC_DIR, undefined, 'after requires its own exact static build');
  const staticDirectory = resolve(beforeBuild ? process.env.GARMENT_SHIPMENTS_STATIC_DIR ?? 'dist/client' : 'dist/client');
  const info = JSON.parse(readFileSync(join(staticDirectory, 'build-info.json'), 'utf8')); assert.equal(info.quoteAuthority, 'server'); assert.equal(info.orderRead, 'snapshot'); assert.equal(info.identityMode, 'session');
  const expected = beforeBuild ? process.env.GARMENT_SHIPMENTS_BEFORE_SHA : process.env.GARMENT_SHIPMENTS_EXPECTED_SOURCE;
  assert.match(expected ?? '', /^[a-f0-9]{40}$/); assert.equal(info.gitCommit, expected);
  if (beforeBuild) assert.equal(expected, 'a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad', 'last approved rendered order detail baseline');
  const run = process.env.GARMENT_SHIPMENTS_UI_RUN ?? ''; assert.match(run, /^[a-z0-9-]{0,64}$/);
  const evidence = process.env.GARMENT_SHIPMENTS_UI_EVIDENCE === '1', evidenceDirectory = resolve('outputs/garment-shipments-ui', info.gitCommit + '-' + info.buildId + (run ? '-' + run : ''));
  const x = await startContinuousFixture(staticDirectory, { garmentShipments: true });
  const temp = await mkdtemp(join(tmpdir(), 'zhixu-garment-ui-')), pending = new Map(), errors = [], metrics = [];
  let browser, ws, session, closeBrowser, serial = 0;
  try {
    if (evidence) { await mkdir(resolve('outputs/garment-shipments-ui'), { recursive: true }); await mkdir(evidenceDirectory); }
    browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome'), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + join(temp, 'profile'), 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const [port, endpoint] = await waitForChromiumEndpoint(join(temp, 'profile'), { timeoutMs: 20000 });
    ws = new WebSocket('ws://127.0.0.1:' + port + endpoint); await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, sid = session) => new Promise((done, reject) => {
      if (ws.readyState !== WebSocket.OPEN) { reject(Error('private CDP socket is closed')); return; }
      const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('private CDP deadline ' + method)); }, 16000);
      const item = { done: value => { clearTimeout(timer); done(value); }, reject: error => { clearTimeout(timer); reject(error); } }; pending.set(id, item);
      try { ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); } catch (error) { pending.delete(id); item.reject(error); }
    });
    closeBrowser = () => command('Browser.close', {}, null);
    const disconnect = () => { for (const item of pending.values()) item.reject(Error('private CDP disconnected')); pending.clear(); };
    ws.addEventListener('close', disconnect); ws.addEventListener('error', disconnect);
    ws.addEventListener('message', ({ data }) => { const value = JSON.parse(String(data)), item = pending.get(value.id); if (item) { pending.delete(value.id); if (value.error) item.reject(Error(JSON.stringify(value.error))); else item.done(value.result); } if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.text); });
    const target = await command('Target.createTarget', { url: 'about:blank' }, null); session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null)).sessionId;
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.garmentWire={requests:[],current:'ready',history:'ready',detail:'ready',waiters:[]};window.garmentFetch=window.fetch;
      window.fetch=async(input,init)=>{const u=new URL(String(input),location.href),w=garmentWire,m=init?.method??'GET';w.requests.push({path:u.pathname,query:u.search,method:m});
        if(!u.pathname.includes('/garment-shipments'))return garmentFetch(input,init);
        const channel=u.pathname.endsWith('/history')?'history':u.pathname.endsWith('/garment-shipments')?'current':'detail',mode=w[channel];w[channel]='ready';
        if(['401','403','404','503'].includes(mode))return Response.json({error:{code:mode==='503'?'garment_read_not_connected':'synthetic_denied'}},{status:Number(mode)});
        const r=await garmentFetch(input,init);
        if(mode==='hold200'||mode==='hold401')return new Promise(done=>w.waiters.push(()=>done(mode==='hold401'?Response.json({error:{code:'authentication_required'}},{status:401}):r)));
        if(mode==='empty_cursor'){const d=await r.json();return Response.json({...d,records:[]});}
        if(mode==='wrong_publication'){const d=await r.json();return Response.json({...d,publicationId:'11111111-2222-4333-8444-555555555555'});}
        return r;
      };` });
    const evaluate = async expression => { const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.equal(value.exceptionDetails, undefined, JSON.stringify(value.exceptionDetails)); return value.result.value; };
    const has = text => until(() => evaluate('(document.body?.innerText??\'\').includes(' + JSON.stringify(text) + ')'), text);
    const text = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ')?.innerText??\'\'');
    const click = async (name, selector = '[data-garment-section] button') => {
      const find = `(()=>[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.textContent.trim()===${JSON.stringify(name)}))()`;
      await until(() => evaluate('(()=>{const b=' + find + ';if(!b||b.disabled||!b.isConnected)return false;b.click();return true})()'), 'enabled ' + name);
    };
    const field = (selector, value) => evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const cookie = async username => { const value = await x.login(username), index = value.indexOf('='); await command('Network.setCookie', { name: value.slice(0, index), value: value.slice(index + 1), domain: '127.0.0.1', path: '/', httpOnly: true }); };
    const route = '/order-center/server-detail?id=' + x.orderId;
    const navigate = async () => { const marker = randomUUID(); await evaluate('window.garmentNavigation=' + JSON.stringify(marker)); await command('Page.navigate', { url: x.base + route }); await until(() => evaluate('window.garmentNavigation!==' + JSON.stringify(marker) + '&&document.readyState===\'complete\''), 'fresh order document'); await has(beforeBuild ? '订单概况' : '展开出货记录'); };
    const login = async username => { await until(() => evaluate("!!document.querySelector('input[name=username]')"), 'login card'); await field('input[name=username]', username); await field('input[name=password]', x.password); await evaluate("document.querySelector('input[name=username]').closest('form').requestSubmit()"); await has('展开出货记录'); };
    const logout = async () => { await evaluate("document.querySelector('[aria-label=用户菜单]').click()"); await click('退出登录', 'button'); await until(() => evaluate("!!document.querySelector('input[name=username]')"), 'logout complete'); };
    const open = async () => { if ((await text('[data-garment-section]')).includes('展开出货记录')) await click('展开出货记录'); await has('本次出库数'); };
    const shot = async name => { if (evidence) await writeFile(join(evidenceDirectory, name + '.png'), Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };
    const counts = async () => (await x.pool.query('SELECT (SELECT count(*) FROM ainuoke_garment_shipment_snapshots)::int snapshots,(SELECT count(*) FROM production_schedule_executions)::int executions')).rows[0];

    await cookie('demo.admin'); await navigate();
    if (beforeBuild) {
      const baseline = await counts();
      await phase('exact previous order build has no shipment surface or request at six widths', async () => {
        for (const [width, scale] of [[1920, 1], [1536, 1.25], [1440, 1], [1280, 1], [900, 1], [390, 1]]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: scale, mobile: width === 390 });
          await evaluate("document.querySelector('h1').scrollIntoView({block:'start'});window.scrollTo(0,0)");
          assert.equal(await evaluate("!!document.querySelector('[data-garment-section]')"), false);
          assert.equal(await evaluate("garmentWire.requests.some(r=>r.path.includes('/garment-shipments'))"), false);
          metrics.push(await evaluate("({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,shipmentSection:!!document.querySelector('[data-garment-section]')})"));
          await shot('before-order-' + width);
        }
      });
      await phase('previous rendered page causes no business writes or Browser fallback', async () => {
        assert.deepEqual(await counts(), baseline); assert.deepEqual(await evaluate("garmentWire.requests.filter(r=>r.method!=='GET')"), []);
        assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"), []); assert.deepEqual(errors, []); assert.deepEqual(x.errors, []);
      });
      return;
    }
    await phase('collapsed surface performs no shipment request; exact Num and independent outdate appear on explicit open', async () => {
      assert.equal(await evaluate("garmentWire.requests.filter(r=>r.path.includes('/garment-shipments')).length"), 0); await open();
      await has('9007199254740993.000000000001'); await has('2026-10-11'); await has('2026-10-07'); await has('0 · 件'); await has('-2.5 · 件'); await has('数量未提供'); await has('待核对（not-a-number）');
      assert.equal(/PRIVATE-GARMENT|wxprice/.test(await text('[data-garment-section]')), false); await click('下一页出货'); await has('21–40 / 127'); await click('上一页出货'); await shot('current-desktop');
    });
    await phase('six widths keep source records and history within the viewport using table-local overflow', async () => {
      for (const [width, scale] of [[1920, 1], [1536, 1.25], [1440, 1], [1280, 1], [900, 1], [390, 1]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: scale, mobile: width === 390 });
        await until(async () => (await text('[data-garment-section]')).includes('9007199254740993.000000000001'), 'displayed records before screenshot');
        await evaluate("document.querySelector('[data-garment-section]').scrollIntoView({block:'start'});window.scrollBy(0,-80)");
        const geometry = await evaluate("(()=>{const b=document.querySelector('[data-garment-section]').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,inside:b.left>=-1&&b.right<=innerWidth+1}})()"); assert.equal(geometry.overflow, false); assert.equal(geometry.inside, true);
        await shot('current-' + width); await click('出货历史'); await has('查看第 1 次记录');
        const drawer = await evaluate("(()=>{const b=document.querySelector('.qc-drawer').getBoundingClientRect();return {inside:b.left>=-1&&b.right<=innerWidth+1,overflow:document.documentElement.scrollWidth>innerWidth+1,footer:!!document.querySelector('.qc-drawer>footer')}})()"); assert.equal(drawer.inside, true); assert.equal(drawer.overflow, false); assert.equal(drawer.footer, true); metrics.push({ ...geometry, drawer }); await shot('history-' + width); await click('关闭出货历史', '.qc-drawer button');
      }
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    });
    await phase('mobile touch opens and closes shipment history without business writes', async () => {
      const before = await counts(); await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true }); await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      const touch = async (name, selector) => {
        const find = `(()=>[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.textContent.trim()===${JSON.stringify(name)}))()`;
        const target = await evaluate(`(()=>{const b=${find};if(!b||b.disabled)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}})()`);
        assert.ok(target?.inside); assert.ok(target.width > 0 && target.height > 0);
        await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: target.x, y: target.y }] }); await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return target;
      };
      const openTarget = await touch('出货历史', '[data-garment-section] button'); await has('查看第 1 次记录'); await shot('touch-history-390');
      const closeTarget = await touch('关闭出货历史', '.qc-drawer button'); await until(() => evaluate("!document.querySelector('.qc-drawer')"), 'touch history close');
      assert.deepEqual(await counts(), before); assert.deepEqual(await evaluate("garmentWire.requests.filter(r=>r.path.includes('/garment-shipments')&&r.method!=='GET')"), []);
      metrics.push({ touch: { width: 390, openTarget, closeTarget, actualTouchEvents: true } }); await command('Emulation.setTouchEmulationEnabled', { enabled: false }); await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    });
    await phase('old expiry and target policy label retain history without financial or production mutation', async () => {
      x.garments.setOffset(70000); await click('重新读取出货记录'); await has('已过期 · 历史观察'); await has('9007199254740993.000000000001');
      await x.pool.query("UPDATE ainuoke_garment_shipment_targets SET freshness_ms=120000,version=version+1 WHERE source_key='synthetic-demo'"); await click('重新读取出货记录'); await has('来源时效设置已变化'); await has('已过期 · 历史观察');
      x.garments.setOffset(0); await shot('stale-policy');
    });
    await phase('empty current observation and old nonempty detail remain separate', async () => {
      await x.garments.publish(0); await click('重新读取出货记录'); await has('本次指定合同查询没有记录'); await click('出货历史'); await has('查看第 1 次记录'); await click('查看第 1 次记录', '.qc-drawer button'); await has('9007199254740993.000000000001');
      for (const width of [1440, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 });
        await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
        assert.equal(await evaluate("(()=>{const n=document.querySelector('[data-garment-history-record]'),d=document.querySelector('.qc-drawer').getBoundingClientRect();return !!n&&n.innerText.includes('9007199254740993.000000000001')&&n.innerText.includes('2026-10-11')&&n.scrollWidth<=n.clientWidth+1&&d.left>=-1&&d.right<=innerWidth+1})()"), true);
        await shot('historical-detail-' + width);
      }
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await click('关闭出货历史', '.qc-drawer button'); await has('本次指定合同查询没有记录'); assert.equal((await text('[data-garment-section]')).includes('9007199254740993.000000000001'), false);
    });
    await phase('an empty filtered history page still follows the server cursor', async () => {
      for (let i = 0; i < 25; i++) await x.garments.publish(0);
      await evaluate("garmentWire.history='empty_cursor'"); await click('出货历史'); await has('仍可继续查看更早记录。'); await click('更早出货记录', '.qc-drawer button'); await has('查看第 1 次记录');
      assert.ok(await evaluate("garmentWire.requests.some(r=>r.path.endsWith('/garment-shipments/history')&&r.query.includes('beforeGeneration='))")); await click('关闭出货历史', '.qc-drawer button');
    });
    await phase('unavailable or mismatched selected publication never falls back to a current snapshot', async () => {
      await click('出货历史'); await has('查看第 27 次记录'); await evaluate("garmentWire.detail='404'"); await click('查看第 27 次记录', '.qc-drawer button'); await has('这张订单或所选历史记录暂不可用。');
      assert.equal((await text('.qc-drawer')).includes('本次指定合同查询没有记录'), false); await click('返回出货记录列表', '.qc-drawer button'); await has('查看第 27 次记录'); await evaluate("garmentWire.detail='wrong_publication'"); await click('查看第 27 次记录', '.qc-drawer button'); await has('成衣出货记录无法安全核对'); await click('关闭出货历史', '.qc-drawer button');
    });
    await phase('fold and history close invalidate held 401 at layout commit before passive cleanup', async () => {
      for (const channel of ['current', 'history']) {
        await evaluate('garmentWire.' + channel + "='hold401'");
        if (channel === 'current') await click('重新读取出货记录'); else await click('出货历史');
        await until(() => evaluate('garmentWire.waiters.length===1'), 'held ' + channel);
        await evaluate(`window.garmentClosed=false;window.garmentCloseObserver=new MutationObserver(()=>{if(${channel === 'current' ? "[...document.querySelectorAll('[data-garment-section] button')].some(n=>n.textContent==='展开出货记录')" : "!document.querySelector('.qc-drawer')"}){garmentCloseObserver.disconnect();garmentClosed=true;garmentWire.waiters.splice(0).forEach(done=>done())}});garmentCloseObserver.observe(document.body,{subtree:true,childList:true});`);
        if (channel === 'current') await click('收起出货记录'); else await click('关闭出货历史', '.qc-drawer button');
        await until(() => evaluate('garmentClosed'), 'committed close'); await wait(100); assert.equal(await evaluate("!!document.querySelector('[aria-label=用户菜单]')&&!document.querySelector('input[name=username]')"), true);
        if (channel === 'current') { await click('展开出货记录'); await has('本次指定合同查询没有记录'); }
      }
    });
    await phase('A to B to A cannot accept held old 200 or invalidate the new A with old 401', async () => {
      for (const status of [200, 401]) {
        await evaluate("garmentWire.current='hold" + status + "'"); await click('重新读取出货记录'); await until(() => evaluate('garmentWire.waiters.length===1'), 'old A read');
        await logout(); await login('demo.material'); await logout(); await login('demo.admin'); await evaluate('garmentWire.waiters.splice(0).forEach(done=>done())'); await wait(150);
        assert.equal(await evaluate("!!document.querySelector('[aria-label=用户菜单]')&&!document.querySelector('input[name=username]')"), true); assert.equal(await evaluate("[...document.querySelectorAll('[data-garment-section] button')].some(n=>n.textContent==='展开出货记录')"), true); await click('展开出货记录'); await has('本次指定合同查询没有记录');
      }
    });
    await phase('the monotonic deadline marks a displayed observation stale without fetching or erasing it', async () => {
      await x.pool.query("UPDATE ainuoke_garment_shipment_targets SET freshness_ms=6500,version=version+1 WHERE source_key='synthetic-demo'");
      await x.garments.publish(1); await click('重新读取出货记录'); await has('第 28 次记录'); await has('9007199254740993.000000000001');
      const before = await evaluate("garmentWire.requests.filter(r=>r.path.includes('/garment-shipments')).length");
      await has('已过期 · 历史观察'); await has('9007199254740993.000000000001'); assert.equal(await evaluate("garmentWire.requests.filter(r=>r.path.includes('/garment-shipments')).length"), before);
      await x.pool.query("UPDATE ainuoke_garment_shipment_targets SET freshness_ms=120000,version=version+1 WHERE source_key='synthetic-demo'");
    });
    await phase('a 403 response and disabled source clear old content until explicit reread', async () => {
      await x.garments.publish(1); await click('重新读取出货记录'); await has('9007199254740993.000000000001'); await evaluate("garmentWire.current='403'"); await click('重新读取出货记录'); await has('当前账号没有查看成衣出货的权限。'); assert.equal((await text('[data-garment-section]')).includes('9007199254740993.000000000001'), false);
      await click('重试'); await has('9007199254740993.000000000001'); await x.garments.setEnabled(false); await click('重新读取出货记录'); await has('成衣出货来源尚未接通。'); assert.equal((await text('[data-garment-section]')).includes('9007199254740993.000000000001'), false);
      await x.garments.setEnabled(true); await click('重试'); await has('9007199254740993.000000000001');
    });
    await phase('local disabled service is isolated from order detail and no write or Browser business storage occurs', async () => {
      const before = await counts(); await evaluate("garmentWire.current='503'"); await click('重新读取出货记录'); await has('成衣出货来源尚未接通。'); await has('订单概况');
      assert.deepEqual(await counts(), before); assert.deepEqual(await evaluate("garmentWire.requests.filter(r=>r.path.includes('/garment-shipments')&&r.method!=='GET')"), []);
      assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"), []); assert.equal(/PRIVATE-GARMENT/.test(await evaluate('document.body.innerText')), false);
    });
    await phase('all existing synthetic roles respect current order and source grants without amount leakage', async () => {
      for (const username of x.users) {
        const grants = new Set((await x.pool.query('SELECT rp.permission_key FROM app_users u JOIN app_user_roles ur ON ur.user_id=u.id JOIN app_role_permissions rp ON rp.role_id=ur.role_id WHERE u.username=$1', [username])).rows.map(row => row.permission_key));
        await cookie(username); const marker = randomUUID(); await evaluate('window.garmentRoleNavigation=' + JSON.stringify(marker)); await command('Page.navigate', { url: x.base + route });
        await until(() => evaluate('window.garmentRoleNavigation!==' + JSON.stringify(marker) + '&&document.readyState===\'complete\''), 'fresh role document');
        await until(() => evaluate("(document.body?.innerText??'').includes('订单概况')||(document.body?.innerText??'').includes('当前 Server 账号没有订单查看权限')"), 'role order state ' + username);
        const allowed = grants.has('order.view') && grants.has('ainuoke.view');
        assert.equal(await evaluate("!!document.querySelector('[data-garment-section]')"), allowed);
        if (allowed) { await click('展开出货记录'); await has('9007199254740993.000000000001'); }
        else assert.equal(await evaluate("garmentWire.requests.filter(r=>r.path.includes('/garment-shipments')).length"), 0);
        assert.equal(/PRIVATE-GARMENT|wxprice/.test(await evaluate('document.body.innerText')), false);
      }
    });
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []);
    if (evidence) await writeFile(join(evidenceDirectory, 'receipt.json'), JSON.stringify({ schemaVersion: 'garment-shipment-ui.v1', renderedSourceSha: info.gitCommit, buildId: info.buildId, before: beforeBuild, synthetic: true, realSourceRequests: 0, sourceActivation: 'not-activated', metrics }, null, 2) + '\n');
  } finally {
    let evidenceError, stopError, stopped = false;
    try { if (evidence) await writeFile(join(evidenceDirectory, 'build-and-checks.json'), JSON.stringify({ renderedSourceSha: info.gitCommit, before: beforeBuild, build: info, metrics, errors }, null, 2) + '\n'); } catch (error) { evidenceError = error; }
    try { await stopOwnedChromium(browser, { gracefulClose: closeBrowser }); stopped = true; } catch (error) { stopError = error; }
    finally { ws?.close(); for (const item of pending.values()) item.reject(Error('Owned garment fixture closed')); pending.clear(); }
    try { await x.close(); } finally {
      const owned = relative(resolve(tmpdir()), resolve(temp)); if (!owned || owned.startsWith('..') || isAbsolute(owned) || !owned.startsWith('zhixu-garment-ui-')) throw Error('unsafe owned browser cleanup');
      if (stopped) await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      else t.diagnostic('Owned Chromium exit unconfirmed; private profile retained at ' + temp);
    }
    if (stopError) throw stopError; if (evidenceError) throw evidenceError;
    t.diagnostic('Owned garment Chromium/HTTP/PG cleanup PASS; no real environment access');
  }
});
