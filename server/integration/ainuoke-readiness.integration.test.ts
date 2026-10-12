import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeSource, readinessFingerprint } from "../ainuoke-source/readiness.js";

test("real Python probe uses synthetic upstream only and reveals no raw values", { timeout: 60000 }, async t => {
  let logins = 0; const reports: number[] = []; let mode = "ok";
  const upstream = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const path = new URL(req.url!, "http://127.0.0.1").pathname;
    if (path === "/kaijin/system/user/loginsys2") {
      logins++;
      if (mode === "redirect") { res.statusCode = 302; res.setHeader("Location", "/credential-sink"); res.end(); return; }
      res.end(JSON.stringify({ data: { isOk: true, jwtToken: "SECRET_TOKEN_SENTINEL", sessionId: "SESSION_SENTINEL" } })); return;
    }
    assert.equal(path, "/kaijin/report/report/getReportObjAndData"); assert.equal(req.method, "POST");
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks).toString()); reports.push(request.reportId);
    assert.ok([6086103, 6087105, 6087050].includes(request.reportId));
    if (mode === "expired") { res.statusCode = 401; res.end("SECRET_ERROR_SENTINEL"); return; }
    const rows = mode === "empty" ? [] : request.reportId === 6086103
      ? [{ BillNo: "PRIVATE_CONTRACT_SENTINEL", InsideOrderNo: "PRIVATE_INSIDE_SENTINEL" }]
      : [{ privateValue: "PRIVATE_ROW_SENTINEL" }];
    res.end(JSON.stringify({ reObj: { isOk: true }, dataCount: mode === "partial" ? 2 : rows.length, pageIndex: 0, pageSize: 0, dataList: JSON.stringify({ rows }) }));
  });
  await new Promise<void>(done => upstream.listen(0, "127.0.0.1", done));
  const address = upstream.address(); assert.ok(address && typeof address === "object");
  const cfg = { sourceKey: "synthetic", baseUrl: "http://127.0.0.1:" + address.port, username: "SYNTHETIC_USER_SENTINEL", password: "SECRET_PASSWORD_SENTINEL", operatorUsername: "synthetic.operator" };
  const pin = readinessFingerprint(cfg);
  try {
    const summary = await probeSource(cfg, pin, true);
    assert.equal(logins, 1); assert.deepEqual(reports, [6086103, 6087105, 6087050]);
    assert.equal(JSON.stringify(summary).includes("SENTINEL"), false);
    assert.ok(summary.reports.every(r => r.status === "readable"));
    await t.test("empty discovery cannot claim color/material access", async () => {
      mode = "empty"; reports.length = 0;
      const result = await probeSource(cfg, pin, true);
      assert.deepEqual(reports, [6086103]); assert.equal(result.reports[1].status, "not-probed"); assert.equal(result.reports[2].status, "not-probed");
    });
    await t.test("auth expiry, partial page and redirect fail without relogin or secret reflection", async () => {
      for (const fault of ["expired", "partial", "redirect"]) {
        mode = fault; const before = logins;
        await assert.rejects(probeSource(cfg, pin, true), error => {
          assert.equal(String(error).includes("SENTINEL"), false);
          assert.match(String(error), /auth_expired|source_invalid/); return true;
        });
        assert.equal(logins, before + 1);
      }
    });
    await t.test("Linux CLI validates private file and probes with unusable DATABASE_URL", { skip: process.platform === "win32" }, async () => {
      mode = "ok"; const dir = await mkdtemp(join(tmpdir(), "zhixu-readiness-")); const path = join(dir, "source.json");
      try {
        await writeFile(path, JSON.stringify(cfg), { mode: 0o600 });
        const run = (args: string[]) => promisify(execFile)(process.execPath, ["--import", "tsx", "server/ainuoke-source/readiness.ts", ...args], {
          env: { ...process.env, DATABASE_URL: "invalid-database-url-must-never-be-used", ZHIXU_IDENTITY_MODE: "invalid-must-never-be-used" }, timeout: 20000, encoding: "utf8",
        });
        const before = logins; const checked = JSON.parse((await run(["--check", "--config=" + path])).stdout);
        assert.equal(logins, before); assert.equal(checked.result, "CHECKED_NO_SOURCE_READ_NO_DATABASE"); assert.equal(checked.sourceFingerprint, pin);
        await assert.rejects(run(["--probe", "--config=" + path, "--expected-source=" + pin]), /verified_tunnel_required/);
        await assert.rejects(run(["--probe", "--config=" + path, "--expected-source=" + "0".repeat(64), "--verified-tunnel"]), /source_target_mismatch/);
        assert.equal(logins, before);
        const output = await run(["--probe", "--config=" + path, "--expected-source=" + pin, "--verified-tunnel"]);
        const result = JSON.parse(output.stdout);
        assert.equal(result.result, "READ_ONLY_CONNECTION_PROBED"); assert.equal(result.sourceActivation, "not-activated");
        assert.equal(result.operatorAuthorization, "not-checked"); assert.equal((output.stdout + output.stderr).includes("SENTINEL"), false);
      } finally { await rm(dir, { recursive: true, force: true }); }
    });
  } finally { await new Promise<void>(done => upstream.close(() => done())); }
});
