import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseQuoteAuthority, validateQuoteAuthority } from "../features/quote-center/authority/quote-authority.js";

export type RuntimeBuildIdentity = {
  gitCommit: string;
  buildId: string;
  buildTime: string;
  masterSettingsAuthority: "browser" | "frozen" | "server";
  identityMode: "session" | "local-single-user";
  quoteWriterMode: "writable" | "frozen";
  quoteAuthority?: "browser" | "server";
};

/** Never let runtime configuration claim an authority other than the compiled bundle. */
export async function assertRuntimeBuildIdentity(
  staticDirectory: string,
  expectedAuthority?: RuntimeBuildIdentity["masterSettingsAuthority"],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<RuntimeBuildIdentity> {
  let value: unknown;
  try { value = JSON.parse(await readFile(resolve(staticDirectory, "build-info.json"), "utf8")) as unknown; }
  catch { throw new Error("compiled_build_identity_unavailable"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("compiled_build_identity_invalid");
  const info = value as Record<string, unknown>;
  if (info.quoteAuthority !== undefined && info.quoteAuthority !== "browser" && info.quoteAuthority !== "server") throw new Error("compiled_build_identity_invalid");
  const compiledQuoteAuthority = parseQuoteAuthority(info.quoteAuthority as string | undefined);
  validateQuoteAuthority(compiledQuoteAuthority, String(info.masterSettingsAuthority), String(info.quoteWriterMode));
  if (parseQuoteAuthority(environment.NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY) !== compiledQuoteAuthority) throw new Error("runtime_compiled_build_identity_mismatch");
  if (typeof info.gitCommit !== "string" || !info.gitCommit ||
      typeof info.buildId !== "string" || !info.buildId ||
      typeof info.buildTime !== "string" || !info.buildTime ||
      !["browser", "frozen", "server"].includes(String(info.masterSettingsAuthority)) ||
      !["writable", "frozen"].includes(String(info.quoteWriterMode)) ||
      !["session", "local-single-user"].includes(String(info.identityMode))) {
    throw new Error("compiled_build_identity_invalid");
  }
  for (const [key, actual] of [
    ["ZHIXU_GIT_COMMIT", info.gitCommit],
    ["ZHIXU_BUILD_ID", info.buildId],
    ["ZHIXU_BUILD_TIME", info.buildTime],
    ["NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY", info.masterSettingsAuthority],
    ["ZHIXU_IDENTITY_MODE", info.identityMode],
    ["NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE", info.quoteWriterMode],
  ] as const) {
    const configured = key === "NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE" ? (environment[key] || "writable") : environment[key];
    if (configured !== actual) throw new Error("runtime_compiled_build_identity_mismatch");
  }
  if (expectedAuthority && info.masterSettingsAuthority !== expectedAuthority) throw new Error("unexpected_compiled_authority");
  return info as RuntimeBuildIdentity;
}
