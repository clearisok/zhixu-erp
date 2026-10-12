import { pathToFileURL } from "node:url";
import { loadServerConfig } from "../config.js";
import { createDatabasePool } from "../db/pool.js";
import { verifyMigrationsCurrent } from "../db/migration-runner.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { SourceError, hash } from "./contract.js";
import { readPrivateCollectorConfig, accountFingerprint, collectWithPython } from "./collector.js";
import { boundOrders, captureSource, sourceActor } from "./service.js";
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
    if (args.length === 0 || args[0] === "--help") {
        process.stdout.write("check: --check --config=<absolute private file>\nexecute: --execute=<source key> --expected-target=<check fingerprint> --config=<same file>\nNo scheduler, migration, bootstrap or deployment is performed.\n");
        return;
    }
    const check = args.includes("--check");
    if (args.some(a => !/^--(?:check$|config=.+|execute=[a-z][a-z0-9_-]{2,63}$|expected-target=[0-9a-f]{64}$)/u.test(a))
        || new Set(args.map(a => a.split("=")[0])).size !== args.length || !args.some(a => a.startsWith("--config="))
        || (check ? args.length !== 2 : args.length !== 3 || !args.some(a => a.startsWith("--execute=")) || !args.some(a => a.startsWith("--expected-target="))))
        throw new SourceError("explicit_source_action_required");
    const cfg = readPrivateCollectorConfig(args.find(a => a.startsWith("--config="))!.slice(9));
    if (!check && !args.includes("--execute=" + cfg.sourceKey))
        throw new SourceError("source_confirmation_mismatch");
    const server = loadServerConfig();
    if (server.identityMode !== "session")
        throw new SourceError("source_session_required");
    const pool = createDatabasePool({ connectionString: server.databaseUrl, max: 2 });
    try {
        await verifyMigrationsCurrent(pool, server.migrationsDirectory);
        const actor = await loadExistingBootstrapActor(pool, cfg.operatorUsername);
        await sourceActor(pool, actor, true);
        const db = (await pool.query("SELECT current_database() AS database,current_user AS db_user,inet_server_addr()::text AS address,inet_server_port() AS port")).rows[0];
        const uri = new URL(server.databaseUrl);
        const fingerprint = hash({ sourceKey: cfg.sourceKey, account: accountFingerprint(cfg), host: uri.hostname, port: uri.port, database: db });
        if (check) {
            process.stdout.write(JSON.stringify({ result: "CHECKED_NO_SOURCE_READ", targetFingerprint: fingerprint, sourceKey: cfg.sourceKey, boundOrders: (await boundOrders(pool)).length }) + "\n");
            return;
        }
        if (!args.includes("--expected-target=" + fingerprint))
            throw new SourceError("source_target_mismatch");
        const result = await captureSource(pool, actor, { sourceKey: cfg.sourceKey, accountFingerprint: accountFingerprint(cfg), maxAgeMs: 600000, collect: contracts => collectWithPython(cfg, contracts) });
        process.stdout.write(JSON.stringify({ result: "SOURCE_CAPTURED", ...result }) + "\n");
    }
    finally {
        await pool.end();
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => { process.stderr.write(JSON.stringify({ result: "FAIL", code: error instanceof SourceError ? error.code : "source_command_failed" }) + "\n"); process.exitCode = 1; });
}
