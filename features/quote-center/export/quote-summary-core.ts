import ExcelJS from "exceljs";
export type SummaryCell = { value: string | number | null; numberFormat?: string; note?: string };
export type SummaryTable = { headers: string[]; rows: SummaryCell[][]; now?: Date; wrapBody?: boolean };
/** Shared ExcelJS construction only. No Browser IO, Quote loading or business calculation. */
export async function buildQuoteSummaryTable(input: SummaryTable) {
  const now = input.now ?? new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "织序 ERP"; workbook.created = now;
  const sheet = workbook.addWorksheet("报价汇总", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(input.headers);
  for (const row of input.rows) {
    if (row.length !== input.headers.length) throw new Error("Invalid summary row shape");
    if (row.some(cell => typeof cell.value === "number" && !Number.isFinite(cell.value))) throw new Error("Unsafe summary number");
    const added = sheet.addRow(row.map(cell => cell.value));
    row.forEach((cell, i) => { if (cell.numberFormat) added.getCell(i + 1).numFmt = cell.numberFormat; if (cell.note) added.getCell(i + 1).note = cell.note; });
    if (input.wrapBody) added.height = Math.min(110, Math.max(28, ...row.map(cell => Math.ceil(String(cell.value ?? "").length / 20) * 16)));
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: input.headers.length } };
  sheet.getRow(1).height = 42;
  sheet.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF164D3A" } }; cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
  sheet.columns.forEach((column, index) => { const longest = Math.max(input.headers[index]?.length ?? 8, ...input.rows.map(row => String(row[index]?.value ?? "").length)); column.width = Math.min(34, Math.max(12, longest * 1.6)); });
  for (let row = 2; row <= sheet.rowCount; row++) sheet.getRow(row).eachCell(cell => { cell.alignment = { vertical: "middle", ...(input.wrapBody ? { wrapText: true } : {}) }; cell.border = { bottom: { style: "hair", color: { argb: "FFE4E1DA" } } }; });
  const output = await workbook.xlsx.writeBuffer();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return { buffer: new Uint8Array(output as ArrayBuffer).buffer, fileName: `报价汇总_${stamp}.xlsx`, rowCount: input.rows.length, headers: input.headers };
}
