import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { createApp } from "../app.ts";
import { runMigrations } from "../db/migration-runner.ts";
import { bootstrapAdmin } from "../auth/bootstrap.ts";
import { synchronizePermissionCatalog } from "../auth/permissions.ts";
import { MemoryAttachmentStorage } from "../attachments/storage.ts";
import { startDisposablePostgres } from "./postgres-container.ts";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(read, label) {
  for (let i = 0; i < 150; i++) { if (await read()) return; await sleep(100); }
  assert.fail(`${label} timed out`);
}

// Actual exported formal routes + actual Node API, not a synthetic component page.
// Generated PostgreSQL/tmpfs, memory object storage, fresh owned Chrome profile only.
test("Fresh Server Quote: actual Chromium list/new/detail/masters and save/attachment/conflict closure", { timeout: 240_000 }, async (t) => {
  assert.equal(JSON.parse(readFileSync(resolve("dist/client/build-info.json"), "utf8")).quoteAuthority, "server", "Build with explicit Quote/master Server authority first");
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  assert.ok(existsSync(chrome));
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("formal_quote_ui") });
  const temp = await mkdtemp(join(tmpdir(), "zhixu-formal-quote-ui-"));
  const origins = [];
  const storage = new MemoryAttachmentStorage();
  const server = createServer(createApp({ pool, allowedOrigins: origins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, staticDirectory: resolve("dist/client"), attachmentStorage: storage }));
  let browser, ws;
  try {
    await runMigrations(pool, resolve("database/migrations"));
    await synchronizePermissionCatalog(pool);
    await bootstrapAdmin(pool, { username: "synthetic-ui-admin", displayName: "Synthetic UI administrator", password: "disposable-ui-password" });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const port = server.address().port;
    assert.ok(![3000, 3001, 3002].includes(port));
    const origin = `http://127.0.0.1:${port}`;
    origins.push(origin);
    const profile = join(temp, "profile");
    browser = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
    const portFile = join(profile, "DevToolsActivePort");
    await until(() => existsSync(portFile), "Chromium startup");
    const [debugPort, debugPath] = readFileSync(portFile, "utf8").trim().split(/\r?\n/u);
    ws = new WebSocket(`ws://127.0.0.1:${debugPort}${debugPath}`);
    await new Promise((done, reject) => { ws.addEventListener("open", done, { once: true }); ws.addEventListener("error", reject, { once: true }); });
    let commandId = 0;
    const pending = new Map();
    let sessionId;
    let acceptDialogs = true;
    const requests = [];
    const completedRequests = new Set();
    let failureStatus = 0;
    ws.addEventListener("message", ({ data }) => {
      const reply = JSON.parse(String(data));
      const entry = pending.get(reply.id);
      if (entry) { pending.delete(reply.id); if (reply.error) entry.reject(new Error(JSON.stringify(reply.error))); else entry.done(reply.result); }
      if (reply.method === "Network.requestWillBeSent" && reply.params.request.url.includes("/api/")) requests.push({ requestId: reply.params.requestId, method: reply.params.request.method, path: new URL(reply.params.request.url).pathname, ...(reply.params.request.method === "PUT" && reply.params.request.url.includes("/api/v1/quotes/") ? { body: reply.params.request.postData } : {}) });
      if (reply.method === "Network.loadingFinished") completedRequests.add(reply.params.requestId);
      if (reply.method === "Page.javascriptDialogOpening") void command("Page.handleJavaScriptDialog", { accept: acceptDialogs }, sessionId);
      if (reply.method === "Fetch.requestPaused") void command(failureStatus ? "Fetch.fulfillRequest" : "Fetch.failRequest", failureStatus ? { requestId: reply.params.requestId, responseCode: failureStatus, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ error: { code: "quote_conflict", message: "Synthetic version conflict" } })).toString("base64") } : { requestId: reply.params.requestId, errorReason: "ConnectionFailed" }, sessionId);
    });
    const command = (method, params = {}, session) => new Promise((done, reject) => {
      pending.set(++commandId, { done, reject }); ws.send(JSON.stringify({ id: commandId, method, params, sessionId: session }));
    });
    const target = await command("Target.createTarget", { url: "about:blank" });
    sessionId = (await command("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
    const evaluate = async (expression) => {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
      assert.equal(result.exceptionDetails, undefined, `Browser evaluation failed: ${result.exceptionDetails?.text}`);
      return result.result.value;
    };
    await command("Page.enable", {}, sessionId);
    await command("Network.enable", { maxPostDataSize: 1_000_000 }, sessionId);
    await command("Page.addScriptToEvaluateOnNewDocument", { source: `
      const originalGet = Storage.prototype.getItem, originalSet = Storage.prototype.setItem;
      if(!originalGet.call(localStorage,'zhixu.erp.local.quotes')) originalSet.call(localStorage,'zhixu.erp.local.quotes','synthetic-old-business-sentinel');
      window.businessAccess=[];
      window.unhandledRejections=[];
      window.addEventListener('unhandledrejection', event => window.unhandledRejections.push(String(event.reason)));
      const business=k=>k.startsWith('zhixu.')&&!/preference|sidebar/.test(k);
      Storage.prototype.getItem=function(k){if(business(k))businessAccess.push('read:'+k);return originalGet.call(this,k)};
      Storage.prototype.setItem=function(k,v){if(business(k))businessAccess.push('write:'+k);return originalSet.call(this,k,v)};
      const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{businessAccess.push('indexedDB:'+args[0]);return open(...args)};
      window.oldSentinel=()=>originalGet.call(localStorage,'zhixu.erp.local.quotes');
    ` }, sessionId);
    const text = () => evaluate("document.body.innerText");
    const hasText = (value) => until(async () => (await text()).includes(value), value);
    const navigate = async (path) => { await command("Page.navigate", { url: origin + path }, sessionId); await until(async () => await evaluate(`location.pathname===${JSON.stringify(path.split("?")[0])} && document.readyState==='complete'`), path); };
    const input = async (selector, value) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw new Error('input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const labelInput = async (label, value) => evaluate(`(()=>{const root=[...document.querySelectorAll('[role="dialog"]')].filter(n=>n.getClientRects().length).at(-1)||document;const node=[...root.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent?.startsWith(${JSON.stringify(label)}))?.querySelector('input,textarea');if(!node)throw new Error('label input missing: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const click = async (label) => evaluate(`(()=>{const node=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(label)}&&!n.disabled&&n.getClientRects().length);if(!node)throw new Error('button missing: '+${JSON.stringify(label)});node.click();})()`);
    const selectType = async (type) => evaluate(`(() => { const select=[...document.querySelectorAll('label.qc-form-item')].find(n=>n.getClientRects().length && n.querySelector('span')?.textContent?.startsWith('报价类型'))?.querySelector('select');if(!select)throw new Error('Formal new Quote type selector missing');select.value=${JSON.stringify(type)};select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const action = async (label) => {
      if (!await evaluate(`[...document.querySelectorAll('button')].some(n=>n.textContent.trim()===${JSON.stringify(label)} && n.getClientRects().length)`)) {
        await evaluate("[...document.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')==='更多报价操作').click()");
      }
      await click(label);
    };
    const isolated = async () => {
      assert.deepEqual(await evaluate("businessAccess"), [], "No Browser business repository access");
      assert.equal(await evaluate("oldSentinel()"), "synthetic-old-business-sentinel");
    };
    const quoteCount = async () => (await pool.query("SELECT count(*)::int n FROM quote_center_quotes")).rows[0].n;
    const masterCount = async () => (await pool.query("SELECT count(*)::int n FROM quote_master_brands")).rows[0].n;

    await t.test("401/common identity, empty formal list/new/master pages; old Browser sentinel untouched", async () => {
      assert.equal((await fetch(`${origin}/api/v1/quotes`)).status, 401);
      await navigate("/quote-center"); await hasText("登录织序 Server");
      await input("input[name=username]", "synthetic-ui-admin");
      await input("input[name=password]", "disposable-ui-password");
      await click("登录 Server"); await hasText("暂无 Server 报价"); await isolated();
      await navigate("/quote-center/new"); await hasText("准备创建空白 Server 报价"); await isolated();
      await navigate("/basic-settings/brands"); await hasText("品牌"); await sleep(500); await isolated();
      assert.equal(await quoteCount(), 0); assert.equal(await masterCount(), 0);
      await navigate("/order-center"); await hasText("当前新系统只启用报价"); await isolated();
    });

    let quoteId, code;
    const record = async () => evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(quoteId)}).then(r=>r.json()).then(body=>body.quote)`);
    const save = async (version) => { await click("保存草稿"); await until(async () => (await record()).version === version, `saved v${version}`); await hasText(`Server 报价 · v${version}`); };
    await t.test("explicit create only once, real QuoteEditor edit/save/refresh/list, null and zero preserved", async () => {
      await navigate("/quote-center/new"); await hasText("创建报价");
      await selectType("distribution");
      await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='创建报价');b.click();b.click();})()");
      await until(async () => await evaluate("location.pathname==='/quote-center/detail'"), "created detail route");
      await hasText("Server 报价 · v1");
      await hasText("经销报价");
      quoteId = await evaluate("new URLSearchParams(location.search).get('id')");
      const initial = await record(); code = initial.quote.quoteCode;
      assert.equal(await quoteCount(), 1);
      await labelInput("报价款号", "SYNTHETIC-UI-STYLE");
      await labelInput("款式名称", "Synthetic formal editor");
      await labelInput("原始工价", "0");
      await click("＋ 增加面料");
      await input('#quote-section-fabrics input[aria-label$="-名称"]', "Synthetic fabric");
      await input('#quote-section-fabrics input[aria-label$="-段长"]', "125.25");
      await input('#quote-section-fabrics input[aria-label$="-单价"]', "12.75");
      await click("＋ 增加辅料");
      await input('#quote-section-trims input[aria-label$="-名称"]', "Synthetic trim");
      await input('#quote-section-trims input[aria-label$="-用量"]', "0");
      await click("＋ 增加行");
      await input('#quote-section-other-costs input[aria-label$="-名称"]', "Synthetic other cost");
      await input('#quote-section-other-costs input[aria-label$="-单价"]', "0");
      await click("报价设置"); await hasText("请选择制作预设");
      assert.equal(await evaluate("document.querySelector('.qc-pricing-settings-modal select').options.length"), 1);
      await click("完成");
      await save(2);
      const saved = await record();
      assert.equal(saved.quote.revisions[0].baseInfo.quoteStyleNo, "SYNTHETIC-UI-STYLE");
      assert.equal(saved.quote.revisions[0].priceVersions[0].labor.value, "0");
      assert.equal(saved.quote.revisions[0].priceVersions[0].pricingParameters.usdCnyRate, null);
      assert.equal(saved.quote.revisions[0].priceVersions[0].fabrics[0].segmentLengthCm, "125.25");
      assert.equal(saved.quote.revisions[0].priceVersions[0].fabrics[0].unitPrice, "12.75");
      assert.equal(saved.quote.revisions[0].priceVersions[0].trims[0].usage, "0");
      assert.equal(saved.quote.revisions[0].priceVersions[0].otherCosts[0].unitPrice, "0");
      await isolated();
      await navigate(`/quote-center/detail?id=${quoteId}`); await hasText("SYNTHETIC-UI-STYLE"); await isolated();
      await navigate("/quote-center"); await hasText(code); await hasText("SYNTHETIC-UI-STYLE"); await isolated();
      assert.equal(requests.filter(r => r.path === "/api/v1/quotes" && r.method === "POST").length, 1);
    });

    await t.test("actual attachment upload advances version; dirty base fields survive and next save uses latest version", async () => {
      await navigate(`/quote-center/detail?id=${quoteId}`); await hasText("Server 报价 · v2");
      await labelInput("款式名称", "Dirty draft survives attachment");
      const png = join(temp, "synthetic.png");
      const expectedBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=", "base64");
      await writeFile(png, expectedBytes);
      const document = await command("DOM.getDocument", {}, sessionId);
      const fileInput = await command("DOM.querySelector", { nodeId: document.root.nodeId, selector: '#quote-section-attachments input[type="file"]' }, sessionId);
      assert.ok(fileInput.nodeId);
      await command("DOM.setFileInputFiles", { nodeId: fileInput.nodeId, files: [png] }, sessionId);
      await until(async () => (await record()).version === 3, "attachment v3");
      await hasText("Server 报价 · v3");
      assert.equal((await record()).quote.revisions[0].baseInfo.styleName, "Synthetic formal editor");
      await save(4);
      const saved = await record();
      assert.equal(saved.quote.revisions[0].baseInfo.styleName, "Dirty draft survives attachment");
      assert.equal(saved.quote.revisions[0].imageAttachmentIds.length, 1);
      assert.equal(storage.objects.size, 1); await isolated();
      const requestStart = requests.length;
      await navigate(`/quote-center/detail?id=${quoteId}`); await hasText("Server 报价 · v4"); await hasText("synthetic.png"); await isolated();
      const assetDownload = () => requests.slice(requestStart).find(r => r.method === "GET" && r.path.includes("/attachments/") && r.path.endsWith("/download") && completedRequests.has(r.requestId));
      await until(async () => Boolean(assetDownload()), "Server preview/blob loader download complete");
      // Inspect the actual page loader's Blob; CDP may decode binary response bodies as text.
      // This does not issue a second Server download request.
      await until(async () => evaluate(`Boolean(document.querySelector('#quote-section-attachments img[src^="blob:"]'))`), "attachment Blob rendered");
      const downloadedBytes = await evaluate(`(async () => {
        const image = document.querySelector('#quote-section-attachments img[src^="blob:"]');
        const response = await fetch(image.src);
        return Array.from(new Uint8Array(await response.arrayBuffer()));
      })()`);
      const actualBytes = Buffer.from(downloadedBytes);
      assert.deepEqual(actualBytes, expectedBytes, "Downloaded attachment bytes match the uploaded synthetic file");
      assert.equal(createHash("sha256").update(actualBytes).digest("hex"), createHash("sha256").update(expectedBytes).digest("hex"));
      t.diagnostic("Actual page attachment download: byte equality + SHA-256 PASS");
    });

    await t.test("unsafe numeric draft rejected; 409 retains unsaved draft without retry/fallback", async () => {
      await labelInput("原始工价", "9007199254740993"); await hasText("数值无法安全精确读写");
      await click("保存草稿"); await sleep(200); assert.equal((await record()).version, 4);
      await labelInput("原始工价", "0");
      await labelInput("款式名称", "UNSAVED-CONFLICT-DRAFT");
      const concurrent = await record(); concurrent.quote.revisions[0].baseInfo.note = "Synthetic concurrent write";
      const concurrentStatus = await evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(quoteId)},{method:'PUT',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:${JSON.stringify(JSON.stringify({ quote: concurrent.quote, expectedVersion: concurrent.version }))}}).then(r=>r.status)`);
      assert.equal(concurrentStatus, 200);
      const before = requests.filter(r => r.method === "PUT").length;
      await click("保存草稿"); await hasText("409");
      assert.ok(await evaluate("[...document.querySelectorAll('input')].some(n=>n.value==='UNSAVED-CONFLICT-DRAFT')"));
      await sleep(200); assert.equal(requests.filter(r => r.method === "PUT").length, before + 1);
      assert.equal((await record()).version, 5);
      assert.equal(await quoteCount(), 1, "Failed subsequent distribution save never creates another Quote");
      await isolated();
    });

    await t.test("404, 403 and network failure are explicit on actual routes; no silent Browser fallback", async () => {
      await navigate("/quote-center/detail?id=synthetic-missing-id"); await hasText("404"); await isolated();
      await pool.query("DELETE FROM app_role_permissions WHERE permission_key='quote.view'");
      await navigate("/quote-center"); await hasText("403"); await isolated();
      await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-server-admin','quote.view')");
      await command("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/quotes*", requestStage: "Request" }] }, sessionId);
      await navigate("/quote-center"); await hasText("Server 读取失败"); await isolated();
      await command("Fetch.disable", {}, sessionId);
      assert.equal(await quoteCount(), 1); assert.equal(await masterCount(), 0);
      assert.equal((await pool.query("SELECT count(*)::int n FROM sales_orders")).rows[0].n, 0);
    });
    await t.test("real UI Quick Create uses Server masters and reloads selectors without resnapshot on reopen", async () => {
      await navigate(`/quote-center/detail?id=${quoteId}`); await hasText("Server 报价 · v5");
      await evaluate("[...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent==='品牌 *').querySelector('button').click()");
      await input(".qc-select-search input", "Synthetic quick brand");
      await click("＋ 新建品牌「Synthetic quick brand」");
      await hasText("最快只需填写品牌名称"); await click("保存并使用");
      await until(async () => await masterCount() === 1, "explicit Server brand");
      await hasText("更换默认资料来源");
      await click("保留当前报价资料");
      await hasText("Synthetic quick brand");
      await save(6); await isolated();
      const saved = await record();
      assert.equal(saved.quote.revisions[0].baseInfo.brandName, "Synthetic quick brand");
      assert.equal(saved.quote.revisions[0].priceVersions[0].pricingParameters.markupRate, null);
      await navigate(`/quote-center/detail?id=${quoteId}`); await hasText("Server 报价 · v6");
      assert.deepEqual(await record(), saved); await isolated();
    });
    await t.test("bounded global list search/filter/pagination, accurate total and no per-row aggregate GET", async () => {
      // Explicit synthetic user creates, not automatic seed/bootstrap/import.
      await evaluate("(async()=>{for(let n=0;n<26;n++){const r=await fetch('/api/v1/quotes',{method:'POST',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:'{}'});if(r.status!==201)throw new Error('synthetic create failed')}})()");
      await navigate("/quote-center"); await hasText("本页 25 / 总计 27");
      const before = requests.length;
      await click("下一页"); await hasText("本页 2 / 总计 27");
      await input('input[aria-label="搜索报价"]', "SYNTHETIC-UI-STYLE");
      await hasText("本页 1 / 总计 1"); await hasText(code); await isolated();
      assert.equal(requests.slice(before).filter(r => r.method === "GET" && /^\/api\/v1\/quotes\//u.test(r.path)).length, 0);
      const invalid = await evaluate("fetch('/api/v1/quotes?limit=101').then(r=>r.status)");
      assert.equal(invalid, 400);
      const literal = await evaluate("fetch('/api/v1/quotes?search=%25').then(r=>r.json())");
      assert.equal(literal.page.total, 0, "LIKE wildcard is escaped");
      assert.equal(await quoteCount(), 27);
    });
    let processingQuoteId;
    await t.test("formal new UI selects processing, saves and reloads it, list type filter finds it", async () => {
      const countBefore = await quoteCount();
      await navigate("/quote-center/new"); await hasText("创建报价");
      assert.equal(await quoteCount(), countBefore, "Opening new never creates a Quote");
      await selectType("processing");
      await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='创建报价');b.click();b.click();})()");
      await until(async () => await evaluate("location.pathname==='/quote-center/detail'"), "processing detail");
      await hasText("加工报价"); await hasText("Server 报价 · v2");
      const processingId = await evaluate("new URLSearchParams(location.search).get('id')");
      processingQuoteId = processingId;
      const processingRecord = () => evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(processingId)}).then(r=>r.json()).then(r=>r.quote)`);
      assert.equal((await processingRecord()).quote.revisions[0].baseInfo.quoteType, "processing");
      await labelInput("款式名称", "Synthetic processing Quote"); await click("保存草稿");
      await hasText("Server 报价 · v3");
      await navigate(`/quote-center/detail?id=${processingId}`); await hasText("Server 报价 · v3"); await hasText("加工报价");
      assert.equal((await processingRecord()).quote.revisions[0].baseInfo.quoteType, "processing");
      assert.equal(await quoteCount(), countBefore + 1);
      const saveStart = requests.length;
      failureStatus = 409;
      await command("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/quotes/*", requestStage: "Request" }] }, sessionId);
      try {
        await labelInput("款式名称", "UNSAVED-PROCESSING-CONFLICT"); await click("保存草稿"); await hasText("409");
        assert.ok(await evaluate("[...document.querySelectorAll('input')].some(n=>n.value==='UNSAVED-PROCESSING-CONFLICT')"));
        await sleep(200);
        assert.equal(requests.slice(saveStart).filter(r=>r.method==='POST').length, 0);
        assert.equal(requests.slice(saveStart).filter(r=>r.method==='PUT').length, 1);
      } finally { await command("Fetch.disable", {}, sessionId); failureStatus = 0; }
      assert.equal((await processingRecord()).version, 3);
      assert.equal(await quoteCount(), countBefore + 1);
      await navigate("/quote-center"); await hasText("Synthetic processing Quote");
      await selectType("processing");
      await hasText("本页 1 / 总计 1"); await hasText("加工 / draft"); await isolated();
    });
    for (const failure of ["conflict", "network"]) await t.test(`processing initialization ${failure} retains created ID and never repeats POST`, async () => {
      const countBefore = await quoteCount();
      await navigate("/quote-center/new"); await hasText("创建报价");
      assert.equal(await quoteCount(), countBefore);
      await selectType("processing");
      const requestStart = requests.length;
      failureStatus = failure === "conflict" ? 409 : 0;
      await command("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/quotes/*", requestStage: "Request" }] }, sessionId);
      try {
        await click("创建报价"); await hasText("草稿已创建，但所选类型尚未确认保存");
        if (failure === "conflict") await hasText("409");
        assert.equal(await evaluate("location.pathname"), "/quote-center/new");
        assert.ok(await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='创建报价').disabled"));
        await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='创建报价').click()");
        await sleep(200);
        assert.equal(requests.slice(requestStart).filter(r=>r.method==='POST' && r.path==='/api/v1/quotes').length, 1);
        assert.equal(requests.slice(requestStart).filter(r=>r.method==='PUT').length, 1);
      } finally { await command("Fetch.disable", {}, sessionId); failureStatus = 0; }
      const draftId = await evaluate("new URL(document.querySelector('a[href^=\"/quote-center/detail?id=\"]').href).searchParams.get('id')");
      assert.ok(draftId);
      const draft = await evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(draftId)}).then(r=>r.json()).then(r=>r.quote)`);
      assert.equal(draft.version, 1); assert.equal(draft.quote.revisions[0].baseInfo.quoteType, "distribution");
      assert.equal(await quoteCount(), countBefore + 1); await isolated();
    });
    await t.test("distribution readback and formal list filter remain available", async () => {
      await navigate(`/quote-center/detail?id=${quoteId}`); await hasText("经销报价");
      assert.equal((await record()).quote.revisions[0].baseInfo.quoteType, "distribution");
      await navigate("/quote-center"); await hasText("本页"); await selectType("distribution");
      await input('input[aria-label="搜索报价"]', "SYNTHETIC-UI-STYLE");
      await hasText("本页 1 / 总计 1"); await hasText(code); await hasText("经销 / draft"); await isolated();
    });
    for (const workflowId of [quoteId, processingQuoteId]) await t.test(`actual PV/Revision workflows, saved selected history and attachment inheritance: ${workflowId === quoteId ? "distribution" : "processing"}`, async () => {
      const read = () => evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(workflowId)}).then(r=>r.json()).then(r=>r.quote)`);
      // Complete synthetic source requirements; workflow mutations themselves use actual UI only.
      await navigate(`/quote-center/detail?id=${workflowId}`); await hasText("Server 报价");
      const initial = await read(); const base = initial.quote.revisions[0];
      base.baseInfo.brandId ||= "synthetic-brand"; base.baseInfo.salespersonId = "synthetic-person"; base.baseInfo.salespersonName = "Synthetic Person";
      base.baseInfo.quoteStyleNo ||= "SYNTHETIC-WORKFLOW"; base.baseInfo.styleName ||= "Synthetic workflow";
      base.priceVersions[0].quantity = "1"; base.priceVersions[0].labor.value = "0";
      base.priceVersions[0].trims.forEach(row=>{row.usage??="0";row.unitPrice??="0";});
      await evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(workflowId)},{method:'PUT',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:${JSON.stringify(JSON.stringify({quote:initial.quote,expectedVersion:initial.version}))}}).then(r=>{if(!r.ok)throw new Error('synthetic preparation failed')})`);
      await navigate(`/quote-center/detail?id=${workflowId}`); await hasText(`Server 报价 · v${initial.version + 1}`);
      const original = await read();
      await labelInput("款式名称", "UNSAVED-CANCELLED-WORKFLOW");
      acceptDialogs = false;
      await action("创建价格版本"); await labelInput("价格版本名称", "Cancelled"); await labelInput("数量", "2"); await click("确认创建");
      await sleep(150); assert.equal((await read()).version,original.version); assert.ok(await evaluate("[...document.querySelectorAll('input')].some(n=>n.value==='UNSAVED-CANCELLED-WORKFLOW')"));
      await click("取消"); acceptDialogs = true;
      // Reopening explicitly discards this synthetic cancelled draft, not business data.
      await navigate(`/quote-center/detail?id=${workflowId}`); await hasText(`Server 报价 · v${original.version}`);
      await action("创建价格版本"); await hasText("价格版本名称");
      await labelInput("价格版本名称", "Synthetic parallel"); await labelInput("数量", "2"); await labelInput("说明", "Independent scenario");
      await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='确认创建');b.click();b.click();})()"); await until(async()=> (await read()).version===original.version+1,"PV create");
      const copied = await read(); const pv = copied.quote.revisions[0].priceVersions[1];
      assert.equal(pv.quantity,"2"); assert.equal(copied.quote.revisions[0].priceVersions[0].quantity,"1");
      assert.notEqual(pv.id,original.quote.revisions[0].priceVersions[0].id); assert.equal(pv.confirmation,null);
      if(pv.fabrics.length) assert.notEqual(pv.fabrics[0].id,original.quote.revisions[0].priceVersions[0].fabrics[0].id);
      await labelInput("原始工价", "19"); await click("保存草稿"); await until(async()=> (await read()).version===copied.version+1,"parallel cost save");
      assert.equal((await read()).quote.revisions[0].priceVersions[0].labor.value,"0");
      await action("编辑价格版本"); await labelInput("价格版本名称", "Renamed scenario"); await labelInput("数量", "3"); await click("保存修改");
      await until(async()=> (await read()).quote.revisions[0].priceVersions[1].name==="Renamed scenario","PV rename");
      await navigate(`/quote-center/detail?id=${workflowId}`); await hasText("Renamed scenario");
      await evaluate("[...document.querySelectorAll('.qc-version-card')].find(n=>n.innerText.includes('Renamed scenario')).click()");
      await action("编辑价格版本"); await click("删除价格版本"); await click("确认删除");
      await until(async()=> (await read()).quote.revisions[0].priceVersions.length===1,"PV delete");
      await action("编辑价格版本"); await click("删除价格版本"); await hasText("不能删除最后一个"); await click("取消");
      const source = await read();
      await click("查看报价历史"); await click("更新"); await click("是");
      await evaluate("[...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent==='更新原因 *').querySelector('button').click()");
      await click("其他"); await click("确认创建新报价版本");
      await until(async()=> (await read()).quote.revisions.length===2,"Revision V2");
      const v2 = await read(); assert.equal(v2.quote.revisions[0].readOnly,true); assert.equal(v2.quote.revisions[1].revisionLabel,"V2");
      assert.equal(v2.quote.revisions[1].priceVersions[0].id,source.quote.revisions[0].priceVersions[0].id);
      assert.deepEqual(v2.quote.revisions[1].imageAttachmentIds,source.quote.revisions[0].imageAttachmentIds);
      assert.equal(storage.objects.size,1,"No binary copy for new Revision");
      if (workflowId === quoteId) {
        await evaluate("document.querySelector('button[aria-label=\"synthetic.png 更多操作\"]').click()"); await click("删除"); await click("确认删除");
        await until(async()=> (await read()).quote.revisions[1].imageAttachmentIds.length===0,"new Revision unlink");
        assert.equal((await read()).quote.revisions[0].imageAttachmentIds.length,1,"Unlink leaves history relationship unchanged");
        assert.equal(storage.objects.size,1,"Unlink never deletes binary");
        await until(async()=> evaluate("![...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent?.startsWith('原始工价')).querySelector('input').matches(':disabled')"),"attachment write lock released");
      }
      await labelInput("原始工价", "55"); await click("保存草稿"); await until(async()=> (await read()).quote.revisions[1].priceVersions[0].labor.value==="55","V2 independent edit");
      await click("查看报价历史");
      await evaluate("[...document.querySelectorAll('.qc-revision-pill')].find(n=>n.querySelector('.qc-revision-label')?.textContent==='V1').click()");
      await click("更新"); await click("是");
      await evaluate("[...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent==='更新原因 *').querySelector('button').click()");
      await click("其他"); await click("确认创建新报价版本");
      await until(async()=> (await read()).quote.revisions.length===3,"selected historical branch");
      const branch = await read(); assert.equal(branch.quote.revisions[2].revisionLabel,"V1²"); assert.equal(branch.quote.revisions[2].parentRevisionId,source.quote.defaultRevisionId);
      assert.equal(branch.quote.revisions[2].priceVersions[0].labor.value,"0","Branch uses selected saved V1, not V2");
      await navigate(`/quote-center/detail?id=${workflowId}`); await hasText("V1");
      const beforeView = requests.filter(r=>r.method!=="GET").length;
      await click("查看报价历史"); await evaluate("[...document.querySelectorAll('.qc-revision-pill')].find(n=>n.querySelector('.qc-revision-label')?.textContent==='V1').click()"); await click("查看"); await hasText("历史只读");
      assert.equal(requests.filter(r=>r.method!=="GET").length,beforeView,"History view is read-only");
      await action("返回当前版本"); await hasText("当前编辑"); await isolated();
      const beforeFailure = await read();
      // A dirty-save succeeds first; failing the subsequent command must report both stages truthfully.
      await labelInput("款式名称", "SAVED-BEFORE-WORKFLOW-FAILURE");
      await action("创建价格版本"); await labelInput("价格版本名称", "Must not exist"); await labelInput("数量", "2");
      failureStatus=409;
      await command("Fetch.enable",{patterns:[{urlPattern:"*/version-workflows",requestStage:"Request"}]},sessionId);
      try { await click("确认创建"); await hasText("前一步草稿已保存"); await hasText("HTTP 409"); }
      finally { await command("Fetch.disable",{},sessionId); failureStatus=0; }
      const failed = await read(); assert.equal(failed.version,beforeFailure.version+1); assert.equal(failed.quote.revisions.at(-1).priceVersions.length,1);
      assert.equal(failed.quote.defaultRevisionId,beforeFailure.quote.defaultRevisionId); await isolated();
      await navigate(`/quote-center/detail?id=${workflowId}`); await hasText("当前编辑");
      const beforeNetwork = await read();
      await action("创建价格版本"); await labelInput("价格版本名称", "Uncertain scenario"); await labelInput("数量", "2");
      const mutationCount = requests.filter(r=>r.path.endsWith("/version-workflows")).length;
      await command("Fetch.enable",{patterns:[{urlPattern:"*/version-workflows",requestStage:"Request"}]},sessionId);
      try { await click("确认创建"); await hasText("版本操作未确认"); }
      finally { await command("Fetch.disable",{},sessionId); }
      assert.equal(requests.filter(r=>r.path.endsWith("/version-workflows")).length, mutationCount + 1);
      assert.deepEqual(await read(), beforeNetwork); await isolated();
    });
    for (const button of ["同步并保存", "仅保存当前版本"]) for (const failure of [null, 409, "network"]) await t.test(`actual cost-sync modal: ${button}, ${failure ?? "success"}, preserves draft and handles rejection`, async () => {
      await navigate("/quote-center/new"); await hasText("创建报价"); await click("创建报价"); await hasText("Server 报价 · v1");
      const id = await evaluate("new URLSearchParams(location.search).get('id')");
      const read = () => evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(id)}).then(r=>r.json()).then(body=>body.quote)`);
      await click("＋ 增加面料"); await input('#quote-section-fabrics input[aria-label$="-名称"]', "Linked synthetic fabric");
      await input('#quote-section-fabrics input[aria-label$="-单价"]', "12"); await click("保存草稿");
      await until(async()=> (await read()).version===2,"initial linked cost save");
      await action("创建价格版本"); await labelInput("价格版本名称", "Linked scenario"); await labelInput("数量", "1"); await click("确认创建");
      await until(async()=> (await read()).version===3,"linked PV created");
      const before = await read();
      assert.equal(before.quote.aggregateStatus,"draft","PV creation is not a draft lifecycle transition");
      assert.equal(before.quote.revisions[0].priceVersions[0].fabrics[0].lineGroupId, before.quote.revisions[0].priceVersions[1].fabrics[0].lineGroupId);
      await input('#quote-section-fabrics input[aria-label$="-单价"]', "33"); await click("保存草稿"); await hasText("价格版本同步");
      await evaluate("(()=>{const n=document.querySelector('.qc-price-sync-toolbar select');n.value='all';n.dispatchEvent(new Event('change',{bubbles:true}));})()");
      const writesBefore = requests.filter(r=>r.method==="PUT"&&r.path===`/api/v1/quotes/${id}`).length;
      const workflowBefore = requests.filter(r=>r.path.endsWith("/version-workflows")).length;
      if (failure !== null) {
        failureStatus = failure === 409 ? 409 : 0;
        await command("Fetch.enable", { patterns: [{ urlPattern: `*/api/v1/quotes/${id}`, requestStage: "Request" }] }, sessionId);
      }
      try {
        await click(button);
        if (failure === null) {
          await until(async()=> (await read()).version===4,"cost sync commit"); await hasText("Server 报价 · v4");
          assert.equal(await evaluate("Boolean(document.querySelector('.qc-price-sync-modal'))"),false);
          assert.equal(await evaluate("document.body.innerText.includes('有未保存修改')"),false);
          const saved = await read();
          assert.deepEqual(saved.quote.revisions[0].priceVersions.map(p=>p.fabrics[0].unitPrice),button==="同步并保存"?["33","33"]:["12","33"]);
        } else {
          await hasText("Server 保存未完成"); await hasText("请显式重新读取并核对");
          if (failure === 409) await hasText("409");
          assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='重试')"),true,"Explicit reconcile entry");
          assert.equal(await evaluate("document.querySelector('#quote-section-fabrics input[aria-label$=\"-单价\"]').value"),"33","Applied draft survives failed save");
          await hasText("有未保存修改");
          await sleep(300);
          assert.equal(await evaluate("location.pathname"),"/quote-center/detail");
          assert.deepEqual(await evaluate("unhandledRejections"),[],"Cost-sync Promise is handled");
        }
      } finally { if(failure!==null) await command("Fetch.disable",{},sessionId); failureStatus=0; }
      if (failure !== null) assert.deepEqual(await read(), before,"Failure neither commits nor restores dirty source silently");
      const writes = requests.filter(r=>r.method==="PUT"&&r.path===`/api/v1/quotes/${id}`);
      assert.equal(writes.length,writesBefore+1,"One save, no automatic retry");
      const attempted = JSON.parse(writes.at(-1).body).quote.revisions[0].priceVersions;
      assert.deepEqual(attempted.map(p=>p.fabrics[0].unitPrice),button==="同步并保存"?["33","33"]:["12","33"],"Explicit sync choice preserved in attempted draft");
      assert.equal(requests.filter(r=>r.path.endsWith("/version-workflows")).length,workflowBefore,"No subsequent version command");
      await isolated();
      if (failure === null) {
        const saved = await read(); assert.equal(saved.quote.aggregateStatus,"draft");
        await navigate("/quote-center"); await input('input[aria-label="搜索报价"]', saved.quote.quoteCode); await hasText("本页 1 / 总计 1");
        const row = await evaluate(`([...document.querySelectorAll('tr')].find(n=>n.innerText.includes(${JSON.stringify(saved.quote.quoteCode)})))?.innerText`);
        assert.ok(row?.includes(`经销 / ${saved.quote.aggregateStatus}`),"Formal list status agrees with draft readback"); await isolated();
      }
    });
    await command("Browser.close");
  } finally {
    ws?.close();
    if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([once(browser, "exit"), sleep(3000)]); }
    if (server.listening) await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
    try { await pool.end(); } finally { await postgres.stop(); }
    assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep) && temp.includes("zhixu-formal-quote-ui-"));
    await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    t.diagnostic("Disposable PostgreSQL, memory storage, owned Chromium profile cleanup PASS; no real environment access");
  }
});
