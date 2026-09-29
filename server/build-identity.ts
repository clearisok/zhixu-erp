import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type RuntimeBuildIdentity = {
  gitCommit: string;
  buildId: string;
  buildTime: string;
  masterSettingsAuthority: "browser" | "frozen" | "server";
};

/** Never let runtime configuration claim an authority other than the compiled bundle. */
export async function assertRuntimeBuildIdentity(
  staticDirectory: string,
  expectedAuthority?: RuntimeBuildIdentity["masterSettingsAuthority"],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeBuildIdentity> {
  let value: unknown;
  try { value = JSON.parse(await readFile(resolve(staticDirectory, "build-info.json"), "utf8")) as unknown; }
  catch { throw new Error("compiled_build_identity_unavailable"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("compiled_build_identity_invalid");
  const info = value as Record<string, unknown>;
  if (typeof info.gitCommit !== "string" || !info.gitCommit ||
      typeof info.buildId !== "string" || !info.buildId ||
      typeof info.buildTime !== "string" || !info.buildTime ||
      !["browser", "frozen", "server"].includes(String(info.masterSettingsAuthority))) {
    throw new Error("compiled_build_identity_invalid");
  }
  for (const [key, actual] of [
    ["ZHIXU_GIT_COMMIT", info.gitCommit],
    ["ZHIXU_BUILD_ID", info.buildId],
    ["ZHIXU_BUILD_TIME", info.buildTime],
    ["NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY", info.masterSettingsAuthority],
  ] as const) {
    if (environment[key] !== actual) throw new Error("runtime_compiled_build_identity_mismatch");
  }
  if (expectedAuthority && info.masterSettingsAuthority !== expectedAuthority) throw new Error("unexpected_compiled_authority");
  return info as RuntimeBuildIdentity;
}
