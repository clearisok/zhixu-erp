import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { previewHistoricalQuoteBackup, QuoteBackupContractError } from "../server/quotes/historical-preview.js";

function sourcePath(args: string[]): string {
  if (args.length !== 2 || args[0] !== "--backup" || !args[1])
    throw new Error("Usage: npm run preview:quote-history -- --backup <standard-backup.json>");
  return resolve(args[1]);
}

try {
  const bytes = await readFile(sourcePath(process.argv.slice(2)));
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const report = previewHistoricalQuoteBackup(JSON.parse(bytes.toString("utf8")) as unknown);
  // The projection contains business snapshots and is deliberately not printed.
  const { projection: _projection, ...safe } = report;
  void _projection;
  process.stdout.write(`${JSON.stringify({ ...safe, fileSha256 }, null, 2)}\n`);
  if (report.blockers.length) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof QuoteBackupContractError ? error.message : "quote_history_preview_failed" })}\n`);
  process.exitCode = 1;
}
