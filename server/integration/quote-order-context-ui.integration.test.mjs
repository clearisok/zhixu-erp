import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startContinuousFixture } from './ainuoke-continuous-fixture.ts';
import { waitForChromiumEndpoint } from './chromium-endpoint.mjs';

const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await read()) return; }
    catch (error) { if (!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context/.test(String(error))) throw error; }
    await wait(60);
  }
  throw Error(label + ' timed out');
}
test('built source-context draft uses existing editor and receipt recovery with no SO/adoption write', { timeout: 240000 }, async t => {
  const info = JSON.parse(readFileSync('dist/client/build-info.json', 'utf8'));
  assert.equal(info.quoteAuthority, 'server'); assert.equal(info.orderRead, 'snapshot');
  const x = await startContinuousFixture(resolve('dist/client'));
  const temp = await mkdtemp(join(tmpdir(), 'zhixu-source-quote-ui-'));
  const evidence = resolve('outputs/source-quote-ui', info.gitCommit + '-' + Date.now());
  let browser, ws, session, closeBrowser, id = 0;
  const pending = new Map(), errors = [], requests = [], metrics = [];
  try {
    const profile = join(temp, 'profile');
    browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const [port, path] = await waitForChromiumEndpoint(profile, { timeoutMs: 20000 });
    ws = new WebSocket('ws://127.0.0.1:' + port + path);
    await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, sid = session) => new Promise((done, reject) => {
      const request = ++id, timer = setTimeout(() => { pending.delete(request); reject(Error('CDP ' + method + ' timed out')); }, 15000);
      pending.set(request, { done, reject, timer }); ws.send(JSON.stringify({ id: request, method, params, sessionId: sid }));
    });
    closeBrowser = () => command('Browser.close', {}, undefined);
    ws.addEventListener('message', ({ data }) => {
      const r = JSON.parse(String(data)), p = pending.get(r.id);
      if (p) { pending.delete(r.id); clearTimeout(p.timer); if (r.error) p.reject(Error(JSON.stringify(r.error))); else p.done(r.result); }
      if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails.text);
      if (r.method === 'Network.requestWillBeSent') requests.push({ method: r.params.request.method, path: new URL(r.params.request.url).pathname });
      if (r.method === 'Page.javascriptDialogOpening') void command('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    });
    ws.addEventListener('close', () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Owned browser closed')); } pending.clear(); });
    const target = await command('Target.createTarget', { url: 'about:blank' }, undefined);
    session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)).sessionId;
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable'); await command('Page.bringToFront');
    const evaluate = async expression => {
      const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(r.exceptionDetails, undefined, JSON.stringify(r.exceptionDetails)); return r.result.value;
    };
    const navigate = async path => {
      const marker = Date.now() + Math.random(); await evaluate('window.navEpoch=' + marker);
      await command('Page.navigate', { url: x.base + path });
      await until(() => evaluate("window.navEpoch!==" + marker + "&&document.readyState==='complete'"), 'navigation');
    };
    const has = text => until(() => evaluate('Boolean(document.body?.innerText.includes(' + JSON.stringify(text) + '))'), text);
    const click = async label => {
      const predicate = `n=>(n.getAttribute('aria-label')??n.textContent.trim())===${JSON.stringify(label)}&&!n.matches(':disabled')&&n.getClientRects().length`;
      await until(() => evaluate(`Boolean([...document.querySelectorAll('button,a')].find(${predicate}))`), 'enabled control ' + label);
      return evaluate(`(()=>{const n=[...document.querySelectorAll('button,a')].find(${predicate});if(!n)throw Error('missing control');n.click()})()`);
    };
    const loginCookie = async username => { const cookie = await x.login(username), at = cookie.indexOf('='); await command('Network.setCookie', { name: cookie.slice(0, at), value: cookie.slice(at + 1), domain: '127.0.0.1', path: '/', httpOnly: true }); };
    const input = (selector, value) => evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    const loginUI = async username => { await input('input[name=username]', username); await input('input[name=password]', x.password); await click('登录织序'); };
    const shot = async name => {
      if (process.env.SOURCE_QUOTE_EVIDENCE !== '1') return;
      await mkdir(evidence, { recursive: true }); const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(evidence, name + '.png'), Buffer.from(result.data, 'base64'));
    };
    // Fault injection wraps real local HTTP replies. No production account,
    // Browser repository or upstream Ainuoke request is used by this suite.
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.createMode='ready';window.receiptMode='ready';window.contextMode='ready';window.creationWaiters=[];window.contextWaiters=[];
      const sourceQuoteFetch=fetch;
      window.fetch=async(...args)=>{
        const url=new URL(String(args[0]),location.href),method=args[1]?.method??'GET';
        if(url.pathname.includes('/creation-receipts/')){
          if(receiptMode==='pending')return new Response(JSON.stringify({state:'pending',retryable:false}));
          if(receiptMode==='once401'){receiptMode='ready';return new Response(JSON.stringify({error:{code:'synthetic_current_expired'}}),{status:401});}
        }
        if(url.pathname.includes('/creation-order-context/')){
          const mode=contextMode;contextMode='ready';const response=await sourceQuoteFetch(...args);
          if(mode==='delay401')return new Promise(done=>contextWaiters.push(()=>done(new Response(JSON.stringify({error:{code:'synthetic_old_expired'}}),{status:401}))));
          return response;
        }
        if(url.pathname.endsWith('/creation-defaults')&&method==='POST'){
          const mode=createMode;createMode='ready';const response=await sourceQuoteFetch(...args);
          if(mode==='delay200'||mode==='delay401'){
            const body=await response.json();return new Promise(done=>creationWaiters.push(()=>done(new Response(JSON.stringify(mode==='delay401'?{error:{code:'synthetic_old_expired'}}:body),{status:mode==='delay401'?401:response.status}))));
          }
          return response;
        }
        return sourceQuoteFetch(...args);
      };` });
    const order = '/order-center/server-detail?id=' + x.orderId, fromOrder = '/quote-center/new?sourceOrderId=' + x.orderId;
    const count = async () => (await x.pool.query('SELECT count(*)::int n FROM quote_center_quotes')).rows[0].n;
    const posts = () => requests.filter(r => r.method === 'POST' && r.path === '/api/v1/quotes/creation-defaults').length;
    const frozen = async () => (await x.pool.query("SELECT row_to_json(t) row FROM sales_orders t ORDER BY id")).rows;
    const originalOrders = await frozen();
    await loginCookie(x.users[0]);
    await t.test('existing source entry opens readonly context; route mount, refresh and return make no drafts at six widths', async () => {
      const n = await count(), p = posts();
      for (const [width, deviceScaleFactor] of [[1920, 1], [1536, 1.25], [1440, 1], [1280, 1], [900, 1], [390, 1]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor, mobile: width === 390 });
        await navigate(order); await has('维护来源'); await click('维护来源'); await has('搜索报价');
        await click('创建报价'); await has('创建经销报价草稿'); await has('经销报价（合同订单）');
        const geometry = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,button:[...document.querySelectorAll('button')].find(n=>n.textContent==='创建经销报价草稿').getBoundingClientRect().toJSON()})");
        assert.ok(geometry.scroll <= geometry.width + 1); assert.ok(geometry.button.width < 360);
        metrics.push({ width, deviceScaleFactor, ...geometry }); await shot('context-' + width);
        await navigate(fromOrder); await has('创建经销报价草稿'); await click('返回订单'); await has('维护来源');
      }
      assert.equal(await count(), n); assert.equal(posts(), p);
    });
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await t.test('proven source rejection has a terminal receipt and can return or re-read after refresh', async () => {
      await navigate(fromOrder); await has('创建经销报价草稿');
      const n = await count(), p = posts();
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=quantity+1 WHERE sales_order_id=$1', [x.orderId]);
      await click('创建经销报价草稿'); await has('创建被拒绝');
      const recovery = await evaluate('location.pathname+location.search'); assert.ok(recovery.includes('sourceOrderId=' + x.orderId));
      await navigate(recovery); await has('创建被拒绝'); await click('返回订单'); await has('维护来源');
      assert.equal(posts(), p + 1); assert.equal(await count(), n);
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=100 WHERE sales_order_id=$1', [x.orderId]);
    });
    let createdId;
    await t.test('explicit double click creates one numbered draft in original Editor and never adopts it', async () => {
      await navigate(fromOrder); await has('创建经销报价草稿'); const n = await count(), p = posts();
      await evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent==='创建经销报价草稿');n.click();n.click()})()");
      await has('草稿已创建并保留'); await has('创建时参考');
      createdId = await evaluate("new URLSearchParams(location.search).get('id')");
      assert.ok(createdId); assert.equal(await count(), n + 1); assert.equal(posts(), p + 1);
      await shot('created-editor-1440'); await click('返回订单维护来源'); await has('维护来源');
      assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_commercial_heads WHERE sales_order_id=$1', [x.orderId])).rows[0].n, 0);
    });
    await t.test('real committed draft with held response recovers from original URL by GET only', async () => {
      await navigate(fromOrder); await has('创建经销报价草稿'); const n = await count(), p = posts();
      await evaluate("createMode='delay200';receiptMode='pending'"); await click('创建经销报价草稿');
      await until(() => evaluate('creationWaiters.length===1'), 'actual committed reply held'); assert.equal(await count(), n + 1);
      const recovery = await evaluate('location.pathname+location.search'); assert.ok(recovery.includes('sourceOrderId=' + x.orderId));
      await navigate(recovery); await has('草稿已创建并保留'); assert.equal(await count(), n + 1); assert.equal(posts(), p + 1);
    });
    await t.test('old create success and401 survive real A to B to A logins without navigating or expiring the new session', async () => {
      for (const mode of ['delay200', 'delay401']) {
        await navigate(fromOrder); await has('创建经销报价草稿'); const n = await count(), p = posts();
        await evaluate(`createMode=${JSON.stringify(mode)};receiptMode='pending'`); await click('创建经销报价草稿');
        await until(() => evaluate('creationWaiters.length===1'), 'original reply held'); assert.equal(await count(), n + 1);
        await evaluate("receiptMode='once401'"); await click('核对创建结果'); await has('忘记密码？请联系系统管理员');
        await loginUI(x.users[2]); await has('草稿正在创建或结果尚未确认');
        await evaluate("receiptMode='once401'"); await click('核对创建结果'); await has('忘记密码？请联系系统管理员');
        await evaluate("receiptMode='pending'"); await loginUI(x.users[0]); await has('草稿正在创建或结果尚未确认');
        assert.equal(await evaluate('creationWaiters.length'), 1, 'the original old-owner reply survives all SPA identity transitions');
        await evaluate('creationWaiters.splice(0).forEach(done=>done())'); await wait(200);
        assert.equal(await evaluate('location.pathname'), '/quote-center/new'); assert.equal(await evaluate("Boolean(document.querySelector('input[name=username]'))"), false);
        await evaluate("receiptMode='ready'"); await click('核对创建结果'); await has('草稿已创建并保留');
        assert.equal(await count(), n + 1); assert.equal(posts(), p + 1);
      }
    });
    await t.test('late readonly context401 is discarded across A to B to A before release', async () => {
      // Client-side route keeps the deliberately held request in this document.
      await navigate(order); await has('维护来源');
      await evaluate("contextMode='delay401'"); await click('维护来源'); await has('搜索报价'); await click('创建报价');
      await until(() => evaluate('contextWaiters.length===1'), 'old readonly context held');
      for (const username of [x.users[2], x.users[0]]) {
        await click('用户菜单'); await click('退出登录'); await has('忘记密码？请联系系统管理员');
        await loginUI(username); await has('创建经销报价草稿');
      }
      assert.equal(await evaluate('contextWaiters.length'), 1);
      await evaluate('contextWaiters.splice(0).forEach(done=>done())'); await wait(200); await has('创建经销报价草稿');
      assert.equal(await evaluate("Boolean(document.querySelector('input[name=username]'))"), false);
    });
    await t.test('missing and unauthorized contexts do not fall back to default creation', async () => {
      const n = await count(), p = posts();
      await navigate('/quote-center/new?sourceOrderId=' + randomUUID()); await has('订单不存在');
      assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent==='创建经销报价草稿')"), false);
      await loginCookie(x.users[3]); await navigate(fromOrder); await has('需要创建报价及查看订单的权限');
      assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent==='创建经销报价草稿')"), false);
      assert.equal(await count(), n); assert.equal(posts(), p);
      await loginCookie(x.users[0]); await navigate('/quote-center/detail?id=' + createdId); await has('创建时参考');
    });
    assert.deepEqual(await frozen(), originalOrders); assert.equal((await x.pool.query('SELECT count(*)::int n FROM quote_creation_order_contexts')).rows[0].n, 4);
    assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_commercial_heads')).rows[0].n, 0);
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []);
  } finally {
    if (process.env.SOURCE_QUOTE_EVIDENCE === '1') { await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, 'build-and-geometry.json'), JSON.stringify({ build: info, metrics }, null, 2) + '\n'); }
    if (closeBrowser && ws?.readyState === WebSocket.OPEN) await Promise.race([closeBrowser().catch(() => {}), wait(2000)]);
    ws?.close(); if (browser && browser.exitCode === null) { browser.kill(); await wait(500); }
    await x.close(); const distance = relative(resolve(tmpdir()), resolve(temp));
    assert.ok(distance && !distance.startsWith('..') && !isAbsolute(distance) && temp.includes('zhixu-source-quote-ui-'));
    await rm(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
});
