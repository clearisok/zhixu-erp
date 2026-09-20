import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import { runMigrations } from "../db/migration-runner.js";
import { permissionsForUser } from "../auth/permissions.js";
import { loadServerConfig } from "../config.js";
import {
  REAL_RBAC_CLI_CONFIRMATION,
  REAL_RBAC_ENV_CONFIRMATION,
  RbacActivationGuardError,
  SERVER_ADMIN_ROLE_ID,
  activateExistingServerAdminRole,
  assertRbacExecuteConfirmation,
  inspectRbacActivationPlan,
  type RbacSafetyExpectation,
} from "../auth/rbac-activation.js";
import { parseRbacActivationCliArguments } from "../auth/rbac-activation-cli.js";
import { readBootstrapBusinessCounts, readBootstrapSequenceState } from "../sales-orders/bootstrap-runner.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { frozenFoundationMigrations } from "./frozen-foundation-migrations.js";

const { Pool } = pg;
let migrationsDirectory: string;

const emptySafety = (): RbacSafetyExpectation => ({
  salesOrderCounts: {
    salesOrders: 0,
    sourceLinks: 0,
    contractMirrors: 0,
    colorMirrors: 0,
    salesOrderOperationLogs: 0,
  },
  sequence: { lastValue: "1", isCalled: false },
});

function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

async function migratedDatabase(
  postgres: Awaited<ReturnType<typeof startDisposablePostgres>>,
  label: string,
): Promise<{ pool: pg.Pool; database: string }> {
  const databaseUrl = await postgres.createDatabase(label);
  const pool = new Pool({ connectionString: databaseUrl });
  await runMigrations(pool, migrationsDirectory);
  return { pool, database: databaseName(databaseUrl) };
}

