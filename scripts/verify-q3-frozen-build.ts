import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { validateFreezeEvidence, verifyRunningFrozenBuild, type FrozenBuildIdentity, type Q3FreezeEvidence } from "../server/quote-masters/import-readiness.js";

function argumentsFrom(argv: string[]): Record<string, string> {
  const allowed = new Set(["origin", "namespace", "schema-version", "commit", "build-id", "build-time", "freeze-started-at", "operator", "browser-profile", "evidence"]);
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/u, "");
    if (!key || !allowed.has(key) || !argv[index]?.startsWith("--") || !argv[index + 1] || result[key]) throw new Error("invalid_frozen_verifier_arguments");
    result[key] = argv[index + 1];
  }
  if (Object.keys(result).length !== allowed.size || !argv.includes("--confirm-old-tabs-closed")) throw new Error("explicit_old_tab_closure_confirmation_required");
  return result;
}

async function main(argv: string[]): Promise<void> {
  const confirmation = argv.indexOf("--confirm-old-tabs-closed");
  if (confirmation < 0 || argv.lastIndexOf("--confirm-old-tabs-closed") !== confirmation) throw new Error("old_tab_confirmation_invalid");
  const input = argumentsFrom(argv.filter((_, index) => index !== confirmation));
  if (!/^[A-Za-z0-9_.:@/-]{1,128}$/u.test(input.operator) || !/^[A-Za-z0-9_.:@/-]{1,128}$/u.test(input["browser-profile"])) {
    throw new Error("freeze_operator_label_invalid");
  }
  const expected: FrozenBuildIdentity = {
    gitCommit: input.commit,
    buildId: input["build-id"],
    buildTime: input["build-time"],
    masterSettingsAuthority: "frozen",
  };
  const observed = await verifyRunningFrozenBuild(input.origin, expected);
  const evidence: Q3FreezeEvidence = validateFreezeEvidence({
    evidenceVersion: 1,
    result: "PASS",
    browserOrigin: input.origin,
    browserProfileLabel: input["browser-profile"],
    namespace: input.namespace,
    schemaVersion: Number(input["schema-version"]),
    expected,
    observed,
    freezeStartedAt: input["freeze-started-at"],
    verifiedAt: new Date().toISOString(),
    operatorLabel: input.operator,
    allOldTabsClosedBeforeFrozenReopen: true,
  }, { origin: input.origin, namespace: input.namespace, schemaVersion: Number(input["schema-version"]), commit: input.commit, buildId: input["build-id"] });
  const output = input.evidence;
  const backupRoot = resolve("backups");
  const within = (target: string): boolean => {
    const path = relative(backupRoot, target);
    return path !== "" && path !== ".." && !path.startsWith("../") && !path.startsWith("..\\") && !isAbsolute(path);
  };
  if (!isAbsolute(output) || resolve(output) !== output || !within(output)) throw new Error("evidence_path_must_be_git_ignored_backup_directory");
  await mkdir(dirname(output), { recursive: true });
  const parent = await realpath(dirname(output));
  if (!within(parent)) throw new Error("evidence_parent_changed");
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ event: "q3_frozen_build_verified", result: "PASS", evidencePath: output, authority: "frozen", oldTabs: "operator_attested" }) + "\n");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ event: "q3_frozen_build_failed", code: error instanceof Error ? error.message : "unknown_failure" }) + "\n");
  process.exitCode = 1;
});
