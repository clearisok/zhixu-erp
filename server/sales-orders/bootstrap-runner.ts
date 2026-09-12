import type { Pool, PoolClient } from "pg";
import type { FinalSalesOrderBootstrapPreview } from "../../features/ainuoke-sync/service/sales-order-final-bootstrap-preview.js";
import { normalizeAinuokeSalesContractNo } from "../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js";
import { permissionsForUser } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { discoverMigrations } from "../db/migration-runner.js";
import { createAinuokeSalesOrder } from "./service.js";

export const REAL_BOOTSTRAP_DATABASE = "zhixu";
export const REAL_BOOTSTRAP_CLI_CONFIRMATION = "zhixu";
export const REAL_BOOTSTRAP_ENV_CONFIRMATION = "YES";
export const REQUIRED_BOOTSTRAP_MIGRATIONS = [
  "0001_trusted_auth_rbac_operation_logs.sql",
  "0002_sales_order_foundation.sql",
  "0003_sales_order_number_sequence.sql",
] as const;

const REAL_BOOTSTRAP_LOCK_ID = "873215970215";

type Queryable = Pick<Pool | PoolClient, "query">;

export type BootstrapCliOptions = {
  mode: "plan" | "execute";
  ainuokeUserId: string;
  confirmation: string | null;
};

export type BootstrapBusinessCounts = {
  salesOrders: number;
  sourceLinks: number;
  contractMirrors: number;
  colorMirrors: number;
  salesOrderOperationLogs: number;
};

export type BootstrapSequenceState = {
  lastValue: string;
  isCalled: boolean;
};

export type BootstrapPreconditions = {
  database: string;
  expectedDatabase: string;
  ledger: Array<{ version: string; filename: string; checksum: string }>;
  businessCounts: BootstrapBusinessCounts | null;
  sequence: BootstrapSequenceState | null;
  ready: boolean;
  reasons: string[];
};

export type BootstrapReconciliation = {
  planned: number;
  counts: BootstrapBusinessCounts;
  expectedColorMirrors: number;
  normalizedSalesContractBlank: number;
  normalizedSalesContractDuplicates: number;
  uuidDuplicates: number;
  orderNumberDuplicates: number;
  sourceBindingConflicts: number;
  colorRowMismatches: number;
  operationLogsByActor: number;
  firstOrderNo: string | null;
  lastOrderNo: string | null;
  expectedLastOrderNo: string | null;
  orderNumberFormatValid: boolean;
  orderNumberSequenceValid: boolean;
  sequence: BootstrapSequenceState;
  passed: boolean;
};

export type ProductionBootstrapResult = {
  planned: number;
  created: number;
  idempotent: number;
  actorUsername: string;
  previewHash: string;
  countsBeforeReplay: BootstrapBusinessCounts;
  countsAfterReplay: BootstrapBusinessCounts;
  reconciliation: BootstrapReconciliation;
};

export type BootstrapFailureReport = {
  phase: "create" | "idempotency";
  planned: number;
  createdBeforeFailure: number;
  failedBillNo: string;
  errorClass: string;
  currentCounts: BootstrapBusinessCounts;
};

export class BootstrapGuardError extends Error {
  readonly reasons: string[];

  constructor(reasons: readonly string[]) {
    super("Real SalesOrder bootstrap guard rejected execution");
    this.name = "BootstrapGuardError";
    this.reasons = [...reasons];
  }
}

export class BootstrapExecutionError extends Error {
  readonly report: BootstrapFailureReport;

  constructor(report: BootstrapFailureReport) {
    super("Real SalesOrder bootstrap stopped after the first failure");
    this.name = "BootstrapExecutionError";
    this.report = report;
  }
}

export class BootstrapReconciliationError extends Error {
  readonly reconciliation: BootstrapReconciliation;

  constructor(reconciliation: BootstrapReconciliation) {
    super("Real SalesOrder bootstrap post-write reconciliation failed");
    this.name = "BootstrapReconciliationError";
    this.reconciliation = reconciliation;
  }
}

function requiredOptionValue(argument: string, prefix: string): string {
  const value = argument.slice(prefix.length).normalize("NFKC").trim();
  if (!value) throw new BootstrapGuardError([`${prefix.slice(2, -1)}_missing`]);
  return value;
}

