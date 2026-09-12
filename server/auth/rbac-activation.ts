import type { Pool, PoolClient } from "pg";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import { discoverMigrations } from "../db/migration-runner.js";
import {
  readBootstrapBusinessCounts,
  readBootstrapSequenceState,
  type BootstrapBusinessCounts,
  type BootstrapSequenceState,
} from "../sales-orders/bootstrap-runner.js";
import { synchronizePermissionCatalogInTransaction } from "./permissions.js";

export const REAL_RBAC_DATABASE = "zhixu";
export const REAL_RBAC_CLI_CONFIRMATION = "zhixu";
export const REAL_RBAC_ENV_CONFIRMATION = "YES";
export const SERVER_ADMIN_ROLE_ID = "role-server-admin";
export const REQUIRED_RBAC_MIGRATIONS = [
  "0001_trusted_auth_rbac_operation_logs.sql",
  "0002_sales_order_foundation.sql",
  "0003_sales_order_number_sequence.sql",
] as const;

const RBAC_ACTIVATION_LOCK_ID = "614220260913";

export const REAL_RBAC_SALES_ORDER_COUNTS: BootstrapBusinessCounts = {
  salesOrders: 511,
  sourceLinks: 511,
  contractMirrors: 511,
  colorMirrors: 1348,
  salesOrderOperationLogs: 511,
};

export const REAL_RBAC_SEQUENCE_STATE: BootstrapSequenceState = {
  lastValue: "511",
  isCalled: true,
};

type Queryable = Pick<Pool | PoolClient, "query">;

type AdminInspection = {
  matchCount: number;
  exists: boolean;
  active: boolean;
  publicIdPresent: boolean;
  internalUserId: string | null;
};

export type RbacActivationCounts = {
  permissions: number;
  roles: number;
  rolePermissionBindings: number;
  userRoleBindings: number;
};

export type RbacActivationPlan = {
  database: string;
  postgresVersion: string;
  ledger: Array<{ version: string; filename: string; checksum: string }>;
  admin: AdminInspection;
  counts: RbacActivationCounts | null;
  roleExists: boolean;
  adminBound: boolean;
  orderViewCatalogExists: boolean;
  roleHasOrderView: boolean;
  expectedPermissionCount: number;
  roleCurrentPermissionCount: number;
  roleTotalPermissionCount: number;
  salesOrderCounts: BootstrapBusinessCounts | null;
  sequence: BootstrapSequenceState | null;
  readyToExecuteRealRbac: boolean;
  reasons: string[];
};

export type RbacActivationResult = {
  adminRowsBefore: number;
  adminRowsAfter: number;
  adminUserCoreUnchanged: boolean;
  permissions: number;
  expectedPermissions: number;
  role: typeof SERVER_ADMIN_ROLE_ID;
  rolePermissions: number;
  adminRoleBinding: boolean;
  orderView: boolean;
};

export class RbacActivationGuardError extends Error {
  readonly reasons: string[];

  constructor(reasons: readonly string[]) {
    super("Real server RBAC activation guard rejected execution");
    this.name = "RbacActivationGuardError";
    this.reasons = [...reasons];
  }
}

export type RbacSafetyExpectation = {
  salesOrderCounts: BootstrapBusinessCounts;
  sequence: BootstrapSequenceState;
};

const REAL_SAFETY_EXPECTATION: RbacSafetyExpectation = {
  salesOrderCounts: REAL_RBAC_SALES_ORDER_COUNTS,
  sequence: REAL_RBAC_SEQUENCE_STATE,
};

