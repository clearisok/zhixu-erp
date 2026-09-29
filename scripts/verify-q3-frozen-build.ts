import { mkdir, realpath, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { validateFreezeEvidence, verifyRunningFrozenBuild, type FrozenBuildIdentity, type Q3FreezeEvidence } from "../server/quote-masters/import-readiness.js";

function argumentsFrom(argv: string[]): Record<string, string> {
  const allowed = new Set(["origin", "namespace", "schema-version", "commit", "build-id", "build-time", "freeze-started-at", "operator", "browser-profile", "evidence",
    "split-static-container-name", "split-static-container-id", "split-static-image-id"]);
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/u, "");
    if (!key || !allowed.has(key) || !argv[index]?.startsWith("--") || !argv[index + 1] || result[key]) throw new Error("invalid_frozen_verifier_arguments");
    result[key] = argv[index + 1];
  }
  return result;
}

async function main(argv: string[]): Promise<void> {
  const verifyOnly = argv.indexOf("--verify-only");
  if (verifyOnly >= 0) {
    if (argv.lastIndexOf("--verify-only") !== verifyOnly) throw new Error("frozen_verifier_arguments_invalid");
    const input = argumentsFrom(argv.filter((_, index) => index !== verifyOnly));
    if (Object.keys(input).sort().join(",") !== "build-id,build-time,commit,origin") throw new Error("frozen_verifier_arguments_invalid");
    await verifyRunningFrozenBuild(input.origin, {
      gitCommit: input.commit, buildId: input["build-id"], buildTime: input["build-time"], masterSettingsAuthority: "frozen",
    });
    process.stdout.write(`${JSON.stringify({ event: "q3_frozen_build_verify_only", result: "PASS", authority: "frozen" })}\n`);
    return;
  }
  const confirmation = argv.indexOf("--confirm-old-tabs-closed");
  if (confirmation < 0 || argv.lastIndexOf("--confirm-old-tabs-closed") !== confirmation) throw new Error("old_tab_confirmation_invalid");
  const input = argumentsFrom(argv.filter((_, index) => index !== confirmation));
  const splitKeys = ["split-static-container-name", "split-static-container-id", "split-static-image-id"];
  const splitCount = splitKeys.filter((key) => Boolean(input[key])).length;
  if ((Object.keys(input).length !== 10 && Object.keys(input).length !== 13) || (splitCount !== 0 && splitCount !== 3)) {
    throw new Error("frozen_verifier_arguments_missing");
  }
  if (!/^[A-Za-z0-9_.:@/-]{1,128}$/u.test(input.operator) || !/^[A-Za-z0-9_.:@/-]{1,128}$/u.test(input["browser-profile"])) {
    throw new Error("freeze_operator_label_invalid");
  }
  let splitRuntime: { startedAt: string; restartCount: number } | undefined;
  if (splitCount === 3) {
    let container: Record<string, unknown>;
    try {
      const inspected = JSON.parse(execFileSync("docker", ["inspect", "--type", "container", input["split-static-container-name"]],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) as unknown;
      container = (inspected as Record<string, unknown>[])[0];
    } catch { throw new Error("split_frontend_identity_unavailable"); }
    const state = container.State as Record<string, unknown> | undefined;
    const network = container.NetworkSettings as Record<string, unknown> | undefined;
    const ports = network?.Ports as Record<string, Array<{ HostIp: string; HostPort: string }>> | undefined;
    const config = container.Config as Record<string, unknown> | undefined;
    const labels = config?.Labels as Record<string, string> | undefined;
    if (container.Name !== `/${input["split-static-container-name"]}` || container.Id !== input["split-static-container-id"] ||
      container.Image !== input["split-static-image-id"] || state?.Running !== true ||
      labels?.["io.zhixu.maintenance-static"] !== "true" || labels?.["com.docker.compose.project"] ||
      (container.Mounts as unknown[])?.length !== 0 ||
      ports?.["3000/tcp"]?.length !== 1 || ports["3000/tcp"][0].HostIp !== "127.0.0.1" ||
      ports["3000/tcp"][0].HostPort !== new URL(input.origin).port) throw new Error("split_frontend_identity_mismatch");
    if (typeof state.StartedAt !== "string" || typeof container.RestartCount !== "number") throw new Error("split_frontend_runtime_invalid");
    splitRuntime = { startedAt: state.StartedAt, restartCount: container.RestartCount };
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
    ...(splitCount === 3 ? { frozenFrontend: { topology: "split" as const,
      containerName: input["split-static-container-name"], containerId: input["split-static-container-id"],
      imageId: input["split-static-image-id"], startedAt: splitRuntime!.startedAt,
      restartCount: splitRuntime!.restartCount } } : {}),
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
