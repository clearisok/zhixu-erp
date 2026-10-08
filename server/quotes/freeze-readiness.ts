import { parseQuoteFreezeEvidence, type QuoteFreezeEvidence, type QuoteSourceIdentity } from "./guarded-import-evidence.js";

export type FrozenBuildExpectation = {
  browserOrigin: string; gitCommit: string; buildId: string; buildTime: string;
  identityMode: "session" | "local-single-user";
};
function requireValue(value: unknown): asserts value {
  if (!value) throw new Error("quote_freeze_verification_failed");
}
function timestamp(value: string): number {
  requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value));
  const result = Date.parse(value); requireValue(Number.isFinite(result)); return result;
}
/** Build identity permits the repository's ISO-8601 offset; Q5-B evidence timestamps remain UTC Z. */
function buildIdentityTimestamp(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(match);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  requireValue(year >= 1000 && month >= 1 && month <= 12 && day >= 1
    && day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
    && hour <= 23 && minute <= 59 && second <= 59);
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    requireValue(offsetHour <= 23 && offsetMinute <= 59);
  }
  requireValue(Number.isFinite(Date.parse(value)));
}
export async function verifyQuoteFrozenBuild(expected: FrozenBuildExpectation, fetcher: typeof fetch = fetch) {
  const origin = new URL(expected.browserOrigin);
  requireValue(origin.origin === expected.browserOrigin && ["http:", "https:"].includes(origin.protocol));
  requireValue(/^[a-f0-9]{40}$/.test(expected.gitCommit));
  requireValue(/^[A-Za-z0-9_.:@/-]{1,128}$/.test(expected.buildId));
  buildIdentityTimestamp(expected.buildTime);
  requireValue(["session", "local-single-user"].includes(expected.identityMode));
  const url = `${origin.origin}/build-info.json`;
  const response = await fetcher(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  requireValue(response.ok && !response.redirected && response.url === url);
  const info: unknown = await response.json();
  requireValue(info && typeof info === "object" && !Array.isArray(info));
  const row = info as Record<string, unknown>;
  for (const key of ["gitCommit", "buildId", "buildTime", "identityMode"] as const) requireValue(row[key] === expected[key]);
  requireValue(row.quoteWriterMode === "frozen" && row.masterSettingsAuthority === "server");
  return { ...expected, quoteWriterMode: "frozen" as const, masterSettingsAuthority: "server" as const };
}

/** Preparation is deliberately NOT the Q5-B final freeze proof: no capture claim exists yet. */
export async function prepareQuoteFreezeEvidence(input: FrozenBuildExpectation & {
  profileLabel: string; runtimeIdentity: string; freezeStartedAt: string; oldTabsClosedAt: string;
  frozenReopenedAt: string; verifiedAt: string; operatorConfirmedOldTabsClosed: boolean;
}, fetcher: typeof fetch = fetch) {
  requireValue(input.operatorConfirmedOldTabsClosed === true);
  const times = [input.freezeStartedAt, input.oldTabsClosedAt, input.frozenReopenedAt, input.verifiedAt].map(timestamp);
  requireValue(times.every((time, i) => i === 0 || time >= times[i - 1]));
  for (const label of [input.profileLabel, input.runtimeIdentity])
    requireValue(/^[A-Za-z0-9_.:@/-]{1,128}$/.test(label) && !/password|secret|token|cookie/i.test(label));
  await verifyQuoteFrozenBuild(input, fetcher);
  return { contract: "quote-writer-freeze-preparation.v1" as const,
    browserOrigin: input.browserOrigin, profileLabel: input.profileLabel, reviewedCommit: input.gitCommit,
    buildId: input.buildId, runtimeIdentity: input.runtimeIdentity, freezeStartedAt: input.freezeStartedAt,
    oldTabsClosedAt: input.oldTabsClosedAt, frozenReopenedAt: input.frozenReopenedAt,
    verifiedAt: input.verifiedAt, quoteWritesDisabled: true as const };
}

/** Only after capture: explicit operator attestation AND equal raw-source digests. */
export function finalizeQuoteFreezeEvidence(preparation: Awaited<ReturnType<typeof prepareQuoteFreezeEvidence>>,
  source: QuoteSourceIdentity, capture: { beforeSha256: string; afterSha256: string; checkedAt: string; operatorConfirmedNoMutation: boolean }): QuoteFreezeEvidence {
  requireValue(preparation.contract === "quote-writer-freeze-preparation.v1");
  requireValue(capture.operatorConfirmedNoMutation === true && /^[a-f0-9]{64}$/.test(capture.beforeSha256)
    && capture.beforeSha256 === capture.afterSha256 && timestamp(capture.checkedAt) >= timestamp(source.capturedAt));
  return parseQuoteFreezeEvidence({ ...preparation, contract: "quote-writer-freeze.v1", noMutationAfterCapture: true }, source);
}