function normalizedUsername(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function countsEqual(left: BootstrapBusinessCounts, right: BootstrapBusinessCounts): boolean {
  return (Object.keys(left) as Array<keyof BootstrapBusinessCounts>)
    .every((key) => left[key] === right[key]);
}

function sequenceEqual(left: BootstrapSequenceState, right: BootstrapSequenceState): boolean {
  return left.lastValue === right.lastValue && left.isCalled === right.isCalled;
}

async function inspectAdmin(client: Queryable, username: string): Promise<AdminInspection> {
  const rows = (await client.query<{
    id: string;
    active: boolean;
    public_id_present: boolean;
  }>(
    `SELECT id::text, active, public_id IS NOT NULL AS public_id_present
       FROM app_users
      WHERE lower(btrim(username)) = $1
      ORDER BY id`,
    [normalizedUsername(username)],
  )).rows;
  const row = rows.length === 1 ? rows[0] : null;
  return {
    matchCount: rows.length,
    exists: row !== null,
    active: row?.active ?? false,
    publicIdPresent: row?.public_id_present ?? false,
    internalUserId: row?.id ?? null,
  };
}

function missingObjects(row: Record<string, boolean>): string[] {
  return Object.entries(row).filter(([, exists]) => !exists).map(([name]) => `missing_${name}`);
}

export async function inspectRbacActivationPlan(
  client: Queryable,
  input: {
    username: string;
    migrationsDirectory: string;
    expectedDatabase?: string;
    expectedSafety?: RbacSafetyExpectation;
  },
): Promise<RbacActivationPlan> {
  const username = normalizedUsername(input.username);
  const expectedDatabase = input.expectedDatabase ?? REAL_RBAC_DATABASE;
  const expectedSafety = input.expectedSafety ?? REAL_SAFETY_EXPECTATION;
  const database = (await client.query<{ database: string }>("SELECT current_database() AS database")).rows[0].database;
  const postgresVersion = (await client.query<{ version: string }>(
    "SELECT current_setting('server_version') AS version",
  )).rows[0].version;
  const objects = (await client.query<Record<string, boolean>>(`SELECT
    to_regclass('public.schema_migrations') IS NOT NULL AS schema_migrations,
    to_regclass('public.app_users') IS NOT NULL AS app_users,
    to_regclass('public.app_roles') IS NOT NULL AS app_roles,
    to_regclass('public.app_permissions') IS NOT NULL AS app_permissions,
    to_regclass('public.app_user_roles') IS NOT NULL AS app_user_roles,
    to_regclass('public.app_role_permissions') IS NOT NULL AS app_role_permissions,
    to_regclass('public.operation_logs') IS NOT NULL AS operation_logs,
    to_regclass('public.sales_orders') IS NOT NULL AS sales_orders,
    to_regclass('public.sales_order_source_links') IS NOT NULL AS sales_order_source_links,
    to_regclass('public.ainuoke_sales_order_contract_mirrors') IS NOT NULL AS contract_mirrors,
    to_regclass('public.ainuoke_sales_order_color_mirrors') IS NOT NULL AS color_mirrors,
    to_regclass('public.sales_order_number_seq') IS NOT NULL AS sales_order_number_seq`)).rows[0];
  const reasons: string[] = [];
  if (database !== expectedDatabase) reasons.push("target_database_mismatch");
  if (username !== "admin") reasons.push("target_username_must_be_admin");
  reasons.push(...missingObjects(objects));

  const migrations = await discoverMigrations(input.migrationsDirectory);
  if (migrations.length !== REQUIRED_RBAC_MIGRATIONS.length
    || migrations.some((migration, index) => migration.filename !== REQUIRED_RBAC_MIGRATIONS[index])) {
    reasons.push("repository_migration_set_mismatch");
  }
  const ledger = objects.schema_migrations
    ? (await client.query<{ version: string; filename: string; checksum: string }>(
      "SELECT version::text, filename, checksum FROM schema_migrations ORDER BY version",
    )).rows
    : [];
  const ledgerMatches = ledger.length === migrations.length
    && ledger.every((row, index) => row.version === migrations[index].version
      && row.filename === migrations[index].filename
      && row.checksum === migrations[index].checksum);
  if (!ledgerMatches) reasons.push("migration_ledger_mismatch");

  const rbacObjectsExist = objects.app_users && objects.app_roles && objects.app_permissions
    && objects.app_user_roles && objects.app_role_permissions;
  const admin = objects.app_users
    ? await inspectAdmin(client, username)
    : { matchCount: 0, exists: false, active: false, publicIdPresent: false, internalUserId: null };
  if (objects.app_users) {
    if (admin.matchCount === 0) reasons.push("existing_admin_missing");
    else if (admin.matchCount !== 1) reasons.push("existing_admin_ambiguous");
    else if (!admin.active) reasons.push("existing_admin_inactive");
    else if (!admin.publicIdPresent) reasons.push("existing_admin_public_id_missing");
  }

  let counts: RbacActivationCounts | null = null;
  let roleExists = false;
  let adminBound = false;
  let orderViewCatalogExists = false;
  let roleHasOrderView = false;
  let roleCurrentPermissionCount = 0;
  let roleTotalPermissionCount = 0;
  if (rbacObjectsExist) {
    const rbac = (await client.query<{
      permissions: number;
      roles: number;
      role_permission_bindings: number;
      user_role_bindings: number;
      role_exists: boolean;
      order_view_catalog_exists: boolean;
      role_has_order_view: boolean;
      role_current_permission_count: number;
      role_total_permission_count: number;
    }>(`SELECT
      (SELECT count(*)::int FROM app_permissions) AS permissions,
      (SELECT count(*)::int FROM app_roles) AS roles,
      (SELECT count(*)::int FROM app_role_permissions) AS role_permission_bindings,
      (SELECT count(*)::int FROM app_user_roles) AS user_role_bindings,
      EXISTS (SELECT 1 FROM app_roles WHERE id = $1) AS role_exists,
      EXISTS (SELECT 1 FROM app_permissions WHERE key = 'order.view') AS order_view_catalog_exists,
      EXISTS (SELECT 1 FROM app_role_permissions WHERE role_id = $1 AND permission_key = 'order.view') AS role_has_order_view,
      (SELECT count(*)::int FROM app_role_permissions WHERE role_id = $1 AND permission_key = ANY($2::text[])) AS role_current_permission_count,
      (SELECT count(*)::int FROM app_role_permissions WHERE role_id = $1) AS role_total_permission_count`,
    [SERVER_ADMIN_ROLE_ID, [...PERMISSION_KEYS]])).rows[0];
    counts = {
      permissions: rbac.permissions,
      roles: rbac.roles,
      rolePermissionBindings: rbac.role_permission_bindings,
      userRoleBindings: rbac.user_role_bindings,
    };
    roleExists = rbac.role_exists;
    orderViewCatalogExists = rbac.order_view_catalog_exists;
    roleHasOrderView = rbac.role_has_order_view;
    roleCurrentPermissionCount = rbac.role_current_permission_count;
    roleTotalPermissionCount = rbac.role_total_permission_count;
    if (roleTotalPermissionCount !== roleCurrentPermissionCount) {
      reasons.push("server_admin_role_has_unknown_permissions");
    }
    if (admin.internalUserId) {
      adminBound = (await client.query<{ bound: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM app_user_roles WHERE user_id = $1::bigint AND role_id = $2) AS bound",
        [admin.internalUserId, SERVER_ADMIN_ROLE_ID],
      )).rows[0].bound;
    }
  }

  const salesObjectsExist = objects.sales_orders && objects.sales_order_source_links
    && objects.contract_mirrors && objects.color_mirrors && objects.operation_logs;
  const salesOrderCounts = salesObjectsExist ? await readBootstrapBusinessCounts(client) : null;
  if (salesOrderCounts && !countsEqual(salesOrderCounts, expectedSafety.salesOrderCounts)) {
    reasons.push("sales_order_safety_counts_mismatch");
  }
  const sequence = objects.sales_order_number_seq ? await readBootstrapSequenceState(client) : null;
  if (sequence && !sequenceEqual(sequence, expectedSafety.sequence)) reasons.push("sales_order_sequence_mismatch");

  return {
    database,
    postgresVersion,
    ledger,
    admin,
    counts,
    roleExists,
    adminBound,
    orderViewCatalogExists,
    roleHasOrderView,
    expectedPermissionCount: PERMISSION_KEYS.length,
    roleCurrentPermissionCount,
    roleTotalPermissionCount,
    salesOrderCounts,
    sequence,
    readyToExecuteRealRbac: reasons.length === 0,
    reasons,
  };
}

