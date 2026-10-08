import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { once } from "node:events";
import { test } from "node:test";
import { createServer } from "vite";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(read, label) {
  for (let i = 0; i < 100; i++) { if (await read()) return; await sleep(100); }
  assert.fail(`${label} timed out`);
}

// Synthetic route fixture, real production repositories/controllers/export, fresh Chrome profile.
// This is not a claim of real 3001 deployment or production API/UI acceptance.
test("isolated Chromium retains identical Quote source across same-origin writable/frozen tabs", { timeout: 90_000 }, async () => {
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  assert.ok(existsSync(chrome), "Chromium required; never use the user's profile");
  const temp = await mkdtemp(join(tmpdir(), "q5c-browser-"));
  let mode = "writable";
  const server = await createServer({ configFile: false, server: { host: "127.0.0.1", port: 0 },
    plugins: [{ name: "q5c-isolated-fixture", configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (req.url !== "/fixture") return next();
        res.setHeader("Content-Type", "text/html");
        res.setHeader("Cache-Control", "no-store");
        res.end(`<html><body><div id="status">loading</div><script type="module">
          globalThis.__ZHIXU_BUILD_INFO__ = {quoteWriterMode:${JSON.stringify(mode)},masterSettingsAuthority:"server"};
          const {createMockQuoteRepository}=await import('/features/quote-center/repository/mock-quote-repository.ts');
          const {exportLocalDataBackup}=await import('/features/data-management/service/data-management-service.ts');
          const {isBrowserQuoteFrozen}=await import('/features/quote-center/authority/quote-writer-mode.ts');
          const repository=createMockQuoteRepository();
          const quotes=await repository.list();
          globalThis.fixture={repository,quotes,exportLocalDataBackup};
          document.querySelector('#status').textContent=isBrowserQuoteFrozen()?'FROZEN / READ ONLY':'WRITABLE';
          const button=document.createElement('button');button.textContent='Save';button.disabled=isBrowserQuoteFrozen();document.body.append(button);
        </script></body></html>`);
      });
    } }] });
  let browser, ws;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== "string" && ![3001, 3002].includes(address.port));
    const origin = `http://127.0.0.1:${address.port}`;
    const profile = join(temp, "profile");
    browser = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
      `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
    const portFile = join(profile, "DevToolsActivePort");
    await until(() => existsSync(portFile), "Chromium");
    const [port, path] = readFileSync(portFile, "utf8").trim().split(/\r?\n/);
    ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((done, reject) => { ws.addEventListener("open", done, { once: true }); ws.addEventListener("error", reject, { once: true }); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", ({ data }) => {
      const reply = JSON.parse(String(data)), entry = pending.get(reply.id);
      if (!entry) return; pending.delete(reply.id);
      if (reply.error) entry.reject(new Error(JSON.stringify(reply.error))); else entry.done(reply.result);
    });
    const command = (method, params = {}, sessionId) => new Promise((done, reject) => {
      pending.set(++id, { done, reject }); ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const open = async () => {
      const target = await command("Target.createTarget", { url: `${origin}/fixture` });
      const { sessionId } = await command("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      const evaluate = async (expression) => {
        const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
        assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
      await until(async () => Boolean(await evaluate("globalThis.fixture !== undefined")), "fixture");
      return { targetId: target.targetId, evaluate };
    };
    const writable = await open();
    assert.equal(await writable.evaluate("document.querySelector('button').disabled"), false);
    await writable.evaluate("fixture.repository.save(fixture.quotes[0])");
    const before = await writable.evaluate("localStorage.getItem('zhixu.erp.local.quotes')");
    assert.ok(before);
    await writable.evaluate("sessionStorage.setItem('zhixu.quote-center.slice-1.2','sentinel')");
    // Close only this synthetic tab, retain origin and isolated profile storage.
    await command("Target.closeTarget", { targetId: writable.targetId });
    mode = "frozen";
    const frozen = await open();
    assert.equal(await frozen.evaluate("document.querySelector('button').disabled"), true);
    assert.equal(await frozen.evaluate("document.querySelector('#status').textContent"), "FROZEN / READ ONLY");
    const result = await frozen.evaluate(`(async()=>{
      const quotes=await fixture.repository.list();const detail=await fixture.repository.getById(quotes[0].id);
      let rejected=false;try{await fixture.repository.save(detail)}catch(error){rejected=error.message==='quote_browser_writer_frozen'}
      const backup=await fixture.exportLocalDataBackup();
      return {count:quotes.length,id:detail.id,rejected,raw:localStorage.getItem('zhixu.erp.local.quotes'),exportRaw:backup.localRecords['zhixu.erp.local.quotes'],version:backup.backupVersion};
    })()`);
    assert.ok(result.count > 0 && result.id && result.rejected);
    assert.equal(result.raw, before); assert.equal(result.exportRaw, before); assert.equal(result.version, 1);
    await command("Target.closeTarget", { targetId: frozen.targetId });
    await command("Browser.close");
  } finally {
    ws?.close();
    if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([once(browser, "exit"), sleep(3000)]); }
    await server.close();
    assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep) && temp.includes("q5c-browser-"));
    await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
