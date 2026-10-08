import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { verifyQuoteFrozenBuild, prepareQuoteFreezeEvidence, finalizeQuoteFreezeEvidence } from "./freeze-readiness.js";
import type { QuoteSourceIdentity } from "./guarded-import-evidence.js";

test("Q5 verifies exact frozen build and stages capture evidence without invented attestations", async () => {
  const info = { gitCommit: "a".repeat(40), buildId: "synthetic", buildTime: "2026-10-07T00:00:00Z",
    identityMode: "local-single-user" as const, masterSettingsAuthority: "server", quoteWriterMode: "frozen" };
  const server = createServer((_request, response) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(info)); });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  assert.ok(![3001, 3002].includes(address.port));
  const expected = { ...info, browserOrigin: `http://127.0.0.1:${address.port}` };
  try {
    assert.equal((await verifyQuoteFrozenBuild(expected)).quoteWriterMode, "frozen");
    info.buildTime = "2026-10-07T23:00:00+08:00";
    assert.equal((await verifyQuoteFrozenBuild({ ...expected, buildTime: info.buildTime })).buildTime, info.buildTime);
    info.buildTime = expected.buildTime;
    for (const invalid of ["invalid text", "2026-02-30T15:00:00Z", "2026-13-07T15:00:00Z",
      "2026-10-07T24:00:00Z", "2026-10-07T23:60:00+08:00", "2026-10-07T23:00:00+24:00"])
      await assert.rejects(verifyQuoteFrozenBuild({ ...expected, buildTime: invalid }));
    await assert.rejects(verifyQuoteFrozenBuild({ ...expected, gitCommit: info.gitCommit.slice(0, 7) }));
    for (const change of [{ gitCommit: "b".repeat(40) }, { buildId: "wrong" }, { buildTime: "2026-10-06T00:00:00Z" },
      { browserOrigin: `${expected.browserOrigin}/wrong` }]) await assert.rejects(verifyQuoteFrozenBuild({ ...expected, ...change }));
    info.quoteWriterMode = "writable";
    await assert.rejects(verifyQuoteFrozenBuild(expected)); info.quoteWriterMode = "frozen";
    info.masterSettingsAuthority = "frozen";
    await assert.rejects(verifyQuoteFrozenBuild(expected)); info.masterSettingsAuthority = "server";
    const input = { ...expected, profileLabel: "isolated", runtimeIdentity: "synthetic-runtime", freezeStartedAt: "2026-10-07T00:01:00Z",
      oldTabsClosedAt: "2026-10-07T00:02:00Z", frozenReopenedAt: "2026-10-07T00:03:00Z", verifiedAt: "2026-10-07T00:04:00Z",
      operatorConfirmedOldTabsClosed: true };
    await assert.rejects(prepareQuoteFreezeEvidence({ ...input, operatorConfirmedOldTabsClosed: false }));
    await assert.rejects(prepareQuoteFreezeEvidence({ ...input, freezeStartedAt: "2026-10-07T08:01:00+08:00" }));
    await assert.rejects(prepareQuoteFreezeEvidence({ ...input, oldTabsClosedAt: input.freezeStartedAt.replace("00:01", "00:05") }));
    const preparation = await prepareQuoteFreezeEvidence(input);
    assert.equal(Object.hasOwn(preparation, "noMutationAfterCapture"), false);
    const source = { origin: expected.browserOrigin, reviewedCommit: info.gitCommit,
      capturedAt: "2026-10-07T00:05:00Z", fileModifiedAt: "2026-10-07T00:06:00Z" } as QuoteSourceIdentity;
    const capture = { beforeSha256: "a".repeat(64), afterSha256: "a".repeat(64), checkedAt: source.fileModifiedAt, operatorConfirmedNoMutation: true };
    assert.equal(finalizeQuoteFreezeEvidence(preparation, source, capture).contract, "quote-writer-freeze.v1");
    for (const change of [{ operatorConfirmedNoMutation: false }, { afterSha256: "b".repeat(64) }, { checkedAt: input.verifiedAt }])
      assert.throws(() => finalizeQuoteFreezeEvidence(preparation, source, { ...capture, ...change }));
  } finally { await new Promise<void>((done) => server.close(() => done())); }
});
