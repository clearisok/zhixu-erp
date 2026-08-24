import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputs = [
  ["../qa-placeholder-quote.xlsx", "../qa-placeholder-quote"],
  ["../qa-summary-quote.xlsx", "../qa-summary-quote"],
  ["../qa-summary-price-version.xlsx", "../qa-summary-price-version"],
];
const report = [];
for (const [inputPath, outputBase] of inputs) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 2000 });
  const formulas = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan", maxChars: 2000 });
  const sheetNames = [...sheets.ndjson.matchAll(/"name":"([^"]+)"/g)].map((match) => match[1]);
  const rendered = [];
  for (let index = 0; index < sheetNames.length; index += 1) {
    const sheetName = sheetNames[index];
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1.5, format: "png" });
    const outputPath = `${outputBase}${index ? `-${index + 1}` : ""}.png`;
    await fs.writeFile(outputPath, new Uint8Array(await preview.arrayBuffer()));
    rendered.push(outputPath);
  }
  report.push({ inputPath, sheetNames, formulaErrors: formulas.ndjson, rendered });
}
console.log(JSON.stringify(report, null, 2));