export function assertRbacExecuteConfirmation(input: {
  cliConfirmation: string | null;
  envConfirmation: string | undefined;
}): void {
  const reasons: string[] = [];
  if (input.cliConfirmation !== REAL_RBAC_CLI_CONFIRMATION) reasons.push("explicit_cli_confirmation_missing");
  if (input.envConfirmation !== REAL_RBAC_ENV_CONFIRMATION) reasons.push("explicit_env_confirmation_missing");
  if (reasons.length) throw new RbacActivationGuardError(reasons);
}

type AdminCoreRow = {
  id: string;
  public_id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

function adminCoreEqual(left: AdminCoreRow, right: AdminCoreRow): boolean {
  return left.id === right.id
    && left.public_id === right.public_id
    && left.username === right.username
    && left.password_hash === right.password_hash
    && left.display_name === right.display_name
    && left.role === right.role
    && left.active === right.active
    && left.created_at.getTime() === right.created_at.getTime()
    && left.updated_at.getTime() === right.updated_at.getTime();
}

export async function activateExistingServerAdminRole(
  pool: Pool,
  input: {
    username: string;
    migrationsDirectory: string;
    expectedDatabase?: string;
    expectedSafety?: RbacSafetyExpectation;
    cliConfirmation: string | null;
    envConfirmation: string | undefined;
  },
): Promise<RbacActivationResult> {
  assertRbacExecuteConfirmation(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [RBAC_ACTIVATION_LOCK_ID]);
    const plan = await inspectRbacActivationPlan(client, input);
    if (!plan.readyToExecuteRealRbac || !plan.admin.internalUserId) {
      throw new RbacActivationGuardError(plan.reasons);
    }
    const adminRowsBefore = (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM app_users")).rows[0].count;
    const before = (await client.query<AdminCoreRow>(
      `SELECT id::text, public_id::text, username, password_hash, display_name, role, active, created_at, updated_at
         FROM app_users WHERE id = $1::bigint`,
      [plan.admin.internalUserId],
    )).rows[0];

    await synchronizePermissionCatalogInTransaction(client);
    await client.query(
      `INSERT INTO app_roles(id, name, description)
       VALUES ($1, '服务器管理员', '通过权限目录授予全部服务器权限')
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         updated_at = now()
       WHERE (app_roles.name, app_roles.description)
         IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description)`,
      [SERVER_ADMIN_ROLE_ID],
    );
    await client.query(
      `INSERT INTO app_role_permissions(role_id, permission_key)
       SELECT $1, permission_key FROM unnest($2::text[]) AS permission_key
       ON CONFLICT DO NOTHING`,
      [SERVER_ADMIN_ROLE_ID, [...PERMISSION_KEYS]],
    );
    await client.query(
      `INSERT INTO app_user_roles(user_id, role_id)
       VALUES ($1::bigint, $2) ON CONFLICT DO NOTHING`,
      [plan.admin.internalUserId, SERVER_ADMIN_ROLE_ID],
    );

    const validation = (await client.query<{
      permissions: number;
      role_permissions: number;
      role_current_permissions: number;
      admin_role_binding: boolean;
      order_view: boolean;
    }>(`SELECT
      (SELECT count(*)::int FROM app_permissions) AS permissions,
      (SELECT count(*)::int FROM app_role_permissions WHERE role_id = $1) AS role_permissions,
      (SELECT count(*)::int FROM app_role_permissions WHERE role_id = $1 AND permission_key = ANY($2::text[])) AS role_current_permissions,
      EXISTS (SELECT 1 FROM app_user_roles WHERE user_id = $3::bigint AND role_id = $1) AS admin_role_binding,
      EXISTS (SELECT 1 FROM app_role_permissions WHERE role_id = $1 AND permission_key = 'order.view') AS order_view`,
    [SERVER_ADMIN_ROLE_ID, [...PERMISSION_KEYS], plan.admin.internalUserId])).rows[0];
    if (validation.role_permissions !== PERMISSION_KEYS.length
      || validation.role_current_permissions !== PERMISSION_KEYS.length
      || !validation.admin_role_binding
      || !validation.order_view) {
      throw new RbacActivationGuardError(["post_activation_validation_failed"]);
    }

    const after = (await client.query<AdminCoreRow>(
      `SELECT id::text, public_id::text, username, password_hash, display_name, role, active, created_at, updated_at
         FROM app_users WHERE id = $1::bigint`,
      [plan.admin.internalUserId],
    )).rows[0];
    const adminRowsAfter = (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM app_users")).rows[0].count;
    const adminUserCoreUnchanged = adminRowsBefore === adminRowsAfter && adminCoreEqual(before, after);
    if (!adminUserCoreUnchanged) throw new RbacActivationGuardError(["admin_user_core_changed"]);

    await client.query("COMMIT");
    return {
      adminRowsBefore,
      adminRowsAfter,
      adminUserCoreUnchanged,
      permissions: validation.permissions,
      expectedPermissions: PERMISSION_KEYS.length,
      role: SERVER_ADMIN_ROLE_ID,
      rolePermissions: validation.role_permissions,
      adminRoleBinding: validation.admin_role_binding,
      orderView: validation.order_view,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
