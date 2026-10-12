import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateBundle } from "../ainuoke-source/contract.js";
import { parseCollectorConfig, readPrivateCollectorConfig } from "../ainuoke-source/collector.js";
import { sourceReadConfig } from "../ainuoke-source/reader.js";
import { bundle, syntheticOrder, syntheticFetchedAt } from "./ainuoke-source-fixture.js";
const targets = [{ ...syntheticOrder, id: "11111111-1111-4111-8111-111111111111", version: 1 }];
const now = Date.parse(syntheticFetchedAt);
test("default capability is disabled; invalid mode/age/identity fail closed", () => {
    assert.equal(sourceReadConfig({}, "session"), null);
    for (const values of [{ ZHIXU_AINUOKE_SOURCE_READ: "true" }, { ZHIXU_AINUOKE_SOURCE_READ: "snapshot", ZHIXU_AINUOKE_SOURCE_KEY: "team", ZHIXU_AINUOKE_SOURCE_MAX_AGE_MS: "Infinity" }])
        assert.throws(() => sourceReadConfig(values, "session"));
    assert.throws(() => sourceReadConfig({ ZHIXU_AINUOKE_SOURCE_READ: "snapshot", ZHIXU_AINUOKE_SOURCE_KEY: "team", ZHIXU_AINUOKE_SOURCE_MAX_AGE_MS: "1000" }, "local-single-user"));
});
test("same existing material algorithm accepts the four event streams, preserves null and factory exclusion", async () => {
    const result = await validateBundle(bundle(), targets, now, 1000);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].contract, syntheticOrder.salesContractNo);
});
test("missing pages, foreign contracts, secret fields, future timestamps and discovery drift reject", async () => {
    const mutate: ((b: ReturnType<typeof bundle>) => void)[] = [
        b => { b.materials[syntheticOrder.salesContractNo][0].total++; },
        b => { b.materials[syntheticOrder.salesContractNo][0].rows[0].values.ExpContractNo = "OTHER"; },
        b => { b.discoveryBefore[0].rows[0].values.password = "never-log-me"; },
        b => { b.discoveryAfter[0].fetchedAt = new Date(now + 1).toISOString(); },
        b => { b.discoveryAfter[0].rows[0].values.InsideOrderNo = "CHANGED"; },
        b => { b.materials[syntheticOrder.salesContractNo][0].queryContext.insideOrderNo = "WRONG"; },
    ];
    for (const edit of mutate) {
        const b = bundle();
        edit(b);
        await assert.rejects(validateBundle(b, targets, now, 1000));
    }
});
test("credential config rejects plaintext remote origins, URL secrets, paths and arbitrary keys", () => {
    const cfg = { sourceKey: "first-team", baseUrl: "https://example.invalid", username: "合成账号", password: "synthetic-password", operatorUsername: "synthetic.admin" };
    assert.equal(parseCollectorConfig(cfg).baseUrl, "https://example.invalid");
    for (const baseUrl of ["http://example.invalid", "https://u:p@example.invalid", "https://example.invalid/path", "https://example.invalid/?secret=x"])
        assert.throws(() => parseCollectorConfig({ ...cfg, baseUrl }));
    assert.throws(() => parseCollectorConfig({ ...cfg, reportId: "uncontrolled" }));
});
test("private credential file rejects unsupported platform, broad permissions and symlinks", () => {
    const dir = mkdtempSync(join(tmpdir(), "zhixu-source-secret-test-")), path = join(dir, "private.json");
    try {
        writeFileSync(path, JSON.stringify({ sourceKey: "first-team", baseUrl: "https://example.invalid", username: "synthetic", password: "synthetic-password", operatorUsername: "synthetic.admin" }), { mode: 0o600 });
        if (process.platform === "win32") {
            assert.throws(() => readPrivateCollectorConfig(path), /private_posix_config_required/);
            return;
        }
        assert.equal(readPrivateCollectorConfig(path).sourceKey, "first-team");
        chmodSync(path, 0o644);
        assert.throws(() => readPrivateCollectorConfig(path), /private_config_permissions/);
        chmodSync(path, 0o600);
        const link = join(dir, "link");
        symlinkSync(path, link);
        assert.throws(() => readPrivateCollectorConfig(link), /private_config_permissions/);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