export function parseBootstrapCliArguments(arguments_: readonly string[]): BootstrapCliOptions {
  let mode: BootstrapCliOptions["mode"] | null = null;
  let ainuokeUserId: string | null = null;
  let confirmation: string | null = null;
  for (const argument of arguments_) {
    if (argument === "--plan" || argument === "--execute") {
      const nextMode = argument === "--plan" ? "plan" : "execute";
      if (mode) throw new BootstrapGuardError(["bootstrap_mode_must_be_exactly_one"]);
      mode = nextMode;
    } else if (argument.startsWith("--ainuoke-user-id=")) {
      if (ainuokeUserId !== null) throw new BootstrapGuardError(["ainuoke_user_id_duplicated"]);
      ainuokeUserId = requiredOptionValue(argument, "--ainuoke-user-id=");
    } else if (argument.startsWith("--confirm-real-bootstrap=")) {
      if (confirmation !== null) throw new BootstrapGuardError(["real_bootstrap_confirmation_duplicated"]);
      confirmation = requiredOptionValue(argument, "--confirm-real-bootstrap=");
    } else {
      throw new BootstrapGuardError(["unknown_bootstrap_argument"]);
    }
  }
  if (!mode) throw new BootstrapGuardError(["bootstrap_mode_required"]);
  if (!ainuokeUserId) throw new BootstrapGuardError(["ainuoke_user_id_required"]);
  return { mode, ainuokeUserId, confirmation };
}

export function assertExecuteConfirmation(input: {
  mode: "plan" | "execute";
  cliConfirmation: string | null;
  envConfirmation: string | undefined;
}): void {
  if (input.mode === "plan") return;
  const reasons: string[] = [];
  if (input.cliConfirmation !== REAL_BOOTSTRAP_CLI_CONFIRMATION) reasons.push("explicit_cli_confirmation_missing");
  if (input.envConfirmation !== REAL_BOOTSTRAP_ENV_CONFIRMATION) reasons.push("explicit_env_confirmation_missing");
  if (reasons.length) throw new BootstrapGuardError(reasons);
}

function objectNamesMissing(row: Record<string, boolean>): string[] {
  return Object.entries(row).filter(([, exists]) => !exists).map(([name]) => `missing_${name}`);
}

export async function readBootstrapBusinessCounts(client: Queryable): Promise<BootstrapBusinessCounts> {
  const result = await client.query<{
    sales_orders: number;
    source_links: number;
    contract_mirrors: number;
    color_mirrors: number;
    salesorder_operation_logs: number;
  }>(`SELECT
      (SELECT count(*)::int FROM sales_orders) AS sales_orders,
      (SELECT count(*)::int FROM sales_order_source_links) AS source_links,
      (SELECT count(*)::int FROM ainuoke_sales_order_contract_mirrors) AS contract_mirrors,
      (SELECT count(*)::int FROM ainuoke_sales_order_color_mirrors) AS color_mirrors,
      (SELECT count(*)::int FROM operation_logs WHERE entity_type = 'SalesOrder') AS salesorder_operation_logs`);
  const row = result.rows[0];
  return {
    salesOrders: row.sales_orders,
    sourceLinks: row.source_links,
    contractMirrors: row.contract_mirrors,
    colorMirrors: row.color_mirrors,
    salesOrderOperationLogs: row.salesorder_operation_logs,
  };
}

export async function readBootstrapSequenceState(client: Queryable): Promise<BootstrapSequenceState> {
  const result = await client.query<{ last_value: string; is_called: boolean }>(
    "SELECT last_value::text, is_called FROM sales_order_number_seq",
  );
  return { lastValue: result.rows[0].last_value, isCalled: result.rows[0].is_called };
}