async function seedUser(pool: pg.Pool, input: {
  username: string;
  active?: boolean;
  publicId?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO app_users(username, password_hash, display_name, role, active, public_id)
     VALUES ($1, crypt(gen_random_uuid()::text, gen_salt('bf', 12)), $2, 'admin', $3, $4::uuid)`,
    [input.username, `Existing ${input.username}`, input.active ?? true, input.publicId ?? "11111111-1111-4111-8111-111111111111"],
  );
}

async function adminCore(pool: pg.Pool) {
  return (await pool.query(
    `SELECT id::text, public_id::text, username, password_hash, display_name, role, active,
            created_at::text, updated_at::text
       FROM app_users WHERE lower(btrim(username)) = 'admin' ORDER BY id`,
  )).rows;
}

async function rbacCounts(pool: pg.Pool) {
  return (await pool.query(`SELECT
    (SELECT count(*)::int FROM app_permissions) AS permissions,
    (SELECT count(*)::int FROM app_roles) AS roles,
    (SELECT count(*)::int FROM app_role_permissions) AS role_permissions,
    (SELECT count(*)::int FROM app_user_roles) AS user_roles`)).rows[0];
}

test("guarded existing-admin RBAC activation rehearses only in disposable PostgreSQL", async (context) => {
  const frozen = await frozenFoundationMigrations();
  migrationsDirectory = frozen.directory;
  context.after(frozen.dispose);
  const postgres = await startDisposablePostgres();
  const pools: pg.Pool[] = [];
  try {
    await context.test("current expanded migration set still fails the frozen RBAC guard closed", async () => {
      const database = await migratedDatabase(postgres, "expanded_migrations");
      pools.push(database.pool);
      await seedUser(database.pool, { username: "admin" });
      const report = await inspectRbacActivationPlan(database.pool, {
        username: "admin", migrationsDirectory: resolve("database/migrations"), expectedDatabase: database.database, expectedSafety: emptySafety(),
      });
      assert.ok(report.reasons.includes("repository_migration_set_mismatch"));
    });
    await context.test("CLI and execute require exact admin target plus both confirmations", () => {
      assert.throws(() => parseRbacActivationCliArguments([]), RbacActivationGuardError);
      assert.throws(() => parseRbacActivationCliArguments(["--plan", "--execute", "--username=admin"]), RbacActivationGuardError);
      assert.throws(() => parseRbacActivationCliArguments(["--plan", "--username=other"]), RbacActivationGuardError);
      assert.deepEqual(parseRbacActivationCliArguments(["--plan", "--username=admin"]), {
        mode: "plan",
        username: "admin",
        confirmation: null,
      });
      assert.throws(() => assertRbacExecuteConfirmation({ cliConfirmation: null, envConfirmation: "YES" }), RbacActivationGuardError);
      assert.throws(() => assertRbacExecuteConfirmation({ cliConfirmation: "zhixu", envConfirmation: undefined }), RbacActivationGuardError);
      assert.doesNotThrow(() => assertRbacExecuteConfirmation({
        cliConfirmation: REAL_RBAC_CLI_CONFIRMATION,
        envConfirmation: REAL_RBAC_ENV_CONFIRMATION,
      }));
      assert.equal(loadServerConfig({
        DATABASE_URL: "postgresql://example.invalid/zhixu",
        NODE_ENV: "development",
        ZHIXU_ADMIN_PASSWORD: "",
      }).bootstrapAdmin.password, undefined);
    });

    await context.test("PLAN rejects wrong target and migration ledger mismatch without RBAC writes", async () => {
      const database = await migratedDatabase(postgres, "rbac_wrong_target");
      pools.push(database.pool);
      await seedUser(database.pool, { username: "admin" });
      const wrongTarget = await inspectRbacActivationPlan(database.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: "zhixu",
        expectedSafety: emptySafety(),
      });
      assert.equal(wrongTarget.readyToExecuteRealRbac, false);
      assert.ok(wrongTarget.reasons.includes("target_database_mismatch"));
      await assert.rejects(() => activateExistingServerAdminRole(database.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: "zhixu",
        expectedSafety: emptySafety(),
        cliConfirmation: REAL_RBAC_CLI_CONFIRMATION,
        envConfirmation: REAL_RBAC_ENV_CONFIRMATION,
      }), (error: unknown) => error instanceof RbacActivationGuardError
        && error.reasons.includes("target_database_mismatch"));
      assert.deepEqual(await rbacCounts(database.pool), { permissions: 0, roles: 0, role_permissions: 0, user_roles: 0 });

      await database.pool.query("UPDATE schema_migrations SET checksum = repeat('0', 64) WHERE version = 3");
      const ledgerMismatch = await inspectRbacActivationPlan(database.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: database.database,
        expectedSafety: emptySafety(),
      });
      assert.equal(ledgerMismatch.readyToExecuteRealRbac, false);
      assert.ok(ledgerMismatch.reasons.includes("migration_ledger_mismatch"));
      await assert.rejects(() => activateExistingServerAdminRole(database.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: database.database,
        expectedSafety: emptySafety(),
        cliConfirmation: REAL_RBAC_CLI_CONFIRMATION,
        envConfirmation: REAL_RBAC_ENV_CONFIRMATION,
      }), (error: unknown) => error instanceof RbacActivationGuardError
        && error.reasons.includes("migration_ledger_mismatch"));
      assert.deepEqual(await rbacCounts(database.pool), { permissions: 0, roles: 0, role_permissions: 0, user_roles: 0 });
    });

    await context.test("missing, inactive, and ambiguous normalized admin identities fail closed", async () => {
      const missing = await migratedDatabase(postgres, "rbac_missing_admin");
      pools.push(missing.pool);
      const missingPlan = await inspectRbacActivationPlan(missing.pool, {
        username: "admin", migrationsDirectory, expectedDatabase: missing.database, expectedSafety: emptySafety(),
      });
      assert.ok(missingPlan.reasons.includes("existing_admin_missing"));
      await assert.rejects(() => activateExistingServerAdminRole(missing.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: missing.database,
        expectedSafety: emptySafety(),
        cliConfirmation: REAL_RBAC_CLI_CONFIRMATION,
        envConfirmation: REAL_RBAC_ENV_CONFIRMATION,
      }), (error: unknown) => error instanceof RbacActivationGuardError
        && error.reasons.includes("existing_admin_missing"));
      assert.equal((await missing.pool.query("SELECT count(*)::int AS count FROM app_users")).rows[0].count, 0);

      const inactive = await migratedDatabase(postgres, "rbac_inactive_admin");
      pools.push(inactive.pool);
      await seedUser(inactive.pool, { username: "admin", active: false });
      const inactivePlan = await inspectRbacActivationPlan(inactive.pool, {
        username: "admin", migrationsDirectory, expectedDatabase: inactive.database, expectedSafety: emptySafety(),
      });
      assert.ok(inactivePlan.reasons.includes("existing_admin_inactive"));
      await assert.rejects(() => activateExistingServerAdminRole(inactive.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: inactive.database,
        expectedSafety: emptySafety(),
        cliConfirmation: REAL_RBAC_CLI_CONFIRMATION,
        envConfirmation: REAL_RBAC_ENV_CONFIRMATION,
      }), (error: unknown) => error instanceof RbacActivationGuardError
        && error.reasons.includes("existing_admin_inactive"));
      assert.equal((await inactive.pool.query("SELECT count(*)::int AS count FROM app_users")).rows[0].count, 1);

      const ambiguous = await migratedDatabase(postgres, "rbac_ambiguous_admin");
      pools.push(ambiguous.pool);
      await seedUser(ambiguous.pool, { username: "admin" });
      await seedUser(ambiguous.pool, { username: " ADMIN ", publicId: "22222222-2222-4222-8222-222222222222" });
      const ambiguousPlan = await inspectRbacActivationPlan(ambiguous.pool, {
        username: "admin", migrationsDirectory, expectedDatabase: ambiguous.database, expectedSafety: emptySafety(),
      });
      assert.ok(ambiguousPlan.reasons.includes("existing_admin_ambiguous"));
      assert.equal((await ambiguous.pool.query("SELECT count(*)::int AS count FROM app_users")).rows[0].count, 2);
    });

    await context.test("PLAN is read-only and reports the expected dynamic permission count", async () => {
      const database = await migratedDatabase(postgres, "rbac_plan");
      pools.push(database.pool);
      await seedUser(database.pool, { username: "admin" });
      const beforeAdmin = await adminCore(database.pool);
      const beforeRbac = await rbacCounts(database.pool);
      const beforeSales = await readBootstrapBusinessCounts(database.pool);
      const beforeSequence = await readBootstrapSequenceState(database.pool);
      const plan = await inspectRbacActivationPlan(database.pool, {
        username: "admin", migrationsDirectory, expectedDatabase: database.database, expectedSafety: emptySafety(),
      });
      assert.equal(plan.readyToExecuteRealRbac, true);
      assert.match(plan.postgresVersion, /^16\./u);
      assert.equal(plan.expectedPermissionCount, PERMISSION_KEYS.length);
      assert.equal(plan.admin.exists, true);
      assert.equal(plan.admin.active, true);
      assert.equal(plan.admin.publicIdPresent, true);
      assert.deepEqual(await adminCore(database.pool), beforeAdmin);
      assert.deepEqual(await rbacCounts(database.pool), beforeRbac);
      assert.deepEqual(await readBootstrapBusinessCounts(database.pool), beforeSales);
      assert.deepEqual(await readBootstrapSequenceState(database.pool), beforeSequence);
    });

    await context.test("activation preserves users, grants every current permission, and reruns idempotently", async () => {
      const database = await migratedDatabase(postgres, "rbac_success");
      pools.push(database.pool);
      await seedUser(database.pool, { username: "admin" });
      await seedUser(database.pool, { username: "unrelated", publicId: "33333333-3333-4333-8333-333333333333" });
      const beforeAdmin = await adminCore(database.pool);
      const beforeSales = await readBootstrapBusinessCounts(database.pool);
      const beforeSequence = await readBootstrapSequenceState(database.pool);
      const execute = () => activateExistingServerAdminRole(database.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: database.database,
        expectedSafety: emptySafety(),
        cliConfirmation: REAL_RBAC_CLI_CONFIRMATION,
        envConfirmation: REAL_RBAC_ENV_CONFIRMATION,
      });
      const first = await execute();
      const firstCounts = await rbacCounts(database.pool);
      const second = await execute();
      const secondCounts = await rbacCounts(database.pool);

      assert.equal(first.adminRowsBefore, 2);
      assert.equal(first.adminRowsAfter, 2);
      assert.equal(first.adminUserCoreUnchanged, true);
      assert.equal(first.permissions, PERMISSION_KEYS.length);
      assert.equal(first.expectedPermissions, PERMISSION_KEYS.length);
      assert.equal(first.role, SERVER_ADMIN_ROLE_ID);
      assert.equal(first.rolePermissions, PERMISSION_KEYS.length);
      assert.equal(first.adminRoleBinding, true);
      assert.equal(first.orderView, true);
      assert.deepEqual(second, first);
      assert.deepEqual(secondCounts, firstCounts);
      assert.deepEqual(firstCounts, {
        permissions: PERMISSION_KEYS.length,
        roles: 1,
        role_permissions: PERMISSION_KEYS.length,
        user_roles: 1,
      });
      assert.deepEqual((await database.pool.query(
        "SELECT name, description FROM app_roles WHERE id = $1",
        [SERVER_ADMIN_ROLE_ID],
      )).rows[0], {
        name: "服务器管理员",
        description: "通过权限目录授予全部服务器权限",
      });
      assert.deepEqual(await adminCore(database.pool), beforeAdmin);
      assert.deepEqual(await readBootstrapBusinessCounts(database.pool), beforeSales);
      assert.deepEqual(await readBootstrapSequenceState(database.pool), beforeSequence);
      const adminId = beforeAdmin[0].id as string;
      assert.deepEqual(await permissionsForUser(database.pool, adminId), [...PERMISSION_KEYS].sort());
    });

    await context.test("activation preserves unrelated roles, permissions, and user bindings", async () => {
      const database = await migratedDatabase(postgres, "rbac_preserve_existing");
      pools.push(database.pool);
      await seedUser(database.pool, { username: "admin" });
      await seedUser(database.pool, { username: "unrelated", publicId: "44444444-4444-4444-8444-444444444444" });
      const unrelatedUserId = (await database.pool.query<{ id: string }>(
        "SELECT id::text FROM app_users WHERE username = 'unrelated'",
      )).rows[0].id;
      await database.pool.query(
        "INSERT INTO app_permissions(key, module, label, description) VALUES ('quote.view', 'existing', 'existing', 'existing')",
      );
      await database.pool.query(
        "INSERT INTO app_roles(id, name, description) VALUES ('role-existing', 'Existing role', 'Must remain')",
      );
      await database.pool.query(
        "INSERT INTO app_role_permissions(role_id, permission_key) VALUES ('role-existing', 'quote.view')",
      );
      await database.pool.query(
        "INSERT INTO app_user_roles(user_id, role_id) VALUES ($1::bigint, 'role-existing')",
        [unrelatedUserId],
      );
      await activateExistingServerAdminRole(database.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: database.database,
        expectedSafety: emptySafety(),
        cliConfirmation: REAL_RBAC_CLI_CONFIRMATION,
        envConfirmation: REAL_RBAC_ENV_CONFIRMATION,
      });
      assert.equal((await database.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app_roles WHERE id = 'role-existing'",
      )).rows[0].count, 1);
      assert.equal((await database.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app_role_permissions WHERE role_id = 'role-existing' AND permission_key = 'quote.view'",
      )).rows[0].count, 1);
      assert.equal((await database.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app_user_roles WHERE user_id = $1::bigint AND role_id = 'role-existing'",
        [unrelatedUserId],
      )).rows[0].count, 1);
    });

    await context.test("a late transaction failure rolls back the whole RBAC activation", async () => {
      const database = await migratedDatabase(postgres, "rbac_rollback");
      pools.push(database.pool);
      await seedUser(database.pool, { username: "admin" });
      const beforeAdmin = await adminCore(database.pool);
      const beforeSales = await readBootstrapBusinessCounts(database.pool);
      const beforeSequence = await readBootstrapSequenceState(database.pool);
      await database.pool.query(`CREATE FUNCTION reject_test_user_role() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'test user-role failure'; END $$`);
      await database.pool.query(`CREATE TRIGGER reject_test_user_role BEFORE INSERT ON app_user_roles
        FOR EACH ROW EXECUTE FUNCTION reject_test_user_role()`);
      await assert.rejects(() => activateExistingServerAdminRole(database.pool, {
        username: "admin",
        migrationsDirectory,
        expectedDatabase: database.database,
        expectedSafety: emptySafety(),
        cliConfirmation: REAL_RBAC_CLI_CONFIRMATION,
        envConfirmation: REAL_RBAC_ENV_CONFIRMATION,
      }), /test user-role failure/u);
      assert.deepEqual(await rbacCounts(database.pool), { permissions: 0, roles: 0, role_permissions: 0, user_roles: 0 });
      assert.deepEqual(await adminCore(database.pool), beforeAdmin);
      assert.deepEqual(await readBootstrapBusinessCounts(database.pool), beforeSales);
      assert.deepEqual(await readBootstrapSequenceState(database.pool), beforeSequence);
    });
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await postgres.stop();
  }
});
