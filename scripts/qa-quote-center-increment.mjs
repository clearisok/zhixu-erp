import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";
import { buildQuotePlaceholderExcel } from "../features/quote-center/export/quote-placeholder-excel-exporter.ts";
import { buildQuoteSummaryExcel, buildQuoteZipBundle } from "../features/quote-center/export/quote-batch-exporter.ts";
import { createEstimateCostFromRevision } from "../features/quote-center/model/estimate-cost.ts";
import { getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

const root = new URL("../", import.meta.url);
const artifacts = new URL("../artifacts/", import.meta.url);
const templateUrl = new URL("../templates/quote-customer-placeholder-v1.xlsx", import.meta.url);
const formalUrl = new URL("../templates/quote-export-template-v1.xlsx", import.meta.url);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const writeArrayBuffer = (url, buffer) => writeFile(url, Buffer.from(buffer));
const attachments = { save: async () => { throw new Error("not used"); }, get: async () => null, list: async () => [], getBlob: async () => null, delete: async () => undefined };

await mkdir(artifacts, { recursive: true });
const sourceTemplate = await readFile(templateUrl);
const sourceFormal = await readFile(formalUrl);
const hashesBefore = { placeholder: sha256(sourceTemplate), formal: sha256(sourceFormal) };
const quotes = structuredClone(quoteFixtures.slice(0, 2));
const firstRevision = getDefaultRevision(quotes[0]);
quotes[0].activeEstimateCost = createEstimateCostFromRevision({ quoteId: quotes[0].id, revision: firstRevision, id: "qa-estimate", generatedAt: "2026-08-22T12:00:00.000Z", generatedBy: "QA" });

const placeholder = await buildQuotePlaceholderExcel({
  template: sourceTemplate.buffer.slice(sourceTemplate.byteOffset, sourceTemplate.byteOffset + sourceTemplate.byteLength),
  quote: quotes[0], revision: firstRevision, priceVersions: firstRevision.priceVersions, now: new Date("2026-08-22T12:00:00.000Z"),
});
await writeArrayBuffer(new URL("qa-placeholder-quote.xlsx", artifacts), placeholder.buffer);

const visibleColumns = ["style", "brand", "salesperson", "quantity", "fabricCost", "trimCost", "labor", "garmentPrice", "confirmationStatus"];
const perQuote = await buildQuoteSummaryExcel({ quotes, visibleColumns, rowMode: "quote", estimateColumns: ["estimateTotal", "estimateRevision", "estimateDifference"], now: new Date("2026-08-22T12:00:00.000Z") });
const perVersion = await buildQuoteSummaryExcel({ quotes, visibleColumns, rowMode: "price-version", estimateColumns: ["estimateTotal", "estimateRevision", "estimateDifference"], now: new Date("2026-08-22T12:00:00.000Z") });
await writeArrayBuffer(new URL("qa-summary-quote.xlsx", artifacts), perQuote.buffer);
await writeArrayBuffer(new URL("qa-summary-price-version.xlsx", artifacts), perVersion.buffer);

const zipResult = await buildQuoteZipBundle({
  quotes,
  attachmentRepository: attachments,
  now: new Date("2026-08-22T12:00:00.000Z"),
  buildQuote: async ({ quote, revision, priceVersions, now }) => buildQuotePlaceholderExcel({
    template: sourceTemplate.buffer.slice(sourceTemplate.byteOffset, sourceTemplate.byteOffset + sourceTemplate.byteLength), quote, revision, priceVersions, now,
  }),
});
if (!zipResult.buffer || !zipResult.fileName) throw new Error("ZIP QA did not produce an archive");
await writeFile(new URL("qa-quote-batch.zip", artifacts), zipResult.buffer);
const zip = await JSZip.loadAsync(zipResult.buffer);
const zipEntries = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

const exported = new ExcelJS.Workbook();
await exported.xlsx.load(placeholder.buffer);
const customerCellText = [];
const formulaText = [];
for (const sheet of exported.worksheets) sheet.eachRow((row) => row.eachCell((cell) => {
  const value = cell.value;
  customerCellText.push(typeof value === "object" && value && "richText" in value ? value.richText.map((part) => part.text).join("") : String(value ?? ""));
  if (typeof value === "object" && value && "formula" in value) formulaText.push(String(value.formula));
}));

const hashesAfter = { placeholder: sha256(await readFile(templateUrl)), formal: sha256(await readFile(formalUrl)) };
const result = {
  sourceRoot: root.pathname,
  sourceTemplateHashesUnchanged: JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter),
  hashes: hashesAfter,
  placeholder: { sheets: exported.worksheets.map((sheet) => sheet.name), diagnostics: placeholder.diagnostics, containsEstimateData: customerCellText.some((value) => /估算成本|qa-estimate|estimate\./i.test(value)), formulaRefErrors: formulaText.filter((value) => /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/i.test(value)) },
  summaries: { perQuoteRows: perQuote.rowCount, perVersionRows: perVersion.rowCount, perQuoteHeaders: perQuote.headers, perVersionHeaders: perVersion.headers },
  zip: { success: zipResult.success, failed: zipResult.failed, entries: zipEntries },
};
await writeFile(new URL("qa-increment-report.json", artifacts), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
