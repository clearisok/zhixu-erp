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
import ExcelJS from "exceljs";
import JSZip from "jszip";
import pg from "pg";
import { createApp } from "../app.ts";
import { runMigrations } from "../db/migration-runner.ts";
import { bootstrapAdmin } from "../auth/bootstrap.ts";
import { synchronizePermissionCatalog } from "../auth/permissions.ts";
import { MemoryAttachmentStorage } from "../attachments/storage.ts";
import { startDisposablePostgres } from "./postgres-container.ts";
import { appendOperationLog } from "../operation-logs/repository.ts";
import { createSalesOrder } from "../sales-orders/repository.ts";
import { parseQuoteExportTemplateLayout } from "../../features/quote-center/export/quote-export-template-layout.ts";

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
    const permissionSets = {
      viewer: ["quote.view", "quote.export", "quote.revision.view", "quote.cost.view", "user_permissions.view"],
      editor: ["quote.view", "quote.revision.view", "quote.cost.view", "quote.edit", "quote.cost.edit", "quote.settings.edit", "quote.revision.update", "quote.price_version.create", "quote.price_version.delete"],
      estimateReader: ["quote.view", "quote.revision.view", "quote.cost.view", "estimate.view"],
      auditReader:["quote.view","quote.revision.view","quote.cost.view","audit_log.view"],
      confirmer:["quote.view","quote.confirm","quote.revision.view","quote.cost.view"],
    };
    for (const [name, permissions] of Object.entries(permissionSets)) {
      const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES($1,crypt('disposable-ui-password',gen_salt('bf',4)),$1,'viewer',true) RETURNING id", [`synthetic-ui-${name.toLowerCase()}`])).rows[0];
      const role = `synthetic-ui-role-${name}`;
      await pool.query("INSERT INTO app_roles(id,name,description) VALUES($1,$1,'Synthetic disposable role')", [role]);
      await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [user.id, role]);
      for (const permission of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [role, permission]);
    }
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
    let holdTermsPath = null, heldTermsRequest = null;
    ws.addEventListener("message", ({ data }) => {
      const reply = JSON.parse(String(data));
      const entry = pending.get(reply.id);
      if (entry) { pending.delete(reply.id); if (reply.error) entry.reject(new Error(JSON.stringify(reply.error))); else entry.done(reply.result); }
      if (reply.method === "Network.requestWillBeSent" && reply.params.request.url.includes("/api/")) requests.push({ requestId: reply.params.requestId, method: reply.params.request.method, path: new URL(reply.params.request.url).pathname, ...(["PUT","PATCH"].includes(reply.params.request.method) ? { body: reply.params.request.postData } : {}) });
      if (reply.method === "Network.loadingFinished") completedRequests.add(reply.params.requestId);
      if (reply.method === "Page.javascriptDialogOpening") void command("Page.handleJavaScriptDialog", { accept: acceptDialogs }, sessionId);
      if (reply.method === "Fetch.requestPaused") {
        if(holdTermsPath && new URL(reply.params.request.url).pathname===holdTermsPath && reply.params.request.method==="GET") heldTermsRequest=reply.params;
        else void command(failureStatus ? "Fetch.fulfillRequest" : "Fetch.failRequest", failureStatus ? { requestId: reply.params.requestId, responseCode: failureStatus, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ error: { code: "quote_conflict", message: "Synthetic version conflict" } })).toString("base64") } : { requestId: reply.params.requestId, errorReason: "ConnectionFailed" }, sessionId);
      }
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
      window.generatedDownloads=[];
      const objectURL=URL.createObjectURL.bind(URL);const blobs=new Map();
      URL.createObjectURL=b=>{const u=objectURL(b);blobs.set(u,b);return u;};
      const anchorClick=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){if(this.download&&blobs.has(this.href))window.generatedDownloads.push({name:this.download,blob:blobs.get(this.href)});return anchorClick.call(this);};
      const originalGet = Storage.prototype.getItem, originalSet = Storage.prototype.setItem;
      if(!originalGet.call(localStorage,'zhixu.erp.local.quotes')) originalSet.call(localStorage,'zhixu.erp.local.quotes','synthetic-old-business-sentinel');
      window.businessAccess=[];
      window.unhandledRejections=[];
      window.quoteResponses=[];
      window.logResponses=[];
      const originalFetch=window.fetch.bind(window);
      window.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0]).includes('/api/v1/quotes/'))window.quoteResponses.push(await response.clone().text());if(String(args[0]).includes('/api/v1/operation-logs'))window.logResponses.push(await response.clone().text());return response};
      window.addEventListener('unhandledrejection', event => window.unhandledRejections.push(String(event.reason)));
      const business=k=>k.startsWith('zhixu.')&&!/preference|sidebar/.test(k);
      Storage.prototype.getItem=function(k){if(business(k))businessAccess.push('read:'+k);return originalGet.call(this,k)};
      Storage.prototype.setItem=function(k,v){if(business(k))businessAccess.push('write:'+k);return originalSet.call(this,k,v)};
      const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{businessAccess.push('indexedDB:'+args[0]);return open(...args)};
      window.oldSentinel=()=>originalGet.call(localStorage,'zhixu.erp.local.quotes');
    ` }, sessionId);
    const text = () => evaluate("document.body?.innerText ?? ''");
    const hasText = async (value) => { try { await until(async () => (await text()).includes(value), value); } catch (error) { throw new Error(`${error.message}; synthetic page: ${await text()}`); } };
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
      const expectedBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
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
      await pool.query("DELETE FROM app_role_permissions WHERE permission_key='quote.view' AND role_id='role-server-admin'");
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
          await navigate("/quote-center"); await until(async()=>await evaluate('Boolean(document.querySelector(\'input[aria-label="搜索报价"]\'))'),"formal list search mounted"); await input('input[aria-label="搜索报价"]', saved.quote.quoteCode); await hasText("本页 1 / 总计 1");
        const row = await evaluate(`([...document.querySelectorAll('tr')].find(n=>n.innerText.includes(${JSON.stringify(saved.quote.quoteCode)})))?.innerText`);
        assert.ok(row?.includes(`经销 / ${saved.quote.aggregateStatus}`),"Formal list status agrees with draft readback"); await isolated();
      }
    });
    const costTab = async () => { await evaluate("document.querySelector('.qc-estimate-pill').click()"); await hasText("估算成本"); };
    const prepareEstimateQuote = async (type = "distribution") => {
      await navigate("/quote-center/new"); await hasText("创建报价"); await selectType(type); await click("创建报价");
      await until(async()=>await evaluate("location.pathname==='/quote-center/detail' && Boolean(new URLSearchParams(location.search).get('id'))"),"new Quote detail ready");await hasText("Server 报价 · v");
      const id = await evaluate("new URLSearchParams(location.search).get('id')");
      const read = () => evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(id)}).then(r=>r.json()).then(r=>r.quote)`);
      const initial = await read(), r = initial.quote.revisions[0], p = r.priceVersions[0];
      Object.assign(r.baseInfo,{brandId:"synthetic-brand",salespersonId:"synthetic-person",quoteStyleNo:"SYNTHETIC-ESTIMATE",styleName:"Synthetic estimate"});
      p.quantity="1";p.labor.value="10";p.fabrics=[{id:"estimate-source-fabric",lineGroupId:"estimate-shared-fabric",name:"Synthetic estimate fabric",composition:"",sourceLibraryItemId:null,segmentLengthCm:null,netWidthCm:"0",gsm:"0",lossRate:null,supplier:"",unitPrice:"12",purchaseUnit:"kg"}];
      const parallel=structuredClone(p);parallel.id="estimate-source-parallel";parallel.name="Alternate estimate source";parallel.labor.value="22";parallel.fabrics[0].unitPrice="99";
      r.priceVersions.push(parallel);
      await evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(id)},{method:'PUT',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:${JSON.stringify(JSON.stringify({quote:initial.quote,expectedVersion:initial.version}))}}).then(r=>{if(!r.ok)throw new Error('synthetic preparation failed')})`);
      await navigate(`/quote-center/detail?id=${id}`);await hasText("Server 报价");
      assert.equal((await read()).quote.activeEstimateCost,null);await isolated();return {id,read};
    };
    const generateEstimate = async (read, sourcePriceId) => {
      await click("查看报价历史");await hasText("估算来源价格版本");
      if(sourcePriceId) await evaluate(`(()=>{const s=document.querySelector('select[aria-label="估算来源价格版本"]');s.value=${JSON.stringify(sourcePriceId)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await click("生成估算成本");await click("确认生成");await until(async()=>Boolean((await read()).quote.activeEstimateCost),"explicit Estimate generation");await costTab();
    };
    for(const type of ["processing","distribution"]) await t.test(`actual Estimate full lifecycle, selected source and stale scope: ${type}`,async()=>{
      const {id,read}=await prepareEstimateQuote(type), initial=await read();
      await generateEstimate(read,"estimate-source-parallel");await hasText("来源价格版本：Alternate estimate source");
      const generated=await read(), first=structuredClone(generated.quote.activeEstimateCost);
      assert.equal(first.labor.value,"22");assert.equal(first.fabrics[0].unitPrice,"99");assert.equal(first.sourcePriceVersionId,"estimate-source-parallel");assert.deepEqual(generated.quote.revisions,initial.quote.revisions);assert.equal(generated.quote.aggregateStatus,"draft");
      assert.equal(await evaluate("document.querySelector('.qc-estimate-cost-panel button')?.textContent"),"保存估算成本");
      await labelInput("工价","77");await click("保存估算成本");await until(async()=> (await read()).quote.activeEstimateCost.labor.value==="77","Estimate value persisted");
      const saved=await read();assert.deepEqual(saved.quote.revisions,initial.quote.revisions);assert.equal(saved.quote.activeEstimateCost.id,first.id);
      await click("关闭");await navigate(`/quote-center/detail?id=${id}`);await hasText("Server 报价");await click("查看报价历史");await costTab();
      assert.equal(await evaluate("[...document.querySelectorAll('.qc-estimate-cost-panel label')].find(n=>n.querySelector('span')?.textContent==='工价').querySelector('input').value"),"77");
      await click("重新生成");await click("确认重新生成");await until(async()=> (await read()).quote.estimateCostHistory.length===1,"archive old active");await costTab();
      const replaced=await read();assert.deepEqual(replaced.quote.estimateCostHistory[0],saved.quote.activeEstimateCost);assert.equal(replaced.quote.activeEstimateCost.labor.value,"10","default source is actual base price, not selected scenario");
      await input('.qc-estimate-history input',"V1");await evaluate("document.querySelector('.qc-estimate-history button').click()");await hasText("历史只读");
      assert.equal(await evaluate("document.querySelector('.qc-estimate-cost-panel fieldset').disabled"),true);assert.equal(await evaluate("document.querySelector('.qc-estimate-cost-panel button')?.textContent==='保存估算成本'"),false);
      await click("恢复为新的当前估算");await until(async()=> (await read()).quote.activeEstimateCost.id!==replaced.quote.activeEstimateCost.id,"clone restore");
      const restored=await read();assert.equal(restored.quote.activeEstimateCost.labor.value,"77");assert.notEqual(restored.quote.activeEstimateCost.id,first.id);assert.deepEqual(restored.quote.estimateCostHistory[0],saved.quote.activeEstimateCost);
      assert.notEqual(restored.quote.activeEstimateCost.fabrics[0].id,first.fabrics[0].id);await hasText("当前估算");
      await click("关闭");
      for(let revisionNumber=2;revisionNumber<=3;revisionNumber++){
        await click("查看报价历史");await click("更新");await click("是");
        await evaluate("[...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent==='更新原因 *').querySelector('button').click()");await click("其他");await click("确认创建新报价版本");await until(async()=> (await read()).quote.revisions.length===revisionNumber,"new default Revision");
        await click("查看报价历史");await costTab();await hasText("当前估算成本已过期");
        if(revisionNumber===2){await click("忽略本次提醒");await until(async()=> (await read()).quote.activeEstimateCost.ignoredForRevisionId===(await read()).quote.defaultRevisionId,"scoped ignore");assert.equal(await evaluate("document.body.innerText.includes('当前估算成本已过期')"),false);await click("关闭");}
      }
      await click("按当前默认版本重新生成");await click("确认重新生成");await until(async()=> (await read()).quote.activeEstimateCost.basedOnRevisionId===(await read()).quote.defaultRevisionId,"regenerate current default");
      await evaluate("[...document.querySelectorAll('.qc-revision-pill')].find(n=>n.querySelector('.qc-revision-label')?.textContent==='V1').click()");
      await evaluate("(()=>{const s=document.querySelector('select[aria-label=\"估算来源价格版本\"]');s.value='estimate-source-parallel';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await click("生成估算成本");await click("确认重新生成");await until(async()=> (await read()).quote.activeEstimateCost.basedOnRevisionId===initial.quote.defaultRevisionId,"explicit selected historical source");
      await click("查看");await hasText("历史只读");await click("查看报价历史");await costTab();
      await labelInput("工价","88");await click("保存估算成本");await until(async()=> (await read()).quote.activeEstimateCost.labor.value==="88","Quote-level active estimate remains writable while viewing historical Revision");
      assert.deepEqual((await read()).quote.revisions[0],{...initial.quote.revisions[0],readOnly:true});
      assert.deepEqual(await evaluate("unhandledRejections"),[]);await isolated();
    });
    await t.test("Estimate dirty PV cost must finish visible explicit sync choice before generation",async()=>{
      const {read}=await prepareEstimateQuote(); const before=await read();
      await input('#quote-section-fabrics input[aria-label$="-单价"]',"33");
      await click("查看报价历史");await click("生成估算成本");await click("确认生成");
      await hasText("价格版本同步");
      assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('.qc-price-sync-modal button')].find(n=>n.textContent.trim()==='仅保存当前版本');const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()"),true,"Sync choice is not hidden by generation overlay");
      assert.deepEqual(await read(),before,"No implicit save/generation before sync decision");
      await click("仅保存当前版本");await until(async()=> (await read()).version===before.version+1,"explicit sync save before Estimate");
      const saved=await read();assert.equal(saved.quote.activeEstimateCost,null);assert.deepEqual(saved.quote.revisions[0].priceVersions.map(p=>p.fabrics[0].unitPrice),["33","99"]);
      await click("确认生成");await until(async()=>Boolean((await read()).quote.activeEstimateCost),"explicit continue after sync");
      assert.equal((await read()).quote.activeEstimateCost.fabrics[0].unitPrice,"33");assert.deepEqual(await evaluate("unhandledRejections"),[]);await isolated();
    });
    for(const failure of [409,"network"]) await t.test(`actual Estimate saved-first ${failure}, preserves source choice, no repeat/unhandled rejection`,async()=>{
      const {id,read}=await prepareEstimateQuote();const before=await read();
      await labelInput("款式名称","Saved before estimate");await click("查看报价历史");
      await evaluate("(()=>{const s=document.querySelector('select[aria-label=\"估算来源价格版本\"]');s.value='estimate-source-parallel';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await click("生成估算成本");
      const start=requests.length;failureStatus=failure===409?409:0;await command("Fetch.enable",{patterns:[{urlPattern:`*/api/v1/quotes/${id}/estimate-workflows`,requestStage:"Request"}]},sessionId);
      try{
        await click("确认生成");await hasText("前一步报价草稿已保存");await hasText("估算操作未确认");await hasText("Alternate estimate source");
        await sleep(200);assert.deepEqual(await evaluate("unhandledRejections"),[]);
        assert.equal(requests.slice(start).filter(r=>r.path.endsWith("/estimate-workflows")).length,1);assert.equal(requests.slice(start).filter(r=>r.method==="PUT").length,1);assert.equal(requests.slice(start).filter(r=>r.path.endsWith("/version-workflows")).length,0);
        await click("关闭并核对");await hasText("请显式核对 Server");
      }finally{await command("Fetch.disable",{},sessionId);failureStatus=0;}
      const after=await read();assert.equal(after.version,before.version+1);assert.equal(after.quote.revisions[0].baseInfo.styleName,"Saved before estimate");assert.equal(after.quote.activeEstimateCost,null);await isolated();
    });
    await t.test("actual dirty Estimate operation cancelled without losing draft or creating",async()=>{
      const {read}=await prepareEstimateQuote();await labelInput("款式名称","Unsaved estimate cancellation");const before=await read();
      await click("查看报价历史");await click("生成估算成本");acceptDialogs=false;
      try{await click("确认生成");await sleep(150);assert.deepEqual(await read(),before);await click("取消");await click("关闭");assert.ok(await evaluate("[...document.querySelectorAll('input')].some(n=>n.value==='Unsaved estimate cancellation')"));}finally{acceptDialogs=true;}
      await isolated();
    });
    for(const operation of ["update","restore"]) for(const failure of [409,"network"]) await t.test(`actual Estimate ${operation} ${failure}: dirty/selection retained and Promise handled`,async()=>{
      const {id,read}=await prepareEstimateQuote();await generateEstimate(read,"estimate-source-parallel");
      if(operation==="restore"){
        await click("重新生成");await click("确认重新生成");await until(async()=> (await read()).quote.estimateCostHistory.length===1,"prepare history via actual regeneration");await costTab();
        await evaluate("document.querySelector('.qc-estimate-history button').click()");await hasText("历史只读");
      }else await labelInput("工价","99");
      const before=await read(),start=requests.length;failureStatus=failure===409?409:0;
      await command("Fetch.enable",{patterns:[{urlPattern:`*/api/v1/quotes/${id}/estimate-workflows`,requestStage:"Request"}]},sessionId);
      try{
        await click(operation==="update"?"保存估算成本":"恢复为新的当前估算");await hasText(operation==="update"?"Server 保存未完成":"估算操作未确认");await hasText("关闭并核对");
        if(operation==="update") assert.equal(await evaluate("[...document.querySelectorAll('.qc-estimate-cost-panel label')].find(n=>n.querySelector('span')?.textContent==='工价').querySelector('input').value"),"99");
        else assert.equal(await evaluate("Boolean(document.querySelector('.qc-estimate-history button.selected'))"),true);
        await sleep(200);assert.deepEqual(await evaluate("unhandledRejections"),[]);assert.equal(requests.slice(start).filter(r=>r.path.endsWith("/estimate-workflows")).length,1);
        assert.equal(requests.slice(start).filter(r=>r.method==="PUT"||r.path.endsWith("/version-workflows")).length,0);
      }finally{await command("Fetch.disable",{},sessionId);failureStatus=0;}
      assert.deepEqual(await read(),before);await isolated();
    });
    const loginAs = async (name) => {
      await evaluate("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})");
      await navigate("/quote-center"); await hasText("登录织序 Server");
      await input("input[name=username]", `synthetic-ui-${name.toLowerCase()}`);
      await input("input[name=password]", "disposable-ui-password");
      await click("登录 Server"); await hasText("PostgreSQL 报价快照");
      const trustedPermissions = await evaluate("fetch('/api/v1/auth/permissions').then(r=>r.json()).then(b=>b.permissions)");
      assert.ok(trustedPermissions.includes("quote.view"), `Synthetic ${name} must have trusted quote.view: ${JSON.stringify(trustedPermissions)}`);
    };
    let permissionQuote, preservedEstimate;
    const assertNoEstimate = async () => {
      const responses = await evaluate("quoteResponses");
      assert.ok(responses.length > 0);
      for (const response of responses) {
        assert.equal(response.includes("PRIVATE-ESTIMATE-UI-PROBE"), false);
        assert.equal(response.includes('"activeEstimateCost"'), false);
        assert.equal(response.includes('"estimateCostHistory"'), false);
      }
      assert.equal((await text()).includes("PRIVATE-ESTIMATE-UI-PROBE"), false);
      assert.equal(await evaluate("JSON.stringify({...localStorage,...sessionStorage}).includes('PRIVATE-ESTIMATE-UI-PROBE')"), false);
      assert.equal(await evaluate("caches.keys().then(keys=>keys.length)"), 0);
      assert.deepEqual(await evaluate("unhandledRejections"), []); await isolated();
    };
    await t.test("trusted viewer login: Quote readable before/after admin Estimate generation; network/DOM/cache isolation", async () => {
      const prepared = await prepareEstimateQuote(); permissionQuote = prepared.id;
      await loginAs("viewer"); await navigate(`/quote-center/detail?id=${permissionQuote}`); await hasText("Server 报价 · v");
      await assertNoEstimate();
      await loginAs("admin"); await navigate(`/quote-center/detail?id=${permissionQuote}`); await hasText("Server 报价 · v");
      await generateEstimate(prepared.read);
      const first = await prepared.read();
      first.quote.activeEstimateCost.labor.description = "PRIVATE-ESTIMATE-UI-PROBE";
      const updated = await evaluate(`fetch('/api/v1/quotes/${permissionQuote}/estimate-workflows',{method:'POST',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(${JSON.stringify({action:"estimate.update",expectedVersion:first.version,estimate:first.quote.activeEstimateCost})})}).then(r=>r.status)`);
      assert.equal(updated,200);
      await navigate(`/quote-center/detail?id=${permissionQuote}`);await hasText("Server 报价 · v");await click("查看报价历史");await costTab();await click("重新生成");await click("确认重新生成");await until(async()=> (await prepared.read()).quote.estimateCostHistory.length===1,"permission history prepared");
      const all = await prepared.read(); preservedEstimate = [all.quote.activeEstimateCost, all.quote.estimateCostHistory];
      await loginAs("viewer");await navigate(`/quote-center/detail?id=${permissionQuote}`);await hasText("Server 报价 · v");
      const previousLoader = (await command("Page.getFrameTree",{},sessionId)).frameTree.frame.loaderId;
      await command("Page.reload",{ignoreCache:true},sessionId);
      await until(async () => (await command("Page.getFrameTree",{},sessionId)).frameTree.frame.loaderId !== previousLoader && await evaluate("document.readyState==='complete'"), "trusted viewer hard reload");
      await hasText("Server 报价 · v");
      await click("查看报价历史");await hasText("无查看权限");
      assert.equal(await evaluate("document.querySelector('.qc-estimate-pill').innerText.includes('未生成')"),false);
      assert.equal(await evaluate("Boolean(document.querySelector('.qc-estimate-cost-panel'))"),false);
      await assertNoEstimate();
    });
    await t.test("trusted Quote editor without Estimate permissions: ordinary save/version response isolated and protected slice preserved", async () => {
      await loginAs("editor");await navigate(`/quote-center/detail?id=${permissionQuote}`);await hasText("Server 报价 · v");
      await labelInput("款式名称","Quote-only permission edit");await click("保存草稿");await hasText("报价已保存到 Server");
      await assertNoEstimate();
      await click("查看报价历史");await click("更新");await click("是");
      await evaluate("[...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent==='更新原因 *').querySelector('button').click()");await click("其他");await click("确认创建新报价版本");await hasText("版本操作已保存到 Server");
      await assertNoEstimate();
      await loginAs("admin");
      const actual = await evaluate(`fetch('/api/v1/quotes/${permissionQuote}').then(r=>r.json()).then(b=>b.quote)`);
      assert.deepEqual([actual.quote.activeEstimateCost,actual.quote.estimateCostHistory],preservedEstimate);
      assert.equal(actual.quote.revisions.at(-1).baseInfo.styleName,"Quote-only permission edit");
    });
    await t.test("trusted Estimate reader login: full read visible, write controls and mutation API denied", async () => {
      await loginAs("estimateReader");await navigate(`/quote-center/detail?id=${permissionQuote}`);await hasText("Server 报价 · v");await click("查看报价历史");await costTab();
      assert.equal(await evaluate("document.querySelector('.qc-estimate-cost-panel fieldset').disabled"),true);
      assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='保存估算成本'&&!b.disabled)"),false);
      const attempt = await evaluate(`fetch('/api/v1/quotes/${permissionQuote}').then(r=>r.json()).then(b=>fetch('/api/v1/quotes/${permissionQuote}/estimate-workflows',{method:'POST',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({action:'estimate.ignore',expectedVersion:b.quote.version,estimateId:b.quote.quote.activeEstimateCost.id})})).then(r=>r.status)`);
      assert.equal(attempt,403);assert.deepEqual(await evaluate("unhandledRejections"),[]);await isolated();
    });
    await loginAs("admin");
    for (const type of ["processing", "distribution"]) await t.test(`actual customer confirmation ${type}: zero/update/refresh and saved source`, async () => {
      const {id,read}=await prepareEstimateQuote(type);
      await until(async()=> (await text()).includes("已证明未关联正式订单"),"confirmed unlinked source");
      await action("客户确认");await hasText("客户确认工价");
      await labelInput("客户确认工价","0");if(type==="distribution")await labelInput("客户确认成衣价格","0");
      await labelInput("确认备注","Synthetic UI confirmation");await click("保存确认");await hasText("已保存 Server 客户确认");
      let actual=await read(),rev=actual.quote.revisions[0],pv=rev.priceVersions[0];
      assert.equal(pv.confirmation.confirmedLaborPrice,"0");assert.equal(pv.confirmation.confirmedGarmentPrice,type==="processing"?null:"0");
      assert.equal(pv.confirmation.quotedLaborPrice,"10");assert.equal(actual.quote.aggregateStatus,"partially_confirmed");assert.equal(rev.priceVersions[1].confirmation,null);
      await navigate(`/quote-center/detail?id=${id}`);await hasText("当前价格方案已确认");await action("客户确认");await hasText("客户确认工价");
      await labelInput("客户确认工价","12.25");await click("保存确认");await hasText("已保存 Server 客户确认");actual=await read();
      assert.equal(actual.quote.revisions[0].priceVersions[0].confirmation.confirmedLaborPrice,"12.25");await isolated();assert.deepEqual(await evaluate("unhandledRejections"),[]);
      await evaluate("[...document.querySelectorAll('.qc-version-card')].find(n=>n.innerText.includes('Alternate estimate source')).click()");
      await until(async()=>await evaluate("Boolean(document.querySelector('.qc-version-card.active')?.innerText.includes('Alternate estimate source'))"),"selected parallel PV rendered");
      await until(async()=> (await text()).includes("已证明未关联正式订单"),"parallel PV lookup");await action("客户确认");await hasText("客户确认工价");
      await labelInput("客户确认工价","22");if(type==="distribution")await labelInput("客户确认成衣价格","41");const beforeParallel=await read();await click("保存确认");await until(async()=>(await read()).version===beforeParallel.version+1,"parallel confirmation committed");await hasText("已保存 Server 客户确认");
      actual=await read();assert.equal(actual.quote.aggregateStatus,"confirmed");assert.equal(actual.quote.revisions[0].confirmationSummary.confirmedCount,2);await isolated();
    });
    await t.test("actual dirty confirmation cancel/save then second-stage failure preserves distinct outcomes",async()=>{
      const {read}=await prepareEstimateQuote();await until(async()=> (await text()).includes("已证明未关联正式订单"),"unlinked lookup");
      const before=await read(),count=requests.filter(r=>r.path.endsWith('/confirmation-workflows')).length;
      await labelInput('款式名称','Saved before confirmation failure');acceptDialogs=false;await action('客户确认');await sleep(150);acceptDialogs=true;
      assert.deepEqual(await read(),before);assert.ok(await evaluate("[...document.querySelectorAll('input')].some(n=>n.value==='Saved before confirmation failure')"));assert.equal(requests.filter(r=>r.path.endsWith('/confirmation-workflows')).length,count);
      await action('客户确认');await hasText('客户确认工价');const saved=await read();assert.equal(saved.version,before.version+1);assert.equal(saved.quote.revisions[0].baseInfo.styleName,'Saved before confirmation failure');
      await labelInput('客户确认工价','5');await labelInput('客户确认成衣价格','30');failureStatus=409;await command('Fetch.enable',{patterns:[{urlPattern:'*/confirmation-workflows',requestStage:'Request'}]},sessionId);
      try{await click('保存确认');await hasText('前一步已保存的报价不回滚');}finally{await command('Fetch.disable',{},sessionId);failureStatus=0;}
      assert.deepEqual(await read(),saved);assert.equal(requests.filter(r=>r.path.endsWith('/confirmation-workflows')).length,count+1);assert.deepEqual(await evaluate('unhandledRejections'),[]);await isolated();
    });
    await t.test("actual trusted reader without action permissions cannot confirm/export/batch; no unauthorized request or Browser fallback",async()=>{
      await loginAs('estimateReader');
      try{
        await navigate(`/quote-center/detail?id=${permissionQuote}`);await hasText('Server 报价 · v');
        const count=requests.filter(r=>/confirmation-workflows|customer-export|customer-batch-export/.test(r.path)).length;
        await evaluate("(()=>{const more=document.querySelector('button[aria-label=\"更多报价操作\"]');if(more?.getClientRects().length)more.click()})()");
        const actions=await evaluate("[...document.querySelectorAll('.qc-quote-action-visible button,.qc-quote-action-menu button')].filter(b=>['客户确认','导出报价'].includes(b.textContent.trim())).map(b=>({label:b.textContent.trim(),disabled:b.disabled}))");
        assert.ok(actions.some(a=>a.label==='客户确认'));assert.ok(actions.some(a=>a.label==='导出报价'));assert.ok(actions.every(a=>a.disabled),"Business action buttons disabled; section navigation is not a mutation");
        await navigate('/quote-center');await hasText('PostgreSQL 报价快照');assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='批量客户报价').disabled"),true);
        assert.equal(requests.filter(r=>/confirmation-workflows|customer-export|customer-batch-export/.test(r.path)).length,count);await isolated();
      }finally{await loginAs('admin');}
    });
    for(const status of [409,0])await t.test(`actual confirmation failure ${status||"network"} retains inputs/no retry`,async()=>{
      const {read}=await prepareEstimateQuote();await until(async()=> (await text()).includes("已证明未关联正式订单"),"unlinked lookup");
      await action("客户确认");await hasText("客户确认工价");await labelInput("客户确认工价","7.25");await labelInput("客户确认成衣价格","40");await labelInput("确认备注","Retain confirmation draft");
      const before=await read(),count=requests.filter(r=>r.path.endsWith("/confirmation-workflows")).length;failureStatus=status;
      await command("Fetch.enable",{patterns:[{urlPattern:"*/confirmation-workflows",requestStage:"Request"}]},sessionId);
      try{await click("保存确认");await hasText("确认输入保留");assert.equal(await evaluate("document.querySelector('textarea[placeholder=可选]')?.value"),"Retain confirmation draft");assert.deepEqual(await evaluate("unhandledRejections"),[]);}
      finally{await command("Fetch.disable",{},sessionId);failureStatus=0;}
      assert.deepEqual(await read(),before);assert.equal(requests.filter(r=>r.path.endsWith("/confirmation-workflows")).length,count+1);await isolated();
    });
    const prepareLinkedQuote = async (type="distribution", currency="CNY") => {
      const prepared=await prepareEstimateQuote(type), initial=await prepared.read(), r=initial.quote.revisions[0], p=r.priceVersions[0];
      if(currency!==p.pricingParameters.laborCurrency){p.pricingParameters.laborCurrency=currency;p.pricingParameters.usdCnyRate="6.75";
        await evaluate(`fetch('/api/v1/quotes/${prepared.id}',{method:'PUT',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(${JSON.stringify({quote:initial.quote,expectedVersion:initial.version})})}).then(r=>{if(!r.ok)throw new Error('linked fixture failed')})`);
      }
      const orders=await Promise.all([1,2].map(()=>createSalesOrder(pool,{creationSource:"quote",sourceQuoteId:prepared.id,sourceRevisionId:r.revisionId,sourcePriceVersionId:p.id})));
      const path=`/api/v1/quotes/${prepared.id}/revisions/${r.revisionId}/price-versions/${p.id}/confirmed-commercial-terms`;
      const terms=()=>evaluate(`fetch(${JSON.stringify(path)}).then(r=>r.json()).then(b=>b.confirmedCommercialTerms)`);
      await navigate(`/quote-center/detail?id=${prepared.id}`);await hasText("Server 共享条款未确认");
      return {...prepared,orders,path,terms,revisionId:r.revisionId,priceVersionId:p.id};
    };
    for(const type of ["processing","distribution"]) await t.test(`actual linked ${type}: trusted confirmer, first/update, multiple Order read/write and independent versions`,async()=>{
      await loginAs("admin");const linked=await prepareLinkedQuote(type,type==="processing"?"USD":"CNY");
      if(type==="distribution"){await generateEstimate(linked.read,"estimate-source-parallel");await navigate(`/quote-center/detail?id=${linked.id}`);await hasText("Server 报价 · v");}
      const before=await linked.read();
      await loginAs("confirmer");await navigate(`/quote-center/detail?id=${linked.id}`);await hasText("Server 共享条款未确认");
      assert.ok(!(await text()).includes("查看估算成本"));
      await click("查看 / 更新共享条款");await hasText("客户确认工价");assert.equal(await evaluate("Boolean(document.querySelector('textarea[placeholder=可选]'))"),false);
      await labelInput("客户确认工价","0");if(type==="distribution")await labelInput("客户确认成衣价格","0");await click("保存确认");await hasText("Server 共享条款已确认");
      let terms=await linked.terms();assert.equal(terms.current.version,1);assert.equal(terms.current.confirmedLaborPrice,"0");
      const attempted=JSON.parse(requests.filter(r=>r.method==="PATCH"&&r.path===linked.path).at(-1).body);assert.equal(attempted.expectedQuoteVersion,before.version);assert.equal(attempted.expectedVersion,0);
      await click("查看 / 更新共享条款");await hasText("客户确认工价");await labelInput("客户确认工价","1.23456789");if(type==="distribution")await labelInput("客户确认成衣价格","42.25");await click("保存确认");await until(async()=>(await linked.terms()).current.version===2,"linked update committed");
      await loginAs("admin");assert.deepEqual(await linked.read(),before,"Terms-only writes leave the full aggregate unchanged");terms=await linked.terms();
      for(const order of linked.orders){const fromOrder=await evaluate(`fetch('/api/v1/sales-orders/${order.id}/confirmed-commercial-terms').then(r=>r.json()).then(b=>b.confirmedCommercialTerms)`);assert.deepEqual(fromOrder.current,terms.current);}
      const orderVersion=linked.orders[0].version;
      const response=await evaluate(`fetch('/api/v1/sales-orders/${linked.orders[0].id}/confirmed-commercial-terms',{method:'PATCH',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(${JSON.stringify({expectedVersion:2,customerConfirmedPrice:type==="processing"?null:"43.25",confirmedLaborPrice:"5.125",laborCurrency:type==="processing"?"USD":"CNY"})})}).then(r=>({status:r.status}))`);assert.equal(response.status,200);
      assert.equal((await pool.query("SELECT version FROM sales_orders WHERE id=$1",[linked.orders[0].id])).rows[0].version,orderVersion);
      await navigate(`/quote-center/detail?id=${linked.id}`);await hasText("工价 5.125");await isolated();assert.deepEqual(await linked.read(),before);
      await loginAs("viewer");await navigate(`/quote-center/detail?id=${linked.id}`);await hasText("工价 5.125");assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='查看 / 更新共享条款'&&!b.disabled)"),false);await isolated();
      await loginAs("admin");
    });
    await t.test("actual linked PV fast switch rejects late lookup and does not mix confirmation targets",async()=>{
      const linked=await prepareLinkedQuote();const initial=await linked.read(),rev=initial.quote.revisions[0],parallel=rev.priceVersions[1];
      await createSalesOrder(pool,{creationSource:"quote",sourceQuoteId:linked.id,sourceRevisionId:rev.revisionId,sourcePriceVersionId:parallel.id});
      await click("查看 / 更新共享条款");await hasText("客户确认工价");await labelInput("客户确认工价","11");await labelInput("客户确认成衣价格","41");await click("保存确认");await hasText("工价 11");
      await evaluate("[...document.querySelectorAll('.qc-version-card')].find(n=>n.innerText.includes('Alternate estimate source')).click()");await hasText("Server 共享条款未确认");
      await click("查看 / 更新共享条款");await hasText("客户确认工价");await labelInput("客户确认工价","22");await labelInput("客户确认成衣价格","52");await click("保存确认");await until(()=>evaluate("[...document.querySelectorAll('[role=dialog]')].every(n=>!n.getClientRects().length)"),"parallel confirmation modal closed after commit");await hasText("工价 22");
      holdTermsPath=linked.path;heldTermsRequest=null;
      await command("Fetch.enable",{patterns:[{urlPattern:`*${linked.path}`,requestStage:"Request"}]},sessionId);
      try {
        await evaluate("document.querySelectorAll('.qc-version-card')[0].click()");await until(()=>Boolean(heldTermsRequest),"held real first-PV lookup");
        await evaluate("document.querySelectorAll('.qc-version-card')[1].click()");await until(()=>evaluate("document.querySelector('.qc-version-card.active')?.innerText.includes('Alternate estimate source')"),"parallel target active");await hasText("工价 22");
        const paused=heldTermsRequest;await command("Fetch.continueRequest",{requestId:paused.requestId},sessionId);await until(()=>completedRequests.has(paused.networkId),"late first-PV lookup completed");await hasText("工价 22");
      } finally { await command("Fetch.disable",{},sessionId);holdTermsPath=null;heldTermsRequest=null; }
      assert.ok(!(await evaluate("document.querySelector('#quote-section-confirmation').innerText")).includes("工价 11"));
      await click("查看 / 更新共享条款");await hasText("客户确认工价");assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] input')].find(n=>n.inputMode==='decimal')?.value"),"22");await click("取消");
      assert.deepEqual(await linked.read(),initial);assert.deepEqual(await evaluate("unhandledRejections"),[]);await isolated();
    });
    await t.test("actual linked saved currency drift requires human review, no conversion or historical snapshot overwrite",async()=>{
      const linked=await prepareLinkedQuote();await click("查看 / 更新共享条款");await hasText("客户确认工价");await labelInput("客户确认工价","8.125");await labelInput("客户确认成衣价格","39");await click("保存确认");await hasText("工价 8.125");
      const changed=await linked.read();changed.quote.revisions[0].priceVersions[0].pricingParameters.laborCurrency="USD";changed.quote.revisions[0].priceVersions[0].pricingParameters.usdCnyRate="6.75";
      await evaluate(`fetch('/api/v1/quotes/${linked.id}',{method:'PUT',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(${JSON.stringify({quote:changed.quote,expectedVersion:changed.version})})}).then(r=>{if(!r.ok)throw new Error('saved currency change failed')})`);
      await navigate(`/quote-center/detail?id=${linked.id}`);await hasText("Server 共享条款已确认");const baseline=await linked.read();
      await click("查看 / 更新共享条款");await hasText("原共享币种 CNY；已保存 PV 币种 USD");await labelInput("客户确认工价","2.375");const count=requests.filter(r=>r.method==="PATCH"&&r.path===linked.path).length;
      await click("保存确认");await hasText("请明确核对已保存来源币种");assert.equal(requests.filter(r=>r.method==="PATCH"&&r.path===linked.path).length,count);
      await evaluate("[...document.querySelectorAll('[role=dialog] input')].find(n=>n.type==='checkbox').click()");await click("保存确认");await until(async()=>(await linked.terms()).current.version===2,"currency-reviewed linked commit");
      const terms=await linked.terms();assert.equal(terms.current.laborCurrency,"USD");assert.equal(terms.current.confirmedLaborPrice,"2.375");assert.deepEqual(await linked.read(),baseline);await isolated();
    });
    await t.test("actual linked customer XLSX and audit show shared current without replacing system cost",async()=>{
      const linked=await prepareLinkedQuote();await click("查看 / 更新共享条款");await hasText("客户确认工价");await labelInput("客户确认工价","1.23456789");await labelInput("客户确认成衣价格","88.25");await click("保存确认");await hasText("Server 共享条款已确认");const before=await linked.read();
      await action("导出报价");await hasText("发现未确认的价格版本差异");await click("仍然导出");await hasText("内置正式模板");await click("导出 Excel");await hasText("已生成并提供下载");
      const file=await evaluate("(async()=>{const f=generatedDownloads.at(-1);return {name:f.name,bytes:Array.from(new Uint8Array(await f.blob.arrayBuffer()))}})()");
      const bytes=Buffer.from(file.bytes),wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);const template=new ExcelJS.Workbook();await template.xlsx.load(readFileSync(resolve('templates/quote-export-template-v1.xlsx')));const layout=parseQuoteExportTemplateLayout(template.worksheets[0]),point=layout.summary.customerConfirmedPrice;
      assert.equal(wb.worksheets[0].getCell(point.row,point.column).value,88.25);assert.equal(wb.worksheets[1].getCell(point.row,point.column).value,null);assert.ok(!JSON.stringify(wb.worksheets.map(s=>s.getSheetValues())).includes("1.23456789"),"Shared labor is not substituted for the system cost");
      const logs=(await pool.query("SELECT count(*)::int n FROM operation_logs")).rows[0].n;await action("操作记录");await hasText("确认商业条款");await hasText("88.25");assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs")).rows[0].n,logs);
      assert.deepEqual(await linked.read(),before);await isolated();assert.deepEqual(await evaluate("unhandledRejections"),[]);t.diagnostic(`Linked XLSX: ${bytes.length} bytes SHA-256 ${createHash('sha256').update(bytes).digest('hex')} shared price/system separation parsed`);
    });
    for(const status of [409,0])await t.test(`actual linked ${status||"network"}: saved-first, retained inputs/target, explicit read never resubmits`,async()=>{
      const linked=await prepareLinkedQuote(),before=await linked.read();await labelInput("款式名称","Linked saved before failure");acceptDialogs=false;await click("查看 / 更新共享条款");await sleep(100);acceptDialogs=true;assert.deepEqual(await linked.read(),before);
      await click("查看 / 更新共享条款");await hasText("客户确认工价");const saved=await linked.read();assert.equal(saved.version,before.version+1);
      await labelInput("客户确认工价","7.123456789");await labelInput("客户确认成衣价格","44.25");const start=requests.length;failureStatus=status;
      await command("Fetch.enable",{patterns:[{urlPattern:`*${linked.path}`,requestStage:"Request"}]},sessionId);
      try{await click("保存确认");await hasText("确认输入保留");}finally{await command("Fetch.disable",{},sessionId);failureStatus=0;}
      await click("读取共享 current 核对");await hasText("原输入未替换");assert.equal(await evaluate("[...document.querySelectorAll('.qc-form-item')].find(n=>n.innerText.includes('客户确认工价'))?.querySelector('input')?.value"),"7.123456789");
      assert.equal(requests.slice(start).filter(r=>r.method==="PATCH"&&r.path===linked.path).length,1);assert.equal(requests.slice(start).filter(r=>r.path.endsWith('/confirmation-workflows')||r.path.endsWith('/version-workflows')).length,0);
      assert.deepEqual(await linked.read(),saved);assert.equal((await linked.terms()).current,null);assert.deepEqual(await evaluate("unhandledRejections"),[]);await isolated();
    });
    for(const type of ["processing","distribution"]) await t.test(`actual saved customer XLSX download ${type}: bytes/SHA/workbook and no Estimate`,async()=>{
      await loginAs("admin");const {id,read}=await prepareEstimateQuote(type);
      if(type==="processing"){
        const fixture=await read(),pv=fixture.quote.revisions[0].priceVersions[1];pv.pricingParameters.laborCurrency="USD";pv.pricingParameters.usdCnyRate="6.75";pv.pricingParameters.markupRate="0.25";
        const original=pv.fabrics[0];pv.fabrics.push(...Array.from({length:6},(_,i)=>({...original,id:`dynamic-fabric-${i}`,lineGroupId:`dynamic-group-${i}`,name:`Synthetic dynamic fabric ${i}`,unitPrice:i===0?null:i===1?"0":"12.25"})));
        await evaluate(`fetch('/api/v1/quotes/${id}',{method:'PUT',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(${JSON.stringify({quote:fixture.quote,expectedVersion:fixture.version})})}).then(r=>{if(!r.ok)throw new Error('currency fixture failed')})`);
        await navigate(`/quote-center/detail?id=${id}`);await hasText('Server 报价 · v');
      }
      const before=await read();
      await action("导出报价");await hasText("发现未确认的价格版本差异");await click("仍然导出");await hasText("内置正式模板");await click("导出 Excel");await hasText("已生成并提供下载");
      const file=await evaluate("(async()=>{const f=generatedDownloads.at(-1);return {name:f.name,bytes:Array.from(new Uint8Array(await f.blob.arrayBuffer()))}})()");
      const bytes=Buffer.from(file.bytes);assert.ok(bytes.length>1000);assert.match(file.name,/\.xlsx$/);
      const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
      assert.equal(workbook.worksheets.length,2);assert.ok(workbook.worksheets.every(s=>s.pageSetup.printArea));
      const cells=JSON.stringify(workbook.worksheets.map(s=>s.getSheetValues()));assert.ok(cells.includes("Synthetic estimate fabric"));assert.ok(!cells.includes("PRIVATE-ESTIMATE"));
      if(type==="processing"){
        assert.ok(cells.includes("USD"),"Selected PV keeps its own USD labor snapshot");const sheet=workbook.worksheets[1],templateWorkbook=new ExcelJS.Workbook();await templateWorkbook.xlsx.load(readFileSync(resolve('templates/quote-export-template-v1.xlsx')));const layout=parseQuoteExportTemplateLayout(templateWorkbook.worksheets[0]);
        for(let i=0;i<6;i++)assert.ok(cells.includes(`Synthetic dynamic fabric ${i}`),"Dynamic cost rows are not clipped");
        const findPrice=name=>{let row;sheet.eachRow(r=>{if(r.getCell(layout.sections.fabric.columns.name).value===name)row=r;});assert.ok(row);return row.getCell(layout.sections.fabric.columns.unitPrice).value;};
        assert.equal(findPrice('Synthetic dynamic fabric 0'),null);assert.equal(findPrice('Synthetic dynamic fabric 1'),0);assert.equal(findPrice('Synthetic dynamic fabric 2'),12.25);
      }
      assert.deepEqual(await read(),before);await isolated();assert.deepEqual(await evaluate("unhandledRejections"),[]);
      t.diagnostic(`Customer XLSX ${type}: ${bytes.length} bytes SHA-256 ${createHash("sha256").update(bytes).digest("hex")} parsed`);
    });
    await t.test('actual historical single-PV XLSX retains selected source and legally embedded image',async()=>{
      await navigate(`/quote-center/detail?id=${quoteId}`);await hasText('Server 报价 · v');const before=await record();
      const history=before.quote.revisions.find(r=>r.revisionLabel==='V1');assert.equal(history.readOnly,true);assert.ok(history.styleImageAttachmentId);
      await click('查看报价历史');await evaluate("[...document.querySelectorAll('.qc-revision-pill')].find(n=>n.querySelector('.qc-revision-label')?.textContent==='V1').click()");await click('查看');await hasText('历史只读');
      await action('导出报价');await hasText('内置正式模板');await evaluate("document.querySelector('input[name=quote-export-scope][value=current]').click()");await click('导出 Excel');await hasText('已生成并提供下载');
      const file=await evaluate("(async()=>{const f=generatedDownloads.at(-1);return {name:f.name,bytes:Array.from(new Uint8Array(await f.blob.arrayBuffer()))}})()");
      const bytes=Buffer.from(file.bytes),wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);assert.equal(wb.worksheets.length,1);assert.equal(wb.worksheets[0].getImages().length,1);assert.ok(JSON.stringify(wb.worksheets[0].getSheetValues()).includes(history.baseInfo.styleName));
      assert.ok(file.name.includes('V1'));assert.deepEqual(await record(),before);await isolated();t.diagnostic(`Historical customer XLSX: ${bytes.length} bytes SHA-256 ${createHash('sha256').update(bytes).digest('hex')} image/source parsed`);
    });
    await t.test('actual trusted export without estimate.view omits active/history leakage probes',async()=>{
      await loginAs('viewer');
      try{
        await navigate(`/quote-center/detail?id=${permissionQuote}`);await hasText('Server 报价 · v');await action('导出报价');
        if((await text()).includes('发现未确认的价格版本差异'))await click('仍然导出');await hasText('内置正式模板');await click('导出 Excel');await hasText('已生成并提供下载');
        const raw=await evaluate("(async()=>Array.from(new Uint8Array(await generatedDownloads.at(-1).blob.arrayBuffer())))()"),wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(raw));
        assert.doesNotMatch(JSON.stringify(wb.worksheets.map(s=>s.getSheetValues())),/PRIVATE-ESTIMATE-UI-PROBE|activeEstimateCost|estimateCostHistory/);await assertNoEstimate();
      }finally{await loginAs('admin');}
    });
    for(const partial of [false,true])await t.test(`actual cross-page customer ZIP ${partial?"partial stale failure":"saved collection"}`,async()=>{
      await loginAs("admin");await navigate("/quote-center");await hasText("本页 25");await click("批量客户报价");
      const first=await evaluate("document.querySelector('input[aria-label^=\"选择 \" ]').getAttribute('aria-label').slice(3)");
      await evaluate("document.querySelector('input[aria-label^=\"选择 \" ]').click()");await click("下一页");await hasText("本页 25");
      const second=await evaluate("document.querySelector('input[aria-label^=\"选择 \" ]').getAttribute('aria-label').slice(3)");
      await evaluate("document.querySelector('input[aria-label^=\"选择 \" ]').click()");await hasText("已选 2 / 25");assert.notEqual(first,second);
      if(partial)await evaluate(`fetch('/api/v1/quotes/${first}').then(r=>r.json()).then(b=>{b.quote.quote.revisions.find(r=>r.revisionId===b.quote.quote.defaultRevisionId).baseInfo.notes='Synthetic concurrent change';return fetch('/api/v1/quotes/${first}',{method:'PUT',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({quote:b.quote.quote,expectedVersion:b.quote.version})})}).then(r=>{if(!r.ok)throw new Error('concurrency fixture failed')})`);
      const count=requests.filter(r=>r.path.endsWith('/customer-batch-export')).length;
      await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='生成客户报价 ZIP');b.click();b.click()})()");
      await hasText(`选中 2 / 成功 ${partial?1:2} / 失败 ${partial?1:0}`);
      const downloaded=await evaluate("(async()=>{const f=generatedDownloads.at(-1);return Array.from(new Uint8Array(await f.blob.arrayBuffer()))})()");
      const zip=await JSZip.loadAsync(Buffer.from(downloaded)),manifest=JSON.parse(await zip.file('export-results.json').async('string'));
      assert.deepEqual(manifest.items.map(i=>i.quoteId),[first,second]);assert.equal(manifest.success,partial?1:2);
      const files=Object.keys(zip.files).filter(n=>n.endsWith('.xlsx'));assert.equal(files.length,partial?1:2);
      for(const name of files){const bytes=await zip.file(name).async('nodebuffer');const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);assert.ok(wb.worksheets.length>=1);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.items.find(i=>i.fileName===name).sha256);}
      assert.equal(requests.filter(r=>r.path.endsWith('/customer-batch-export')).length,count+1);assert.deepEqual(await evaluate('unhandledRejections'),[]);await isolated();
    });
    await t.test("actual bounded selection rejects 26th item without truncation",async()=>{
      await navigate('/quote-center');await hasText('本页 25');await click('批量客户报价');await click('本页全选');await hasText('已选 25 / 25');await click('下一页');await hasText('本页 25');
      await evaluate("document.querySelector('input[aria-label^=\"选择 \" ]').click()");await hasText('最多选择 25 张');await hasText('已选 25 / 25');await isolated();
    });
    await t.test("actual trusted read-only Quote/global audit: snapshot, paging, Estimate isolation and no read writes",async()=>{
      const actorRow=(await pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic-ui-admin'")).rows[0];
      const actor={internalUserId:actorRow.id,userId:actorRow.public_id,username:'synthetic-ui-admin',userName:'Synthetic event-time actor',permissions:[]};
      for(let n=0;n<106;n++)await appendOperationLog(pool,actor,{module:'报价中心',action:'保存报价',entityType:'Quote',entityId:permissionQuote,quoteId:permissionQuote,
        beforeData:{values:{syntheticField:`before-${n}`}},afterData:{values:{syntheticField:`after-${n}`}},metadata:{fixture:'Synthetic audit event'}});
      const before=(await pool.query('SELECT count(*)::int n FROM operation_logs')).rows[0].n;
      await loginAs('auditReader');await navigate(`/quote-center/detail?id=${permissionQuote}`);await hasText('Server 报价 · v');await action('操作记录');await hasText('本页事件 25');await hasText('Synthetic event-time actor');
      await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='技术详情').click()");await hasText('Server 事件快照');assert.ok((await text()).includes('after-'));await evaluate("document.querySelector('button[aria-label=\"关闭Server 事件快照\"]').click()");
      await click('下一页事件');await hasText('本页事件 25');await click('刷新记录');await hasText('本页事件 25');
      assert.doesNotMatch((await evaluate('logResponses')).join(''),/PRIVATE-ESTIMATE-UI-PROBE|estimateHistoryCount|estimate\.generate|estimate\.regenerate/);await isolated();await click('关闭');
      await navigate('/system-settings/operation-logs');await hasText('可信 Server 只读事件');await hasText('本页事件 25');await click('下一页事件');await hasText('本页事件 25');await isolated();
      await labelInput('模块','Synthetic no matching module');await hasText('暂无匹配的 Server 事件');await hasText('本页事件 0 / 总计 0');await labelInput('模块','');await hasText('本页事件 25');
      failureStatus=503;await command('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/operation-logs*',requestStage:'Request'}]},sessionId);
      try{await click('刷新记录');await hasText('操作记录读取失败');await hasText('HTTP 503');}finally{await command('Fetch.disable',{},sessionId);failureStatus=0;}
      assert.equal((await pool.query('SELECT count(*)::int n FROM operation_logs')).rows[0].n,before);assert.deepEqual(await evaluate('unhandledRejections'),[]);
      await loginAs('viewer');await navigate('/system-settings/operation-logs');await hasText('需要 audit_log.view');assert.deepEqual(await evaluate('logResponses'),[]);await isolated();
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
