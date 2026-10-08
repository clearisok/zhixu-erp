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
    const requests = [];
    const completedRequests = new Set();
    ws.addEventListener("message", ({ data }) => {
      const reply = JSON.parse(String(data));
      const entry = pending.get(reply.id);
      if (entry) { pending.delete(reply.id); if (reply.error) entry.reject(new Error(JSON.stringify(reply.error))); else entry.done(reply.result); }
      if (reply.method === "Network.requestWillBeSent" && reply.params.request.url.includes("/api/")) requests.push({ requestId: reply.params.requestId, method: reply.params.request.method, path: new URL(reply.params.request.url).pathname });
      if (reply.method === "Network.loadingFinished") completedRequests.add(reply.params.requestId);
      if (reply.method === "Page.javascriptDialogOpening") void command("Page.handleJavaScriptDialog", { accept: true }, sessionId);
      if (reply.method === "Fetch.requestPaused") void command("Fetch.failRequest", { requestId: reply.params.requestId, errorReason: "ConnectionFailed" }, sessionId);
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
    await command("Network.enable", {}, sessionId);
    await command("Page.addScriptToEvaluateOnNewDocument", { source: `
      const originalGet = Storage.prototype.getItem, originalSet = Storage.prototype.setItem;
      if(!originalGet.call(localStorage,'zhixu.erp.local.quotes')) originalSet.call(localStorage,'zhixu.erp.local.quotes','synthetic-old-business-sentinel');
      window.businessAccess=[];
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
    const labelInput = async (label, value) => evaluate(`(()=>{const node=[...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent?.startsWith(${JSON.stringify(label)}))?.querySelector('input,textarea');if(!node)throw new Error('label input missing: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const click = async (label) => evaluate(`(()=>{const node=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(label)}&&!n.disabled&&n.getClientRects().length);if(!node)throw new Error('button missing: '+${JSON.stringify(label)});node.click();})()`);
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
      await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='创建报价');b.click();b.click();})()");
      await until(async () => await evaluate("location.pathname==='/quote-center/detail'"), "created detail route");
      await hasText("Server 报价 · v1");
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
      assert.equal((await record()).version, 5); await isolated();
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
