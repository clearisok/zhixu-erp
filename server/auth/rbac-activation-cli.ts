import { loadServerConfig } from "../config.js";
import { closeDatabasePool, createDatabasePool } from "../db/pool.js";
import {
  REAL_RBAC_DATABASE,
  RbacActivationGuardError,
  activateExistingServerAdminRole,
  assertRbacExecuteConfirmation,
  inspectRbacActivationPlan,
} from "./rbac-activation.js";

export type RbacActivationCliOptions = {
  mode: "plan" | "execute";
  username: string;
  confirmation: string | null;
};

function optionValue(argument: string, prefix: string): string {
  const value = argument.slice(prefix.length).normalize("NFKC").trim();
  if (!value) throw new RbacActivationGuardError([`${prefix.slice(2, -1)}_missing`]);
  return value;
}

export function parseRbacActivationCliArguments(arguments_: readonly string[]): RbacActivationCliOptions {
  let mode: RbacActivationCliOptions["mode"] | null = null;
  let username: string | null = null;
  let confirmation: string | null = null;
  for (const argument of arguments_) {
    if (argument === "--plan" || argument === "--execute") {
      if (mode) throw new RbacActivationGuardError(["rbac_mode_must_be_exactly_one"]);
      mode = argument === "--plan" ? "plan" : "execute";
    } else if (argument.startsWith("--username=")) {
      if (username !== null) throw new RbacActivationGuardError(["rbac_username_duplicated"]);
      username = optionValue(argument, "--username=").toLowerCase();
    } else if (argument.startsWith("--confirm-real-rbac=")) {
      if (confirmation !== null) throw new RbacActivationGuardError(["real_rbac_confirmation_duplicated"]);
      confirmation = optionValue(argument, "--confirm-real-rbac=");
    } else {
      throw new RbacActivationGuardError(["unknown_rbac_argument"]);
    }
  }
  if (!mode) throw new RbacActivationGuardError(["rbac_mode_required"]);
  if (!username) throw new RbacActivationGuardError(["rbac_username_required"]);
  if (username !== "admin") throw new RbacActivationGuardError(["target_username_must_be_admin"]);
  return { mode, username, confirmation };
}

function sanitizedFailure(error: unknown): Record<string, unknown> {
  if (error instanceof RbacActivationGuardError) {
    return { event: "real_rbac_guard_rejected", reasons: error.reasons };
  }
  return {
    event: "real_rbac_activation_failed",
    errorClass: error instanceof Error ? error.name : "UnknownError",
  };
}

async function main(): Promise<void> {
  const options = parseRbacActivationCliArguments(process.argv.slice(2));
  if (options.mode === "execute") {
    assertRbacExecuteConfirmation({
      cliConfirmation: options.confirmation,
      envConfirmation: process.env.ZHIXU_REAL_RBAC_CONFIRM,
    });
  }
  const config = loadServerConfig();
  const pool = createDatabasePool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    applicationName: "zhixu-rbac-activation",
  });
  try {
    const plan = await inspectRbacActivationPlan(pool, {
      username: options.username,
      migrationsDirectory: config.migrationsDirectory,
      expectedDatabase: REAL_RBAC_DATABASE,
    });
    if (options.mode === "plan") {
      process.stdout.write(`${JSON.stringify({
        event: "real_rbac_activation_plan",
        database: plan.database,
        postgresVersion: plan.postgresVersion,
        ledger: plan.ledger,
        admin: {
          matchCount: plan.admin.matchCount,
          exists: plan.admin.exists,
          active: plan.admin.active,
          publicIdPresent: plan.admin.publicIdPresent,
        },
        counts: plan.counts,
        roleExists: plan.roleExists,
        adminBound: plan.adminBound,
        orderViewCatalogExists: plan.orderViewCatalogExists,
        roleHasOrderView: plan.roleHasOrderView,
        expectedPermissionCount: plan.expectedPermissionCount,
        roleCurrentPermissionCount: plan.roleCurrentPermissionCount,
        roleTotalPermissionCount: plan.roleTotalPermissionCount,
        salesOrderCounts: plan.salesOrderCounts,
        sequence: plan.sequence,
        readyToExecuteRealRbac: plan.readyToExecuteRealRbac,
        reasons: plan.reasons,
        realRbacWrites: 0,
        realAuthSessionWrites: 0,
        realSalesOrderWrites: 0,
      })}\n`);
      return;
    }
    const result = await activateExistingServerAdminRole(pool, {
      username: options.username,
      migrationsDirectory: config.migrationsDirectory,
      expectedDatabase: REAL_RBAC_DATABASE,
      cliConfirmation: options.confirmation,
      envConfirmation: process.env.ZHIXU_REAL_RBAC_CONFIRM,
    });
    process.stdout.write(`${JSON.stringify({ event: "real_rbac_activation_complete", ...result })}\n`);
  } finally {
    await closeDatabasePool(pool);
  }
}

const isDirectInvocation = process.argv[1]?.replaceAll("\\", "/").endsWith("/rbac-activation-cli.ts")
  || process.argv[1]?.replaceAll("\\", "/").endsWith("/rbac-activation-cli.js");

if (isDirectInvocation) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(sanitizedFailure(error))}\n`);
    process.exitCode = 1;
  });
}
