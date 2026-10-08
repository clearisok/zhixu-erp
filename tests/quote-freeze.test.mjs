import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("Q5 frozen repository/export/evidence and runtime build unit suite", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "features/quote-center/__tests__/quote-freeze.test.ts",
    "server/quotes/freeze-readiness.test.ts", "server/maintenance-static.test.ts"], { encoding: "utf8", windowsHide: true, env });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tests 6/);
});
test("Q5 production UI routes and attachment boundary block writes, not navigation", async () => {
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  assert.match(editor, /const canEditQuote = !quoteFrozen/);
  assert.match(editor, /if \(quoteFrozen\) return;/);
  assert.match(editor, /canUpdate=\{!quoteFrozen/);
  assert.match(editor, /canEditEstimate=\{!quoteFrozen/);
  assert.match(editor, /!isNew && !quoteFrozen && quoteToOrderOpen/);
  assert.match(editor, /readOnly=\{quoteFrozen \|\| isHistorical/);
  assert.match(editor, /报价迁移冻结 · 只读/);
  assert.doesNotMatch(editor, /indexedDbAttachmentRepository\.delete/);
  const list = await read("features/quote-center/components/quote-list.tsx");
  assert.match(list, /disabled=\{quoteFrozen\}/);
  assert.match(list, /QuoteSearchField/);
  const attachment = await read("features/quote-center/components/attachment-panel.tsx");
  assert.match(attachment, /controller.mode === "browser" && isBrowserQuoteFrozen/);
  assert.match(attachment, /safeDownload\(attachment\)/);
  const order = await read("features/order-center/components/quote-to-order-modal.tsx");
  assert.match(order, /if \(isBrowserQuoteFrozen\(\)\) return null/);
  assert.doesNotMatch(await read("features/quote-center/repository/indexeddb-attachment-repository.ts"), /assertBrowserQuoteWrite/);
});
test("Q5 compiled mode is explicit and independent from Q3", async () => {
  assert.match(await read("vite.config.ts"), /quoteWriterMode: parseQuoteWriterMode/);
  assert.match(await read("Dockerfile.server"), /io.zhixu.quote-writer-mode/);
  assert.match(await read("server/build-identity.ts"), /NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE/);
  assert.doesNotMatch(await read("features/basic-settings/authority/master-settings-authority.ts"), /quoteWriterMode/);
});
