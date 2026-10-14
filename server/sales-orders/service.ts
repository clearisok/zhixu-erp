import {orderCommandControlError} from './command-control.js';
import {lockEffectiveAttribution} from './effective-attribution.js';
import { HttpError } from "../http/errors.js";
import type { Pool, PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import {
  AINUOKE_CONTRACT_ENTITY_TYPE,
  AINUOKE_SOURCE_SYSTEM,
  type AinuokeColorMirrorInput,
  type AinuokeContractMirrorInput,
  type SalesOrderDetailReadModel,
} from "./model.js";
import {
  createOrUpdateSourceLink,
  createSalesOrder,
  getFoundationSalesOrderById,
  getSalesOrderBySourceIdentity,
  replaceCurrentAinuokeColorSlice,
  upsertCurrentAinuokeContractMirror,
} from "./repository.js";

export type CreateAinuokeSalesOrderInput = {
  source: AinuokeContractMirrorInput;
  colors: readonly AinuokeColorMirrorInput[];
};

export type CreateAinuokeSalesOrderResult = {
  created: boolean;
  salesOrder: SalesOrderDetailReadModel;
};

export async function createAinuokeSalesOrder(
  pool: Pool,
  actor: TrustedIdentity,
  input: CreateAinuokeSalesOrderInput,
): Promise<CreateAinuokeSalesOrderResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await createAinuokeSalesOrderInTransaction(client, actor, input);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw orderCommandControlError(error);
  } finally {
    client.release();
  }
}

/** Caller owns transaction and trusted authorization; shared domain creation path. */
export async function createAinuokeSalesOrderInTransaction(client: PoolClient, actor: TrustedIdentity, input: CreateAinuokeSalesOrderInput): Promise<CreateAinuokeSalesOrderResult> {
    await lockEffectiveAttribution(client);
    const normalizedSourceId = input.source.sourceId.normalize("NFKC").trim();
    if (!normalizedSourceId) throw new Error("sourceId is required");
    const sourceLockKey = `${AINUOKE_SOURCE_SYSTEM}:${AINUOKE_CONTRACT_ENTITY_TYPE}:${normalizedSourceId}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceLockKey]);

    const existing = await getSalesOrderBySourceIdentity(
      client,
      AINUOKE_SOURCE_SYSTEM,
      AINUOKE_CONTRACT_ENTITY_TYPE,
      normalizedSourceId,
    );
    if (existing) {
      const detail = await getFoundationSalesOrderById(client, existing.id);
      if (!detail) throw new Error("Existing SalesOrder source binding has no aggregate");
      if ((detail.salesContractNo ?? '').normalize('NFKC').trim().toUpperCase() !== input.source.salesContractNo.normalize('NFKC').trim().toUpperCase()) {
        throw new HttpError(409, 'source_contract_identity_conflict', 'Existing source identity belongs to another sales contract');
      }
      return { created: false, salesOrder: detail };
    }

    const contractNo=input.source.salesContractNo.normalize('NFKC').trim().toUpperCase();
    if(!contractNo) throw new HttpError(400,'sales_contract_required','A sales contract is required');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['ainuoke:sales-contract-number:'+contractNo]);
    const conflictingContract=await client.query("SELECT sales_order_id FROM sales_order_source_links WHERE source_system='ainuoke' AND source_entity_type='sales_contract' AND upper(btrim(sales_contract_no))=$1",[contractNo]);
    if(conflictingContract.rowCount) throw new HttpError(409,'source_contract_identity_conflict','Contract is already bound to a different source identity');
    const salesOrder = await createSalesOrder(client, {
      creationSource: "ainuoke",
      lifecycleState: "draft",
    });
    await createOrUpdateSourceLink(client, {
      salesOrderId: salesOrder.id,
      sourceSystem: AINUOKE_SOURCE_SYSTEM,
      sourceEntityType: AINUOKE_CONTRACT_ENTITY_TYPE,
      externalId: input.source.sourceId,
      salesContractNo: input.source.salesContractNo,
      insideOrderNo: input.source.insideOrderNo,
    });
    await upsertCurrentAinuokeContractMirror(client, salesOrder.id, input.source);
    await replaceCurrentAinuokeColorSlice(client, salesOrder.id, input.colors);
    await appendOperationLog(client, actor, {
      module: "艾诺科同步",
      action: "艾诺科新增订单",
      entityType: "SalesOrder",
      entityId: salesOrder.id,
      afterData: {
        orderId: salesOrder.id,
        orderNo: salesOrder.orderNo,
        orderStyleNo: input.source.styleNo,
        salesContractNo: input.source.salesContractNo,
        objectSource: "order",
        objectType: "AinuokeContract",
        objectId: input.source.sourceId,
        objectName: input.source.salesContractNo,
        values: {
          quantity: input.source.quantity,
          colorCount: input.colors.length,
          creationSource: "ainuoke",
          sourceDeliveryDate: input.source.contractDeliveryDate,
        },
      },
      metadata: {
        sourceSystem: AINUOKE_SOURCE_SYSTEM,
        sourceEntityType: AINUOKE_CONTRACT_ENTITY_TYPE,
        sourceId: input.source.sourceId,
      },
    });

    const detail = await getFoundationSalesOrderById(client, salesOrder.id);
    if (!detail) throw new Error("Created SalesOrder could not be read inside its transaction");
    return { created: true, salesOrder: detail };
}