export async function inspectFirstBootstrapPreconditions(
  client: Queryable,
  migrationsDirectory: string,
  expectedDatabase = REAL_BOOTSTRAP_DATABASE,
): Promise<BootstrapPreconditions> {
  const database = (await client.query<{ database: string }>("SELECT current_database() AS database")).rows[0].database;
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
  reasons.push(...objectNamesMissing(objects));

  const migrations = await discoverMigrations(migrationsDirectory);
  if (migrations.length !== REQUIRED_BOOTSTRAP_MIGRATIONS.length
    || migrations.some((migration, index) => migration.filename !== REQUIRED_BOOTSTRAP_MIGRATIONS[index])) {
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

  const businessObjectsExist = objects.sales_orders
    && objects.sales_order_source_links
    && objects.contract_mirrors
    && objects.color_mirrors
    && objects.operation_logs;
  const businessCounts = businessObjectsExist ? await readBootstrapBusinessCounts(client) : null;
  if (businessCounts && Object.values(businessCounts).some((count) => count !== 0)) {
    reasons.push("first_bootstrap_requires_empty_sales_order_state");
  }
  const sequence = objects.sales_order_number_seq ? await readBootstrapSequenceState(client) : null;
  if (sequence && (sequence.lastValue !== "1" || sequence.isCalled)) {
    reasons.push("first_bootstrap_requires_unconsumed_sequence");
  }
  return {
    database,
    expectedDatabase,
    ledger,
    businessCounts,
    sequence,
    ready: reasons.length === 0,
    reasons,
  };
}

export async function loadExistingBootstrapActor(client: Pool | PoolClient, usernameInput: string): Promise<TrustedIdentity> {
  const username = usernameInput.normalize("NFKC").trim();
  if (!username) throw new BootstrapGuardError(["bootstrap_actor_username_required"]);
  const result = await client.query<{
    id: string;
    public_id: string | null;
    username: string;
    display_name: string;
    active: boolean;
  }>(
    `SELECT id::text, public_id::text, username, display_name, active
     FROM app_users WHERE username = $1`,
    [username],
  );
  if (result.rowCount !== 1) throw new BootstrapGuardError(["bootstrap_actor_must_exist_exactly_once"]);
  const row = result.rows[0];
  if (!row.active) throw new BootstrapGuardError(["bootstrap_actor_must_be_active"]);
  if (!row.public_id) throw new BootstrapGuardError(["bootstrap_actor_public_id_required"]);
  return {
    internalUserId: row.id,
    userId: row.public_id,
    username: row.username,
    userName: row.display_name,
    permissions: await permissionsForUser(client, row.id),
  };
}

function assertFreshPreview(preview: FinalSalesOrderBootstrapPreview): void {
  const reasons: string[] = [];
  const billNos = preview.candidates.map((candidate) => normalizeAinuokeSalesContractNo(candidate.source.salesContractNo));
  if (!preview.snapshot.stable) reasons.push("fresh_preview_snapshot_not_stable");
  if (!preview.readyForDisposablePostgres) reasons.push("fresh_preview_not_ready");
  if (preview.queries.failed !== 0 || preview.queries.successful !== preview.queries.total) reasons.push("detail_query_failures_present");
  if (preview.discovery.total <= 0 || preview.candidates.length !== preview.discovery.total) reasons.push("candidate_coverage_mismatch");
  if (preview.snapshot.beforeTotal !== preview.discovery.total || preview.snapshot.afterTotal !== preview.discovery.total) reasons.push("discovery_total_mismatch");
  if (billNos.some((billNo) => !billNo)) reasons.push("candidate_billno_blank");
  if (new Set(billNos).size !== billNos.length) reasons.push("candidate_billno_duplicate");
  if (billNos.some((billNo, index) => index > 0 && billNos[index - 1].localeCompare(billNo) > 0)) reasons.push("candidate_order_not_billno_deterministic");
  if (preview.candidates.some((candidate, index) => candidate.sequence !== index + 1)) reasons.push("candidate_sequence_mismatch");
  if (preview.candidates.some((candidate) => candidate.colorDetailStatus !== "usable" && candidate.colors.length !== 0)) {
    reasons.push("non_usable_color_candidate_not_empty");
  }
  if (!preview.previewHash.trim()) reasons.push("preview_hash_missing");
  if (reasons.length) throw new BootstrapGuardError(reasons);
}

function errorClass(error: unknown): string {
  const value = error as { name?: string; code?: string; constructor?: { name?: string } };
  const name = value.name || value.constructor?.name || "UnknownError";
  return value.code ? `${name}:${value.code}` : name;
}

function expectedOrderNo(sequence: number): string {
  return `SO-${String(sequence).padStart(8, "0")}`;
}

export async function reconcileProductionSalesOrderBootstrap(
  client: Queryable,
  actor: TrustedIdentity,
  preview: FinalSalesOrderBootstrapPreview,
): Promise<BootstrapReconciliation> {
  const counts = await readBootstrapBusinessCounts(client);
  const sequence = await readBootstrapSequenceState(client);
  const orders = (await client.query<{ id: string; order_no: string }>(
    "SELECT id::text, order_no FROM sales_orders ORDER BY order_no, id",
  )).rows;
  const bindings = (await client.query<{
    external_id: string;
    sales_contract_no: string | null;
    sales_order_id: string;
    order_no: string;
    version: number;
    mirror_sales_contract_no: string | null;
    color_count: number;
  }>(`SELECT sl.external_id, sl.sales_contract_no, sl.sales_order_id::text,
            so.order_no, so.version,
            mirror.sales_contract_no AS mirror_sales_contract_no,
            count(color.id)::int AS color_count
       FROM sales_order_source_links sl
       JOIN sales_orders so ON so.id = sl.sales_order_id
       LEFT JOIN ainuoke_sales_order_contract_mirrors mirror ON mirror.sales_order_id = so.id
       LEFT JOIN ainuoke_sales_order_color_mirrors color ON color.sales_order_id = so.id
      WHERE sl.source_system = 'ainuoke' AND sl.source_entity_type = 'sales_contract'
      GROUP BY sl.external_id, sl.sales_contract_no, sl.sales_order_id, so.order_no, so.version,
               mirror.sales_contract_no
      ORDER BY upper(btrim(sl.sales_contract_no)), sl.external_id`)).rows;
  const contractIntegrity = (await client.query<{ blank: number; duplicates: number }>(`SELECT
      count(*) FILTER (WHERE btrim(sales_contract_no) = '')::int AS blank,
      (count(*) - count(DISTINCT upper(btrim(sales_contract_no))))::int AS duplicates
    FROM ainuoke_sales_order_contract_mirrors`)).rows[0];
  const logs = (await client.query<{ matching: number }>(`SELECT count(*) FILTER (
      WHERE actor_user_id = $1::bigint
        AND actor_public_id = $2::uuid
        AND actor_name = $3
        AND module = '艾诺科同步'
        AND action = '艾诺科新增订单'
    )::int AS matching
    FROM operation_logs WHERE entity_type = 'SalesOrder'`, [actor.internalUserId, actor.userId, actor.userName])).rows[0];

  const candidatesBySource = new Map(preview.candidates.map((candidate) => [
    candidate.source.sourceId.normalize("NFKC").trim(),
    candidate,
  ]));
  const bindingsBySource = new Map(bindings.map((binding) => [binding.external_id, binding]));
  let sourceBindingConflicts = bindings.filter((binding) => !candidatesBySource.has(binding.external_id)).length;
  let colorRowMismatches = 0;
  let orderNumberSequenceValid = true;
  for (const candidate of preview.candidates) {
    const sourceId = candidate.source.sourceId.normalize("NFKC").trim();
    const binding = bindingsBySource.get(sourceId);
    if (!binding
      || normalizeAinuokeSalesContractNo(binding.sales_contract_no) !== normalizeAinuokeSalesContractNo(candidate.source.salesContractNo)
      || normalizeAinuokeSalesContractNo(binding.mirror_sales_contract_no) !== normalizeAinuokeSalesContractNo(candidate.source.salesContractNo)
      || binding.version !== 1) {
      sourceBindingConflicts += 1;
      continue;
    }
    if (binding.color_count !== candidate.colors.length) colorRowMismatches += 1;
    if (binding.order_no !== expectedOrderNo(candidate.sequence)) orderNumberSequenceValid = false;
  }
  const uuidDuplicates = orders.length - new Set(orders.map((order) => order.id)).size;
  const orderNumberDuplicates = orders.length - new Set(orders.map((order) => order.order_no)).size;
  const expectedColorMirrors = preview.candidates.reduce((sum, candidate) => sum + candidate.colors.length, 0);
  const firstOrderNo = orders.at(0)?.order_no ?? null;
  const lastOrderNo = orders.at(-1)?.order_no ?? null;
  const expectedLastOrderNo = preview.discovery.total > 0 ? expectedOrderNo(preview.discovery.total) : null;
  const orderNumberFormatValid = orders.every((order) => /^SO-[0-9]{8}$/u.test(order.order_no));
  const passed = counts.salesOrders === preview.discovery.total
    && counts.sourceLinks === preview.discovery.total
    && counts.contractMirrors === preview.discovery.total
    && counts.colorMirrors === expectedColorMirrors
    && counts.salesOrderOperationLogs === preview.discovery.total
    && contractIntegrity.blank === 0
    && contractIntegrity.duplicates === 0
    && uuidDuplicates === 0
    && orderNumberDuplicates === 0
    && sourceBindingConflicts === 0
    && colorRowMismatches === 0
    && logs.matching === preview.discovery.total
    && firstOrderNo === "SO-00000001"
    && lastOrderNo === expectedLastOrderNo
    && orderNumberFormatValid
    && orderNumberSequenceValid
    && sequence.isCalled
    && sequence.lastValue === String(preview.discovery.total);
  return {
    planned: preview.discovery.total,
    counts,
    expectedColorMirrors,
    normalizedSalesContractBlank: contractIntegrity.blank,
    normalizedSalesContractDuplicates: contractIntegrity.duplicates,
    uuidDuplicates,
    orderNumberDuplicates,
    sourceBindingConflicts,
    colorRowMismatches,
    operationLogsByActor: logs.matching,
    firstOrderNo,
    lastOrderNo,
    expectedLastOrderNo,
    orderNumberFormatValid,
    orderNumberSequenceValid,
    sequence,
    passed,
  };
}

function countsEqual(left: BootstrapBusinessCounts, right: BootstrapBusinessCounts): boolean {
  return Object.keys(left).every((key) => left[key as keyof BootstrapBusinessCounts] === right[key as keyof BootstrapBusinessCounts]);
}

export async function executeProductionSalesOrderBootstrap(
  pool: Pool,
  input: {
    preview: FinalSalesOrderBootstrapPreview;
    migrationsDirectory: string;
    actorUsername: string;
    expectedDatabase?: string;
    cliConfirmation: string | null;
    envConfirmation: string | undefined;
  },
): Promise<ProductionBootstrapResult> {
  assertExecuteConfirmation({
    mode: "execute",
    cliConfirmation: input.cliConfirmation,
    envConfirmation: input.envConfirmation,
  });
  assertFreshPreview(input.preview);
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1::bigint)", [REAL_BOOTSTRAP_LOCK_ID]);
    const preconditions = await inspectFirstBootstrapPreconditions(
      lockClient,
      input.migrationsDirectory,
      input.expectedDatabase ?? REAL_BOOTSTRAP_DATABASE,
    );
    if (!preconditions.ready) throw new BootstrapGuardError(preconditions.reasons);
    const actor = await loadExistingBootstrapActor(lockClient, input.actorUsername);
    const createdBySource = new Map<string, { id: string; orderNo: string; version: number }>();
    let created = 0;
    for (const candidate of input.preview.candidates) {
      try {
        const result = await createAinuokeSalesOrder(pool, actor, {
          source: candidate.source,
          colors: candidate.colors,
        });
        if (!result.created) {
          const unexpected = new Error("First bootstrap unexpectedly returned an existing source binding");
          unexpected.name = "UnexpectedIdempotentCreateError";
          throw unexpected;
        }
        created += 1;
        createdBySource.set(candidate.source.sourceId, {
          id: result.salesOrder.id,
          orderNo: result.salesOrder.orderNo,
          version: result.salesOrder.version,
        });
      } catch (error) {
        throw new BootstrapExecutionError({
          phase: "create",
          planned: input.preview.candidates.length,
          createdBeforeFailure: created,
          failedBillNo: candidate.source.salesContractNo,
          errorClass: errorClass(error),
          currentCounts: await readBootstrapBusinessCounts(lockClient),
        });
      }
    }

    const countsBeforeReplay = await readBootstrapBusinessCounts(lockClient);
    let idempotent = 0;
    for (const candidate of input.preview.candidates) {
      try {
        const result = await createAinuokeSalesOrder(pool, actor, {
          source: candidate.source,
          colors: candidate.colors,
        });
        const original = createdBySource.get(candidate.source.sourceId);
        if (result.created || !original
          || result.salesOrder.id !== original.id
          || result.salesOrder.orderNo !== original.orderNo
          || result.salesOrder.version !== original.version) {
          const mismatch = new Error("Idempotency replay identity mismatch");
          mismatch.name = "IdempotencyReplayMismatchError";
          throw mismatch;
        }
        idempotent += 1;
      } catch (error) {
        throw new BootstrapExecutionError({
          phase: "idempotency",
          planned: input.preview.candidates.length,
          createdBeforeFailure: created,
          failedBillNo: candidate.source.salesContractNo,
          errorClass: errorClass(error),
          currentCounts: await readBootstrapBusinessCounts(lockClient),
        });
      }
    }
    const countsAfterReplay = await readBootstrapBusinessCounts(lockClient);
    if (!countsEqual(countsBeforeReplay, countsAfterReplay)) {
      throw new BootstrapGuardError(["idempotency_replay_changed_business_counts"]);
    }
    const reconciliation = await reconcileProductionSalesOrderBootstrap(lockClient, actor, input.preview);
    if (!reconciliation.passed) throw new BootstrapReconciliationError(reconciliation);
    return {
      planned: input.preview.candidates.length,
      created,
      idempotent,
      actorUsername: actor.username,
      previewHash: input.preview.previewHash,
      countsBeforeReplay,
      countsAfterReplay,
      reconciliation,
    };
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1::bigint)", [REAL_BOOTSTRAP_LOCK_ID]);
    } finally {
      lockClient.release();
    }
  }
}
