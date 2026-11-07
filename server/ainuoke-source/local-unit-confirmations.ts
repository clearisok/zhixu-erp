import type { Pool } from 'pg';
import type { MaterialConfirmation } from '../../features/ainuoke-material-progress/confirmed-facts.js';
import { normalizeSourceUnit } from '../../features/ainuoke-material-progress/confirmed-facts.js';
import type { MaterialReadPorts } from '../../features/ainuoke-material-progress/read-service.js';
import { createPersistedMaterialPorts, type SourceReadConfig } from './reader.js';

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const nonempty = (value: unknown, max: number) => typeof value === 'string' && value.trim() && value.length <= max;

/** Trusted local operator file only. HTTP input and source payloads cannot provide these receipts. */
export function parseLocalUnitConfirmations(raw: unknown, sourceKey: string, accountFingerprint: string) {
  if (!object(raw) || !keys(raw, ['schemaVersion', 'sourceKey', 'accountFingerprint', 'orders'])
    || raw.schemaVersion !== 'local-material-unit-confirmations.v1' || raw.sourceKey !== sourceKey
    || raw.accountFingerprint !== accountFingerprint || !/^[a-f0-9]{64}$/.test(accountFingerprint)
    || !Array.isArray(raw.orders) || raw.orders.length > 1000) {
    throw new Error('local_unit_confirmation_invalid');
  }
  const byOrder = new Map<string, readonly MaterialConfirmation[]>();
  for (const entry of raw.orders) {
    if (!object(entry) || !keys(entry, ['salesOrderId', 'receipts']) || typeof entry.salesOrderId !== 'string'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(entry.salesOrderId) || byOrder.has(entry.salesOrderId)
      || !Array.isArray(entry.receipts) || entry.receipts.length > 1000) throw new Error('local_unit_confirmation_invalid');
    const receipts: MaterialConfirmation[] = [];
    for (const item of entry.receipts) {
      if (!object(item) || !keys(item, ['id', 'salesContractNo', 'demandId', 'evidenceKey', 'confirmedBy', 'confirmedAt', 'evidenceReference', 'unit'])
        || !nonempty(item.id, 200) || !nonempty(item.salesContractNo, 200) || !nonempty(item.demandId, 200)
        || !nonempty(item.evidenceKey, 131072) || !nonempty(item.confirmedBy, 200) || !nonempty(item.evidenceReference, 1000)
        || typeof item.confirmedAt !== 'string' || !Number.isFinite(Date.parse(item.confirmedAt)) || !object(item.unit)
        || !keys(item.unit, ['value', 'acceptedSourceUnits', 'ratio']) || item.unit.ratio !== 1
        || normalizeSourceUnit(item.unit.value) !== item.unit.value || !item.unit.value
        || !Array.isArray(item.unit.acceptedSourceUnits) || item.unit.acceptedSourceUnits.length > 20
        || item.unit.acceptedSourceUnits.some(value => value !== null && normalizeSourceUnit(value) !== value)) {
        throw new Error('local_unit_confirmation_invalid');
      }
      receipts.push(structuredClone(item) as unknown as MaterialConfirmation);
    }
    byOrder.set(entry.salesOrderId, receipts);
  }
  return { sourceKey, accountFingerprint, byOrder };
}

/** Reuses the existing request-local RR reader and exact evidence validation.
 * Missing/broken optional receipts remove only their added unit fact, never the source data. */
export function createLocalConfirmedMaterialPorts(pool: Pool, config: SourceReadConfig, options: {
  accountFingerprint: string; read: () => Promise<unknown>; onInvalid?: () => void;
}, now: () => number = Date.now): MaterialReadPorts {
  const base = createPersistedMaterialPorts(pool, config, now);
  const prepareBatch: NonNullable<MaterialReadPorts['prepareBatch']> = async (identity, ids) => {
    let ports = base;
    try {
      const raw = await options.read();
      if (raw !== null) ports = createPersistedMaterialPorts(pool, config, now,
        parseLocalUnitConfirmations(raw, config.sourceKey, options.accountFingerprint));
    } catch { options.onInvalid?.(); }
    return ports.prepareBatch!(identity, ids);
  };
  return {
    prepareBatch,
    resolveVisibleOrder: async (identity, id) => (await prepareBatch(identity, [id])).resolveVisibleOrder(identity, id),
    loadSource: async (order, identity) => (await prepareBatch(identity, [order.id])).loadSource!(order, identity),
    loadConfirmations: async (order, identity) => (await prepareBatch(identity, [order.id])).loadConfirmations!(order, identity),
  };
}
