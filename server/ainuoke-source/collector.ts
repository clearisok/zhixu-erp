import { spawn } from "node:child_process";
import { constants, openSync, closeSync, fstatSync, lstatSync, readSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { SourceError, hash, sourceKeyValid } from "./contract.js";
export type CollectorConfig = {
    sourceKey: string;
    baseUrl: string;
    username: string;
    password: string;
    operatorUsername: string;
};
export function parseCollectorConfig(input: unknown): CollectorConfig {
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new SourceError("invalid_collector_configuration");
    const o = input as Record<string, unknown>;
    if (Object.keys(o).sort().join(",") !== "baseUrl,operatorUsername,password,sourceKey,username"
        || Object.values(o).some(v => typeof v !== "string" || !v.trim() || v.length > 1024 || /[\u0000-\u001f\u007f]/u.test(v))
        || !sourceKeyValid(o.sourceKey as string))
        throw new SourceError("invalid_collector_configuration");
    let u: URL;
    try {
        u = new URL(o.baseUrl as string);
    }
    catch {
        throw new SourceError("invalid_source_origin");
    }
    if (u.username || u.password || u.search || u.hash || u.pathname !== "/"
        || !(u.protocol === "https:" || u.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(u.hostname)))
        throw new SourceError("protected_source_transport_required");
    return { ...o, baseUrl: u.origin } as CollectorConfig;
}
export function readPrivateCollectorConfig(path: string): CollectorConfig {
    let fd: number | undefined;
    try {
        // This operator secret loader targets Linux. Windows Bridge credentials are never reused.
        if (process.platform === "win32" || !isAbsolute(path))
            throw new SourceError("private_posix_config_required");
        const before = lstatSync(path);
        if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) !== 0 || before.uid !== process.getuid?.())
            throw new SourceError("private_config_permissions");
        fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const s = fstatSync(fd);
        if (!s.isFile() || s.ino !== before.ino || s.dev !== before.dev || s.size > 16384 || (s.mode & 0o077) !== 0 || s.uid !== process.getuid?.())
            throw new SourceError("private_config_permissions");
        const buffer = Buffer.alloc(16385);
        const length = readSync(fd, buffer, 0, buffer.length, 0);
        const raw = buffer.subarray(0, length);
        if (raw.length > 16384)
            throw new SourceError("private_config_invalid");
        return parseCollectorConfig(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
    }
    catch (error) {
        throw error instanceof SourceError ? error : new SourceError("private_config_invalid");
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
    }
}
export const accountFingerprint = (config: CollectorConfig) => hash({ origin: config.baseUrl, username: config.username.normalize("NFKC").trim() });
export function collectWithPython(config: CollectorConfig, contracts: string[], options: {
    python?: string;
    timeoutMs?: number;
} = {}): Promise<unknown> {
    return new Promise((resolveResult, reject) => {
        const child = spawn(options.python ?? (process.platform === "win32" ? "python" : "python3"), ["-m", "ainuoke_bridge.server_source"], {
            cwd: resolve("tools/ainuoke-bridge"), windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1" },
        });
        const chunks: Buffer[] = [];
        let size = 0, settled = false;
        const fail = (code: string) => { if (settled)
            return; settled = true; clearTimeout(timer); child.kill(); reject(new SourceError(code)); };
        const timer = setTimeout(() => fail("source_timeout"), options.timeoutMs ?? 600000);
        child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 32 * 1024 * 1024)
            fail("source_limit");
        else
            chunks.push(chunk); });
        child.stderr.resume(); // Never reflect upstream/Python diagnostics into application logs.
        child.on("error", () => fail("source_collector_unavailable"));
        child.stdin.on("error", () => fail("source_collector_unavailable"));
        child.on("close", code => {
            if (settled)
                return;
            clearTimeout(timer);
            try {
                const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                if (code !== 0) {
                    fail(["invalid_credential", "auth_expired", "source_unavailable"].includes(value.error) ? value.error : "source_invalid");
                    return;
                }
                settled = true;
                resolveResult(value);
            }
            catch {
                fail("source_invalid");
            }
        });
        child.stdin.end(JSON.stringify({ baseUrl: config.baseUrl, username: config.username, password: config.password, contracts }));
    });
}
