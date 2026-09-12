import {
  buildFreshSalesOrderBootstrapPlan,
  type BootstrapBridgeTransportRetry,
  type BootstrapSourceProgress,
} from "./bootstrap-source.js";
import { AinuokeBridgeError } from "../../features/ainuoke-api/client/ainuoke-bridge-client.js";
import {
  BootstrapExecutionError,
  BootstrapGuardError,
  BootstrapReconciliationError,
  assertExecuteConfirmation,
  executeProductionSalesOrderBootstrap,
  inspectFirstBootstrapPreconditions,
  loadExistingBootstrapActor,
  parseBootstrapCliArguments,
  REAL_BOOTSTRAP_DATABASE,
} from "./bootstrap-runner.js";
import { loadServerConfig } from "../config.js";
import { closeDatabasePool, createDatabasePool } from "../db/pool.js";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8765";

const SAFE_BRIDGE_ERROR_CODES = new Set([
  "network_timeout",
  "network_unavailable",
  "invalid_credential",
  "auth_expired",
  "upstream_schema_error",
  "unknown_report",
  "invalid_query",
  "upstream_error",
  "account_not_configured",
  "session_required",
  "session_origin_mismatch",
  "csrf_invalid",
  "csrf_required",
  "origin_not_allowed",
  "bridge_internal_error",
]);

function requiredEnvironment(value: string | undefined, reason: string): string {
  const normalized = value?.normalize("NFKC").trim();
  if (!normalized) throw new BootstrapGuardError([reason]);
  return normalized;
}

function bridgeUrlFromEnvironment(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_BRIDGE_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BootstrapGuardError(["ainuoke_bridge_url_invalid"]);
  }
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash) {
    throw new BootstrapGuardError(["ainuoke_bridge_url_invalid"]);
  }
  return parsed.toString().replace(/\/$/u, "");
}

function progressLogger(progress: BootstrapSourceProgress): void {
  if (progress.phase !== "color_details"
    || progress.completed % 25 === 0
    || progress.completed === progress.total) {
    process.stdout.write(`${JSON.stringify({ event: "bootstrap_source_progress", ...progress })}\n`);
  }
}

function transportRetryLogger(retry: BootstrapBridgeTransportRetry): void {
  process.stdout.write(`${JSON.stringify({ event: "bootstrap_bridge_transport_retry", ...retry })}\n`);
}

function executionHeader(plan: Awaited<ReturnType<typeof buildFreshSalesOrderBootstrapPlan>>) {
  const { preview } = plan;
  return {
    discoveryTotal: preview.discovery.total,
    beforeHash: preview.snapshot.beforeHash,
    afterHash: preview.snapshot.afterHash,
    previewHash: preview.previewHash,
    usable: preview.coverage.usable,
    missing: preview.coverage.missing,
    invalid: preview.coverage.invalid,
    insideOrderNoDrift: preview.identity.insideOrderNoDriftCount,
    transportRetries: plan.transportRetries,
  };
}

function sanitizedFailure(error: unknown): Record<string, unknown> {
  if (error instanceof BootstrapExecutionError) {
    return { event: "real_bootstrap_stopped", ...error.report };
  }
  if (error instanceof BootstrapReconciliationError) {
    return { event: "real_bootstrap_reconciliation_failed", reconciliation: error.reconciliation };
  }
  if (error instanceof BootstrapGuardError) {
    return { event: "real_bootstrap_guard_rejected", reasons: error.reasons };
  }
  if (error instanceof AinuokeBridgeError) {
    return {
      event: "real_bootstrap_source_failed",
      errorClass: "AinuokeBridgeError",
      bridgeCode: SAFE_BRIDGE_ERROR_CODES.has(error.code) ? error.code : "unknown_bridge_error",
    };
  }
  return {
    event: "real_bootstrap_failed",
    errorClass: error instanceof Error ? error.name : "UnknownError",
  };
}

async function main(): Promise<void> {
  const options = parseBootstrapCliArguments(process.argv.slice(2));
  assertExecuteConfirmation({
    mode: options.mode,
    cliConfirmation: options.confirmation,
    envConfirmation: process.env.ZHIXU_REAL_BOOTSTRAP_CONFIRM,
  });
  const actorUsername = requiredEnvironment(
    process.env.ZHIXU_BOOTSTRAP_ACTOR_USERNAME,
    "bootstrap_actor_username_required",
  );
  const bridgeUrl = bridgeUrlFromEnvironment(process.env.AINUOKE_BRIDGE_URL);
  const config = loadServerConfig();
  const pool = createDatabasePool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    applicationName: "zhixu-salesorder-bootstrap",
  });
  try {
    const initialPreconditions = await inspectFirstBootstrapPreconditions(
      pool,
      config.migrationsDirectory,
      REAL_BOOTSTRAP_DATABASE,
    );
    if (!initialPreconditions.ready) throw new BootstrapGuardError(initialPreconditions.reasons);
    const actor = await loadExistingBootstrapActor(pool, actorUsername);
    const plan = await buildFreshSalesOrderBootstrapPlan({
      ainuokeUserId: options.ainuokeUserId,
      bridgeUrl,
      onProgress: progressLogger,
      onTransportRetry: transportRetryLogger,
    });
    process.stdout.write(`${JSON.stringify({ event: "bootstrap_execution_header", ...executionHeader(plan) })}\n`);

    if (options.mode === "plan") {
      process.stdout.write(`${JSON.stringify({
        event: "real_bootstrap_plan_complete",
        database: initialPreconditions.database,
        actorUsername: actor.username,
        actorPermissionCount: actor.permissions.length,
        businessCounts: initialPreconditions.businessCounts,
        sequence: initialPreconditions.sequence,
        billNo: plan.billNo,
        reads: plan.reads,
        transportRetries: plan.transportRetries,
        realPostgresBusinessWrites: 0,
        readyToExecuteRealBootstrap: true,
      })}\n`);
      return;
    }

    const result = await executeProductionSalesOrderBootstrap(pool, {
      preview: plan.preview,
      migrationsDirectory: config.migrationsDirectory,
      actorUsername,
      expectedDatabase: REAL_BOOTSTRAP_DATABASE,
      cliConfirmation: options.confirmation,
      envConfirmation: process.env.ZHIXU_REAL_BOOTSTRAP_CONFIRM,
    });
    process.stdout.write(`${JSON.stringify({ event: "real_bootstrap_complete", ...result })}\n`);
  } finally {
    await closeDatabasePool(pool);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(sanitizedFailure(error))}\n`);
  process.exitCode = 1;
});
