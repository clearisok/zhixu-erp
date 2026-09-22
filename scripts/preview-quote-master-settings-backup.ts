import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { previewMasterSettingsBackup } from "../features/basic-settings/server/master-settings-backup-preview";

function backupPath(argv: string[]): string {
  const index = argv.indexOf("--backup");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || argv.length !== 2) throw new Error("Usage: npm run preview:quote-master-settings -- --backup <backup.json>");
  return resolve(value);
}

const path = backupPath(process.argv.slice(2));
const raw = await readFile(path, "utf8");
const report = await previewMasterSettingsBackup(JSON.parse(raw) as unknown);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.preview.blockingErrors.length) process.exitCode = 2;
