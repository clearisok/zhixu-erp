import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { previewMasterSettingsBackup } from "../features/basic-settings/server/master-settings-backup-preview.js";
import { runQuoteMasterSettingsDisposableRehearsal } from "../server/integration/quote-master-settings-rehearsal.js";

function argumentsFrom(argv: string[]): { backup: string; expectedSourceHash: string } {
  const backupIndex = argv.indexOf("--backup");
  const hashIndex = argv.indexOf("--expected-source-hash");
  const backup = backupIndex >= 0 ? argv[backupIndex + 1] : undefined;
  const expectedSourceHash = hashIndex >= 0 ? argv[hashIndex + 1] : undefined;
  if (!backup || !expectedSourceHash || argv.length !== 4 || !/^[a-f0-9]{64}$/u.test(expectedSourceHash)) {
    throw new Error("Usage: npm run rehearse:quote-master-settings -- --backup <backup.json> --expected-source-hash <sha256>");
  }
  return { backup: resolve(backup), expectedSourceHash };
}

const input = argumentsFrom(process.argv.slice(2));
const backup = JSON.parse(await readFile(input.backup, "utf8")) as unknown;
const preview = await previewMasterSettingsBackup(backup);
const rehearsal = await runQuoteMasterSettingsDisposableRehearsal(preview, input.expectedSourceHash);
const result = {
  capture: preview.capture,
  sourceHash: preview.sourceHash,
  expectedSourceHash: input.expectedSourceHash,
  hashMatches: rehearsal.sourceHashMatches,
  blockingErrors: preview.preview.blockingErrors.length,
  sensitiveFields: preview.sensitiveFieldPaths.length,
  previewEvidence: {
    sourceCounts: preview.preview.sourceCounts,
    projectedCounts: preview.preview.projectedCounts,
    projectedServerRows: preview.preview.projectedServerRows,
    canonicalDecimalValuesProjected: preview.preview.canonicalDecimalValuesProjected,
    nullDecimalValuesPreserved: preview.preview.nullDecimalValuesPreserved,
    zeroDecimalValuesPreserved: preview.preview.zeroDecimalValuesPreserved,
    invalidNumericValues: preview.preview.invalidNumericValues.length,
    discardedLegacyDefaultTrimQuantityCount: preview.preview.discardedLegacyDefaultTrimQuantityCount,
    discardedLegacyDefaultTrimUsageCount: preview.preview.discardedLegacyDefaultTrimUsageCount,
    legacyMultipleDefaultCostCollapseCount: preview.preview.legacyMultipleDefaultCostCollapseCount,
    inactiveManufacturingPresetDefault: preview.preview.inactiveManufacturingPresetDefault,
    warnings: preview.preview.warnings,
  },
  rehearsal,
  auditPolicy: "UNCONFIRMED_NO_RUNTIME_OPERATION_LOGS_WRITTEN",
  writes: {
    browser: 0,
    browserOperationLogs: 0,
    realPostgres: 0,
    quote: 0,
    salesOrder: 0,
  },
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!rehearsal.ready) process.exitCode = 2;
