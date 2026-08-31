import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launchFile = resolve(root, "public", "__dev-ui-qa-data.html");
const command = process.argv[2] ?? "prepare";

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>织序 DEV / QA 数据生成器</title>
  <style>
    body{font:14px/1.6 system-ui,sans-serif;max-width:920px;margin:40px auto;padding:0 24px;color:#172033;background:#f5f7fa}
    main{background:#fff;border:1px solid #dbe1ea;border-radius:12px;padding:24px;box-shadow:0 8px 24px #17203312}
    button{border:0;border-radius:8px;padding:10px 18px;background:#1769aa;color:#fff;font-weight:650;cursor:pointer}
    button:disabled{opacity:.5;cursor:not-allowed} pre{white-space:pre-wrap;overflow:auto;max-height:65vh;background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px}
    .diagnostics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0;padding:14px;border:1px solid #dbe1ea;border-radius:10px;background:#f8fafc}
    .diagnostics div{min-width:0}.diagnostics dt{color:#64748b;font-size:12px}.diagnostics dd{margin:2px 0 0;overflow-wrap:anywhere;font-weight:650}
    .warning{color:#9a3412}.profile{padding:12px 14px;border-left:4px solid #1769aa;background:#eff6ff}.small{color:#64748b;font-size:12px}
    @media(max-width:600px){.diagnostics{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <h1>DEV / QA 仿真数据生成器</h1>
    <dl class="diagnostics">
      <div><dt>当前 Origin</dt><dd id="origin"></dd></div>
      <div><dt>Browser Profile</dt><dd>当前打开本页的 Chrome Profile</dd></div>
      <div><dt>Dataset ID</dt><dd><code>ui-redesign-qa-v1</code></dd></div>
      <div><dt>Seed</dt><dd><code>zhixu-ui-redesign-2026</code></dd></div>
      <div><dt>localStorage namespace</dt><dd><code>zhixu.erp.local.*</code></dd></div>
      <div><dt>预期 QA 数量</dt><dd>Quote 72 · Order 168 · Schedule 150 · Closing 90</dd></div>
    </dl>
    <p class="profile"><strong>必须用最终验收 ERP 的同一个 Chrome Profile 打开本页。</strong><br><code>127.0.0.1:3001</code> 与 <code>localhost:3001</code> 是不同 Origin；Codex Browser 与你的 Chrome Profile 也不会共享 localStorage / IndexedDB。</p>
    <p class="warning">仅允许在 127.0.0.1:3001 / localhost:3001 手工执行。只追加或跳过已有数据，不执行 Reset、删除或清理。</p>
    <button id="generate" type="button">生成 / 补齐数据集</button>
    <pre id="result">尚未执行。</pre>
    <p class="small">执行完成后返回相同 Origin 的 ERP。<code>npm run qa:data:cleanup</code> 只删除本临时 Loader，不会删除已生成的数据集。</p>
  </main>
  <script type="module">
    import { installUiQaDataset } from "/scripts/ui-qa-data/dataset.ts";
    const button = document.querySelector("#generate");
    const result = document.querySelector("#result");
    document.querySelector("#origin").textContent = window.location.origin;
    const allowed = ["127.0.0.1", "localhost"].includes(location.hostname) && location.port === "3001";
    if (!allowed) { button.disabled = true; result.textContent = "拒绝执行：当前不是受控 DEV 3001 环境。"; }
    button.addEventListener("click", async () => {
      button.disabled = true;
      result.textContent = "正在通过正式 Repository / Service 生成，请勿关闭页面……";
      try {
        const manifest = await installUiQaDataset();
        result.textContent = JSON.stringify({
          origin: window.location.origin,
          browserProfile: "current-profile",
          namespace: "zhixu.erp.local.*",
          datasetId: manifest.datasetId,
          seed: manifest.seed,
          qaCounts: {
            quotes: manifest.counts.quotes,
            orders: manifest.counts.orders,
            scheduleAssignments: manifest.counts.scheduledOrders,
            closingPeriods: manifest.counts.closingPeriods,
            closingRelations: manifest.counts.closingAllocations,
          },
          installation: manifest.installation,
          integrity: manifest.integrity,
        }, null, 2);
        document.title = "PASS · 织序 DEV / QA 数据生成器";
      } catch (error) {
        result.textContent = "FAIL\\n" + (error instanceof Error ? error.stack ?? error.message : String(error));
        document.title = "FAIL · 织序 DEV / QA 数据生成器";
      } finally { button.disabled = false; }
    });
  </script>
</body>
</html>`;

if (command === "prepare") {
  await mkdir(dirname(launchFile), { recursive: true });
  await writeFile(launchFile, html, "utf8");
  console.log("DEV-only launcher prepared:");
  console.log("http://127.0.0.1:3001/__dev-ui-qa-data.html");
  console.log("After generation, run: npm run qa:data:cleanup");
} else if (command === "cleanup") {
  if (existsSync(launchFile)) await rm(launchFile);
  console.log("DEV-only launcher removed.");
} else {
  console.error("Usage: node scripts/generate-ui-qa-data.mjs <prepare|cleanup>");
  process.exitCode = 1;
}
