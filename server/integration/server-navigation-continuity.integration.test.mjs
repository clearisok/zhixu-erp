// Actual production-built routes and Node API; owned synthetic PG/profile only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { waitForChromiumEndpoint, stopOwnedChromium } from './chromium-endpoint.mjs';
import { startCommercialSecurityFixture } from './commercial-security-fixture.ts';
import { bootstrapAdmin } from '../auth/bootstrap.ts';

const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label) {
  for (let i = 0; i < 200; i++) {
    try { if (await read()) return; }
    catch (error) { if (!/Execution context was destroyed|Cannot find context with specified id|Inspected target navigated or closed/.test(String(error))) throw error; }
    await wait(100);
  }
  throw Error(`${label} timed out`);
}

test('built Server navigation keeps the workspace continuous without changing authority', { timeout: 240000 }, async t => {
  const observing = process.env.NAVIGATION_OBSERVE_ONLY === '1';
  const build = JSON.parse(readFileSync('dist/client/build-info.json', 'utf8'));
  assert.equal(build.quoteAuthority, 'server'); assert.equal(build.identityMode, 'session');
  const x = await startCommercialSecurityFixture(resolve('dist/client'));
  t.after(x.close);
  const password = 'Synthetic-Navigation-Only-2026';
  await bootstrapAdmin(x.pool, { username: 'navigation.root', displayName: '合成导航管理员', password });
  await x.user('navigation.second', ['quote.view', 'commercial.sale.view']);
  const evidence = resolve(process.env.NAVIGATION_EVIDENCE_DIR ?? 'outputs/server-navigation-continuity');
  await mkdir(evidence, { recursive: true });
  const records = { observingOnly: observing, build, rsc: [], transitions: [] };
  let failureSnapshot = async () => ({});
  const phase = async (name, run) => {
    if (observing) return;
    let failure;
    await t.test(name, async () => { try { await run(); } catch (error) { failure = error; throw error; } });
    if (failure) { await writeFile(join(evidence, 'failure.json'), JSON.stringify({ name, ...(await failureSnapshot()) }, null, 2)); throw new Error('Navigation prerequisite failed: ' + name, { cause: failure }); }
  };
  for (const path of ['/quote-center.rsc', '/order-center.rsc', '/system-settings/roles.rsc']) {
    const response = await fetch(x.base + path);
    records.rsc.push({ path, status: response.status, type: response.headers.get('content-type'), cache: response.headers.get('cache-control') });
  }
  await phase('compiled RSC responses use the component MIME and cannot retain stale route trees', () => {
    for (const row of records.rsc) {
      assert.equal(row.status, 200); assert.match(row.type, /^text\/x-component(?:;|$)/);
      assert.match(row.cache, /no-store/);
    }
  });
  const temp = await mkdtemp(join(tmpdir(), 'zhixu-navigation-ui-'));
  let browser, ws, session, closeBrowser, sequence = 0, acceptNativeDeparture = false;
  const pending = new Map(), exceptions = [], documents = [];
  try {
    const profile = join(temp, 'profile');
    browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'),
      ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
      { stdio: 'ignore', windowsHide: true });
    const [port, endpoint] = await waitForChromiumEndpoint(profile, { timeoutMs: 45000 });
    ws = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, sid = session) => new Promise((done, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('browser_command_timeout:' + method)); }, 30000);
      pending.set(id, { done: value => { clearTimeout(timer); done(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      ws.send(JSON.stringify({ id, method, params, sessionId: sid }));
    });
    ws.addEventListener('message', ({ data }) => {
      const event = JSON.parse(String(data)), call = pending.get(event.id);
      if (call) { pending.delete(event.id); if (event.error) call.reject(Error(JSON.stringify(event.error))); else call.done(event.result); }
      if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text);
      if (event.method === 'Page.javascriptDialogOpening' && acceptNativeDeparture) void command('Page.handleJavaScriptDialog', { accept: true }).catch(error => exceptions.push(String(error)));
      if (event.method === 'Network.requestWillBeSent' && event.params.type === 'Document' && event.params.request.url.startsWith(x.base)) documents.push(new URL(event.params.request.url).pathname);
    });
    const target = await command('Target.createTarget', { url: 'about:blank' }, undefined);
    session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)).sessionId;
    closeBrowser = () => command('Browser.close', {}, null);
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.continuityDocument=crypto.randomUUID();
      // Exercise the public History fallback even in Chromium with Navigation API support.
      Object.defineProperty(window,'navigation',{configurable:true,value:undefined});
      window.navigationPopEvents=[];window.navigationListeners=[];
      const addListener=window.addEventListener.bind(window),removeListener=window.removeEventListener.bind(window),wrappedListeners=new Map();
      window.addEventListener=(type,fn,options)=>{
        if(type!=='popstate'&&type!=='beforeunload')return addListener(type,fn,options);
        const row={type,capture:options===true||Boolean(options?.capture),active:true,fn};window.navigationListeners.push(row);
        const wrapped=event=>{if(type==='popstate')window.navigationPopEvents.push({capture:row.capture,before:window.__zhixuWorkspaceHistory?.index,target:event.state?.__zhixuWorkspaceNavigation?.index,path:location.pathname});return fn(event);};
        wrappedListeners.set(fn,{wrapped,row});return addListener(type,wrapped,options);
      };
      window.removeEventListener=(type,fn,options)=>{const entry=wrappedListeners.get(fn);if(entry){entry.row.active=false;wrappedListeners.delete(fn);return removeListener(type,entry.wrapped,options);}return removeListener(type,fn,options);};
      window.continuityRestoreFail=new URLSearchParams(location.search).get('continuity')==='fail';
      const nativeFetch=fetch;
      const originalHistoryPush=history.pushState.bind(history);
      window.insertForeignHistory=path=>{originalHistoryPush({foreignSentinel:'preserve-me'},'',path);window.dispatchEvent(new PopStateEvent('popstate',{state:history.state}));};
      window.fetch=(...args)=>{
        const path=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.origin).pathname;
        if(path==='/api/v1/quotes/creation-defaults')window.creationPosts=(window.creationPosts??0)+1;
        if(path==='/api/v1/quotes/creation-defaults'&&window.holdCreation){return nativeFetch(...args).then(response=>new Promise((done,reject)=>{window.releaseCreation=()=>done(response);window.loseCreationReceipt=()=>reject(Error('synthetic lost response'));}));}
        if(path.startsWith('/api/v1/quotes/creation-receipts/')&&window.holdCreationReceipt)return nativeFetch(...args).then(response=>new Promise(done=>window.releaseCreationReceipt=()=>done(response)));
        if(path==='/api/v1/auth/me'){
          if(window.continuityRestoreFail)return Promise.resolve(new Response('{}',{status:503}));
          if(new URLSearchParams(location.search).get('continuity')==='hold'&&!window.identityReleased)return new Promise((done,reject)=>window.releaseIdentity=()=>{window.identityReleased=true;nativeFetch(...args).then(done,reject);});
        }
        if(window.continuityOrderFail&&path==='/api/v1/sales-orders')return Promise.resolve(new Response(JSON.stringify({error:{code:'request_failed'}}),{status:503}));
        return nativeFetch(...args);
      };
      function frame(){const p=window.continuityProbe;if(p){p.samples++;const s=document.querySelector('.qc-app-shell'),h=document.querySelector('.ops-topbar');if(!s||!h||h.getBoundingClientRect().height<1)p.missing++;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
    ` });
    const body = () => evaluate("document.body?.innerText??''");
    failureSnapshot = () => evaluate("({path:location.pathname+location.search,tracker:window.__zhixuWorkspaceHistory,historyState:history.state,confirmCalls:window.confirmCalls,pop:window.navigationPopEvents,listeners:window.navigationListeners.filter(r=>r.active).map(r=>({type:r.type,capture:r.capture,blocks:r.type==='beforeunload'?(()=>{const e=new Event('beforeunload',{cancelable:true});r.fn(e);return e.defaultPrevented;})():null})),body:document.body?.innerText?.slice(0,5000)})");
    const has = text => until(async () => (await body()).includes(text), text);
    const click = text => evaluate(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())===${JSON.stringify(text)}&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing visible button');n.click();})()`);
    const input = (name, value) => evaluate(`(()=>{const n=document.querySelector('input[name=${name}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const field = async (selector, value) => { await until(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), 'field mount'); await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`); await wait(50); };
    const full = async path => { const old = await evaluate('window.continuityDocument'); acceptNativeDeparture = true; try { await command('Page.navigate', { url: x.base + path }); await until(() => evaluate(`Boolean(window.continuityDocument)&&window.continuityDocument!==${JSON.stringify(old ?? null)}&&document.readyState==='complete'`), 'document readiness'); } finally { acceptNativeDeparture = false; } };
    const quoteReady = async () => { await has('新建报价'); await until(() => evaluate("Boolean(document.querySelector('.qc-app-shell'))"), 'quote workspace'); };
    const screenshot = async name => { const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(join(evidence, name + '.png'), Buffer.from(shot.data, 'base64')); };
    const mark = () => evaluate("window.continuityProbe={samples:0,missing:0};window.continuityShell=document.querySelector('.qc-app-shell');window.continuitySidebar=document.querySelector('.ops-sidebar');window.continuityHeader=document.querySelector('.ops-topbar');window.markedDocument=continuityDocument;");
    const measure = async name => {
      const value = await evaluate("({sameDocument:window.markedDocument===continuityDocument,sameShell:window.continuityShell===document.querySelector('.qc-app-shell'),sameSidebar:window.continuitySidebar===document.querySelector('.ops-sidebar'),sameHeader:window.continuityHeader===document.querySelector('.ops-topbar'),samples:window.continuityProbe?.samples??0,missingFrames:window.continuityProbe?.missing??null,shellCount:document.querySelectorAll('.qc-app-shell').length,background:getComputedStyle(document.body).backgroundColor})");
      records.transitions.push({ name, value }); return value;
    };
    const stable = value => {
      assert.equal(value.sameDocument, true); assert.equal(value.sameShell, true); assert.equal(value.sameSidebar, true); assert.equal(value.sameHeader, true);
      assert.equal(value.shellCount, 1); assert.ok(value.samples > 0); assert.equal(value.missingFrames, 0);
    };
    await full('/quote-center'); await has('欢迎回来');
    await input('username', 'navigation.root'); await input('password', password); await click('登录织序'); await quoteReady();
    await phase('expanded Foundation sidebars keep readable labels across the legacy 1180px breakpoint', async () => {
      const sidebars = [];
      const sidebar = () => evaluate(`(()=>{const shell=document.querySelector('.qc-app-shell'),side=shell.querySelector('.ops-sidebar'),button=side.querySelector('nav button'),label=button.querySelector('b');return {width:innerWidth,mode:shell.dataset.responsiveMode,state:shell.dataset.sidebarState,sidebarWidth:side.getBoundingClientRect().width,labelFont:parseFloat(getComputedStyle(label).fontSize),labelWidth:label.getBoundingClientRect().width,labelDisplay:getComputedStyle(label).display,brandDisplay:getComputedStyle(side.querySelector('.ops-brand div')).display,organizationDisplay:getComputedStyle(side.querySelector('.organization div')).display,userDisplay:getComputedStyle(side.querySelector('.ops-user div')).display};})()`);
      for (const width of [1100, 1135, 1180, 1181, 1280, 1440, 1920]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await until(() => evaluate(`document.querySelector('.qc-app-shell').dataset.responsiveMode===${JSON.stringify(width >= 1440 ? 'wide' : 'primary')}`), 'expanded responsive mode');
        const value = await sidebar(); sidebars.push(value);
        assert.equal(value.state, 'expanded'); assert.equal(value.sidebarWidth, 186);
        assert.ok(value.labelFont > 0, `navigation font at ${width}px`); assert.ok(value.labelWidth > 0, `navigation label at ${width}px`);
        for (const key of ['brandDisplay', 'organizationDisplay', 'userDisplay']) assert.notEqual(value[key], 'none', `${key} at ${width}px`);
      }
      await command('Emulation.setDeviceMetricsOverride', { width: 1135, height: 900, deviceScaleFactor: 1, mobile: false });
      await until(() => evaluate("document.querySelector('.qc-app-shell').dataset.responsiveMode==='primary'"), 'primary mode');
      await click('系统设置'); await has('角色权限');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.ops-subnav')).display"), 'grid');
      assert.ok(await evaluate("[...document.querySelectorAll('.ops-subnav button')].every(n=>parseFloat(getComputedStyle(n).fontSize)>0&&n.getBoundingClientRect().width>0)"));
      await screenshot('after-expanded-sidebar-1135'); await click('系统设置');
      await click('收起侧边栏'); await until(() => evaluate("document.querySelector('.qc-app-shell').dataset.sidebarState==='collapsed'"), 'collapsed sidebar');
      let value = await sidebar(); sidebars.push(value); assert.equal(value.sidebarWidth, 78); assert.equal(value.labelDisplay, 'none');
      await click('展开侧边栏'); await until(() => evaluate("document.querySelector('.qc-app-shell').dataset.sidebarState==='expanded'"), 'reexpanded sidebar');
      value = await sidebar(); sidebars.push(value); assert.equal(value.sidebarWidth, 186); assert.ok(value.labelFont > 0); assert.ok(value.labelWidth > 0);
      await command('Emulation.setDeviceMetricsOverride', { width: 1099, height: 900, deviceScaleFactor: 1, mobile: false });
      await until(() => evaluate("document.querySelector('.qc-app-shell').dataset.responsiveMode==='compact'"), 'compact boundary');
      value = await sidebar(); sidebars.push(value); assert.equal(value.sidebarWidth, 78); assert.equal(value.labelDisplay, 'none');
      await command('Emulation.setDeviceMetricsOverride', { width: 1135, height: 900, deviceScaleFactor: 1, mobile: false });
      await until(() => evaluate("document.querySelector('.qc-app-shell').dataset.responsiveMode==='primary'"), 'return from compact boundary');
      value = await sidebar(); sidebars.push(value); assert.equal(value.sidebarWidth, 186); assert.ok(value.labelFont > 0); assert.ok(value.labelWidth > 0);
      records.sidebars = sidebars;
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await until(() => evaluate("document.querySelector('.qc-app-shell').dataset.responsiveMode==='wide'"), 'restore navigation test viewport');
    });
    await mark(); const documentStart = documents.length;
    await click('订单中心'); await until(() => evaluate("location.pathname==='/order-center'"), 'order navigation'); await has('导入加工订单'); await wait(100);
    const first = await measure('quote-to-order'); first.documentRequests = documents.slice(documentStart);
    await screenshot(observing ? 'before-order' : 'after-order');
    await phase('ordinary route transition retains the same Shell, header and sidebar without a Document reload', () => { stable(first); assert.deepEqual(first.documentRequests, []); });
    if (!observing) {
      await phase('sidebar state and normal settings/history transitions survive client routing', async () => {
        await click('收起侧边栏'); await mark(); await click('报价中心'); await quoteReady();
        assert.equal(await evaluate("document.querySelector('.qc-app-shell').dataset.sidebarState"), 'collapsed'); stable(await measure('collapsed-order-to-quote'));
        await click('展开侧边栏'); await click('系统设置'); await click('角色权限'); await has('新建角色'); stable(await measure('quote-to-roles'));
        await evaluate('history.back()'); await until(() => evaluate("location.pathname==='/quote-center'"), 'history back'); await quoteReady(); stable(await measure('history-back'));
        await evaluate('history.forward()'); await until(() => evaluate("location.pathname==='/system-settings/roles'"), 'history forward'); await has('新建角色'); stable(await measure('history-forward'));
      });
      await phase('network latency keeps global navigation painted while route content is pending', async () => {
        await mark(); await command('Network.emulateNetworkConditions', { offline: false, latency: 500, downloadThroughput: 2000000, uploadThroughput: 2000000 });
        try { await click('订单中心'); await wait(200); stable(await measure('delayed-route-pending')); await until(() => evaluate("location.pathname==='/order-center'"), 'delayed route'); await has('导入加工订单'); stable(await measure('delayed-route-complete')); }
        finally { await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); }
      });
      await phase('page data failures stay local, expose retry and never remount navigation', async () => {
        await click('报价中心'); await quoteReady(); await mark(); await evaluate('window.continuityOrderFail=true'); await click('订单中心');
        await has('重试'); stable(await measure('order-data-error')); await screenshot('after-local-error');
        await evaluate('window.continuityOrderFail=false'); await click('重试'); await has('导入加工订单'); stable(await measure('order-data-retry'));
      });
      await phase('early History indexing survives real RSC commits with Navigation API disabled', async () => {
        assert.equal(await evaluate('typeof window.navigation'), 'undefined');
        assert.equal(await evaluate("history.state.__zhixuWorkspaceNavigation.epoch===window.__zhixuWorkspaceHistory.epoch"), true);
        assert.equal(await evaluate("history.state.__zhixuWorkspaceNavigation.index===window.__zhixuWorkspaceHistory.index"), true);
        assert.equal(await evaluate("document.querySelectorAll('#zhixu-workspace-history').length"), 1);
      });
      await phase('dirty Back/Forward and multi-step traversal preserve input, location and the Forward stack on cancel', async () => {
        await click('报价中心'); await quoteReady(); await click('系统设置'); await click('角色权限'); await has('新建角色');
        await click('订单中心'); await has('导入加工订单'); await evaluate('history.back()'); await until(() => evaluate("location.pathname==='/system-settings/roles'"), 'prime forward stack'); await has('新建角色');
        await click('新建角色'); await field('.qc-permission-account-fields input', '尚未保存的角色'); await mark();
        const length = await evaluate('history.length');
        await evaluate('window.confirmCalls=0;window.confirmAllows=false;window.confirm=()=>{window.confirmCalls++;return window.confirmAllows;};history.go(-2)');
        await until(() => evaluate("window.confirmCalls===1&&location.pathname==='/system-settings/roles'"), 'cancel multi-step back');
        assert.equal(await evaluate("document.querySelector('.qc-permission-account-fields input').value"), '尚未保存的角色');
        assert.equal(await evaluate('history.length'), length);
        await evaluate('history.forward()'); await until(() => evaluate("window.confirmCalls===2&&location.pathname==='/system-settings/roles'"), 'cancel forward');
        assert.equal(await evaluate("document.querySelector('.qc-permission-account-fields input').value"), '尚未保存的角色');
        await evaluate('window.confirmAllows=true;history.forward()'); await until(() => evaluate("location.pathname==='/order-center'"), 'accept original forward'); await has('导入加工订单');
        assert.equal(await evaluate('history.length'), length); stable(await measure('dirty-history-restored-and-replayed'));
        await evaluate('history.back()'); await until(() => evaluate("location.pathname==='/system-settings/roles'"), 'return to role entry'); await has('新建角色');
        assert.equal(await evaluate("Boolean(document.querySelector('.qc-permission-account-fields input'))"), false);
      });
      await phase('in-flight creation blocks menu, internal links and Back; lost receipt recovers with the same request and one POST', async () => {
        await click('报价中心'); await quoteReady(); await evaluate('window.holdCreation=true;window.holdCreationReceipt=true');
        await click('＋ 新建报价'); await until(() => evaluate('Boolean(window.releaseCreation)'), 'held creation response');
        const requestId = await evaluate("new URLSearchParams(location.search).get('creationRequestId')"); assert.match(requestId, /^[0-9a-f-]{36}$/);
        assert.equal(await evaluate('history.state.__zhixuWorkspaceNavigation.index===window.__zhixuWorkspaceHistory.index'), true);
        await click('订单中心'); await has('请先完成当前操作'); assert.equal(await evaluate("new URLSearchParams(location.search).get('creationRequestId')"), requestId); await click('继续处理');
        await evaluate("const a=document.createElement('a');a.href='/order-center';a.id='guard-test-link';a.textContent='test';document.body.append(a);a.click();a.remove();"); await has('请先完成当前操作'); await click('继续处理');
        await evaluate('history.back()'); await has('请先完成当前操作'); assert.equal(await evaluate("new URLSearchParams(location.search).get('creationRequestId')"), requestId); await click('继续处理');
        await evaluate('loseCreationReceipt()'); await until(() => evaluate('Boolean(window.releaseCreationReceipt)'), 'held read-only recovery'); await has('核对创建结果');
        assert.equal(await evaluate("new URLSearchParams(location.search).get('creationRequestId')"), requestId);
        assert.equal(await evaluate('window.creationPosts'), 1);
        await evaluate('window.holdCreationReceipt=false;releaseCreationReceipt()'); await until(() => evaluate("location.pathname==='/quote-center/detail'"), 'confirmed receipt destination'); await has('款式报价明细');
        assert.equal(await evaluate('window.creationPosts'), 1);
        await click('订单中心'); await has('导入加工订单');
      });
      await phase('creation on the new page hands the same request to its mounted Recovery and automatically opens the saved draft', async () => {
        await full('/quote-center/new'); await has('使用 Server 报价设置的默认类型');
        await until(()=>evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='＋ 新建报价'&&!n.disabled)"),'hydrated new-page create'); await mark();
        await click('＋ 新建报价'); await until(() => evaluate("location.pathname==='/quote-center/detail'"), 'new-page committed creation'); await has('草稿已创建并保留');
        assert.equal(await evaluate('window.creationPosts'),1); await wait(100); stable(await measure('new-page-creation-handoff'));
        await click('订单中心'); await has('导入加工订单');
      });
      await phase('native hash history preserves the active draft and records distinct fragment entries', async () => {
        await click('系统设置'); await click('角色权限'); await has('新建角色'); await click('新建角色'); await field('.qc-permission-account-fields input', '片段导航草稿');
        await evaluate("window.confirm=()=>false;location.hash='navigation-fragment'"); await wait(200);
        assert.equal(await evaluate("document.querySelector('.qc-permission-account-fields input')?.value"), '片段导航草稿');
        const fragmentIndex = await evaluate('history.state.__zhixuWorkspaceNavigation.index');
        await evaluate('history.back()'); await until(() => evaluate("location.hash===''"), 'fragment back'); await wait(100);
        assert.equal(await evaluate("document.querySelector('.qc-permission-account-fields input')?.value"), '片段导航草稿');
        assert.notEqual(await evaluate('history.state.__zhixuWorkspaceNavigation.index'), fragmentIndex);
        await evaluate('history.forward()'); await until(() => evaluate("location.hash==='#navigation-fragment'"), 'fragment forward'); await wait(100);
        assert.equal(await evaluate("document.querySelector('.qc-permission-account-fields input')?.value"), '片段导航草稿');
        await click('取消'); await click('报价中心'); await quoteReady();
      });
    }
    await full('/quote-center?continuity=hold'); await until(() => evaluate('Boolean(window.releaseIdentity)'), 'held identity request');
    const held = await evaluate("({shells:document.querySelectorAll('.qc-app-shell').length,headerVisible:Boolean(document.querySelector('.ops-topbar')?.getBoundingClientRect().height),body:getComputedStyle(document.body).backgroundColor})");
    records.heldIdentity = held; await screenshot(observing ? 'before-identity-pending' : 'after-identity-pending');
    await phase('identity restoration uses a local loading state inside the existing workspace', () => { assert.equal(held.shells, 1); assert.equal(held.headerVisible, true); assert.equal(held.body, 'rgb(243, 242, 237)'); });
    await evaluate('releaseIdentity()'); await quoteReady();
    if (!observing) {
      await phase('identity failure exposes safe retry inside the Shell and recovers the actual session', async () => {
        await full('/quote-center?continuity=fail'); await has('Server 身份不可用');
        assert.equal(await evaluate("document.querySelectorAll('.qc-app-shell').length"), 1);
        await evaluate('window.continuityRestoreFail=false'); await click('重试'); await quoteReady();
      });
      await phase('foreign unindexed history is quarantined without overwriting another entry or losing the current draft', async () => {
        await click('系统设置'); await click('角色权限'); await has('新建角色'); await click('新建角色'); await field('.qc-permission-account-fields input', '外部历史仍保留草稿');
        await evaluate("window.confirm=()=>false;insertForeignHistory('/order-center')"); await has('浏览器历史已无法可靠核对');
        assert.equal(await evaluate("document.querySelector('.qc-permission-account-fields input').value"), '外部历史仍保留草稿');
        assert.equal(await evaluate('history.state.foreignSentinel'), 'preserve-me'); assert.equal(await evaluate('history.state.__zhixuWorkspaceNavigation'), undefined);
        assert.equal(await evaluate('location.pathname'), '/order-center'); await click('继续处理');
        const prior = await command('Page.getNavigationHistory'), foreign = prior.entries[prior.currentIndex], oldDocument = await evaluate('window.continuityDocument'), start = documents.length;
        acceptNativeDeparture = true;
        try {
          const confirmations = await evaluate("(()=>{window.foreignConfirmCount=0;window.confirm=()=>{window.foreignConfirmCount++;return true;};[...document.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')==='报价中心').click();return window.foreignConfirmCount;})()");
          assert.equal(confirmations, 1); await until(() => evaluate(`window.continuityDocument!==${JSON.stringify(oldDocument)}&&document.readyState==='complete'`), 'explicit foreign-history recovery'); await quoteReady();
        } finally { acceptNativeDeparture = false; }
        assert.deepEqual(documents.slice(start), ['/quote-center']);
        const after = await command('Page.getNavigationHistory'); assert.equal(after.entries.find(entry => entry.id === foreign.id)?.url, foreign.url);
      });
      await phase('refresh and responsive widths keep one workspace without document overflow', async () => {
        await full('/quote-center'); await quoteReady();
        for (const width of [1920, 1280, 900, 390]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 }); await wait(200);
          assert.equal(await evaluate("document.querySelectorAll('.qc-app-shell').length"), 1);
          assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false);
        }
      });
      for(const origin of ['/quote-center','/quote-center/new'])await phase('a late creation receipt from '+origin+' cannot navigate after a different user logs in', async () => {
        await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
        if(origin.endsWith('/new')){
          await evaluate("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})"); await full('/quote-center'); await has('欢迎回来');
          await input('username','navigation.root'); await input('password',password); await click('登录织序'); await quoteReady();
        }
        await full(origin); await quoteReady(); await evaluate('window.holdCreation=true;window.holdCreationReceipt=true'); await click('＋ 新建报价'); await until(() => evaluate('Boolean(window.releaseCreation)'), 'late creation response held');
        const documentId = await evaluate('window.continuityDocument');
        await evaluate("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})");
        if(origin.endsWith('/new')){await has('核对创建结果'); await evaluate('window.holdCreationReceipt=false'); await click('核对创建结果');}
        else await field('[aria-label="搜索报价"]', 'force-session-expiry');
        await has('欢迎回来');
        assert.equal(await evaluate("document.querySelectorAll('.qc-app-shell').length"), 0);
        await evaluate("history.replaceState(history.state,'','/login?returnTo=%2Fquote-center')"); await wait(100);
        await input('username', 'navigation.second'); await input('password', 'synthetic-only'); await click('登录织序');
        await until(() => evaluate("location.pathname==='/quote-center'&&document.body.innerText.includes('navigation.second')"), 'different user workspace');
        assert.equal(await evaluate('window.continuityDocument'), documentId);
        await evaluate('releaseCreation();if(window.releaseCreationReceipt)releaseCreationReceipt()'); await wait(250);
        assert.equal(await evaluate('location.pathname'), '/quote-center'); assert.equal(await evaluate("document.body.innerText.includes('navigation.second')"), true);
        assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"), 0); assert.equal(await evaluate('window.creationPosts'), 1);
      });
      await phase('expired authentication returns to login without Browser fallback or protected workspace', async () => {
        await evaluate("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})"); await full('/quote-center'); await has('欢迎回来');
        assert.equal(await evaluate('location.pathname'), '/login'); assert.equal(await evaluate("document.querySelectorAll('.qc-app-shell').length"), 0);
        assert.equal(await evaluate("Object.keys(localStorage).some(k=>k.includes('zhixu.erp.local.'))"), false);
      });
      assert.deepEqual(exceptions, []); assert.deepEqual(x.errors, []);
    }
    records.documents = documents;
    await writeFile(join(evidence, observing ? 'before-observations.json' : 'after-observations.json'), JSON.stringify(records, null, 2) + '\n');
    if (observing) t.diagnostic('OBSERVATION ONLY: no navigation acceptance assertions were executed; see before-observations.json.');
  } finally {
    try { await stopOwnedChromium(browser, { gracefulClose: closeBrowser }); }
    finally { ws?.close(); for (const call of pending.values()) call.reject(Error('owned_browser_closed')); pending.clear(); }
    const distance = relative(resolve(tmpdir()), resolve(temp)); assert.ok(distance && !distance.startsWith('..') && !isAbsolute(distance) && temp.includes('zhixu-navigation-ui-'));
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
