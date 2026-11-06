import { adaptItMaterialSnapshots } from '../style-progress/source/ainuoke-it-material-adapter.ts';
import type { TrustedIdentity } from '../../server/auth/session.ts';
import type { AinuokeOrderDiscoveryQuery, AinuokeReportSnapshot } from '../ainuoke-api/model/ainuoke-api.ts';
import { AINUOKE_REPORT_CATALOG } from '../ainuoke-api/model/ainuoke-api.ts';
import { adaptAinuokeOrderDiscoverySnapshots } from '../ainuoke-api/source/ainuoke-order-discovery-adapter.ts';
import { normalizeAinuokeInsideOrderNo, normalizeAinuokeSalesContractNo } from '../ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts';
import type { BoundMaterialSource, MaterialReadPorts, VisibleMaterialOrder } from './read-service.ts';
import { orderMaterialNavigation } from './order-navigation.ts';

export type MaterialSourceIssue = 'source_failed' | 'source_missing' | 'stale' | 'incomplete' | 'identity_mismatch';
export type MaterialSourceAdapterPorts = {
  /** Same trusted Server visibility resolver as the reader; never a client-provided scope. */
  resolveVisibleOrder: MaterialReadPorts['resolveVisibleOrder'];
  /** Server-installed, account-scoped fixed catalog capabilities. No account/report selector from requests. */
  readDiscovery: (identity: TrustedIdentity) => Promise<ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>> | null>;
  readMaterial: (identity: TrustedIdentity, report: 'material_purchase_statistics', query: { insideOrderNo: string }) => Promise<AinuokeReportSnapshot[] | null>;
  provenance: 'synthetic' | 'server_snapshot';
  /** Deployment policy is deliberately required, not an invented business default. */
  maxAgeMs: number;
  now: () => number;
};

/** Isolated read capability only: no network, credentials, persistence or material algorithms.
 * Dependencies must be installed by a trusted Server, after account/scope approval.
 * Null means capability unconnected; complete empty material pages remain valid snapshots.
 */
export function createMaterialSourceLoader(ports: MaterialSourceAdapterPorts): NonNullable<MaterialReadPorts['loadSource']> {
  if (!Number.isFinite(ports.maxAgeMs) || ports.maxAgeMs < 0) throw new Error('invalid_material_freshness_policy');
  if (!['synthetic', 'server_snapshot'].includes(ports.provenance)) throw new Error('invalid_material_provenance');
  return async (candidate, identity) => {
    const failed = (order: VisibleMaterialOrder, issue: MaterialSourceIssue): BoundMaterialSource => ({
      salesOrderId: order.id, salesContractNo: order.salesContractNo ?? '', provenance: ports.provenance, snapshots: [], issue,
    });
    if (!identity.permissions.includes('order.view') || !identity.permissions.includes('style_progress.read')) {
      throw new Error('material_read_forbidden');
    }
    const navigation = orderMaterialNavigation(candidate.id);
    if (!navigation) throw new Error('invalid_order_scope');
    // Independently resolve scope so invoking the loader directly cannot bypass order isolation.
    const resolved = await ports.resolveVisibleOrder(identity, navigation.salesOrderId);
    if (!resolved || resolved.id.toLowerCase() !== navigation.salesOrderId
      || resolved.version !== candidate.version
      || normalizeAinuokeSalesContractNo(resolved.salesContractNo) !== normalizeAinuokeSalesContractNo(candidate.salesContractNo)) {
      throw new Error('order_scope_unavailable');
    }
    const order: VisibleMaterialOrder = { id: navigation.salesOrderId, version: resolved.version,
      salesContractNo: resolved.salesContractNo, styleNo: resolved.styleNo, insideOrderNo: resolved.insideOrderNo };
    const contract = normalizeAinuokeSalesContractNo(order.salesContractNo);
    if (!contract) return failed(order, 'source_missing');
    const freshnessIssue = (pages: ReadonlyArray<{ fetchedAt: string }>): MaterialSourceIssue | null => {
      // Sample the trusted clock at validation, after the asynchronous snapshot read.
      const validationTime = ports.now();
      if (!Number.isFinite(validationTime)) return 'source_failed';
      return pages.every(page => {
        const time = Date.parse(page.fetchedAt);
        return Number.isFinite(time) && time <= validationTime && validationTime - time <= ports.maxAgeMs;
      }) ? null : 'stale';
    };
    let discoveryPages: Awaited<ReturnType<MaterialSourceAdapterPorts['readDiscovery']>>;
    try { discoveryPages = await ports.readDiscovery(identity); } catch { return failed(order, 'source_failed'); }
    if (discoveryPages === null) return null;
    let discovery;
    try {
      // Supplement integer/time validation at this boundary; all mapping/unique BillNo rules stay in the existing adapter.
      if (!discoveryPages.length || discoveryPages.some(page => !Number.isSafeInteger(page.total) || page.total < 0
        || !Number.isSafeInteger(page.pageSize) || page.pageSize < 1 || !Number.isFinite(Date.parse(page.fetchedAt)))) {
        return failed(order, 'incomplete');
      }
      discovery = await adaptAinuokeOrderDiscoverySnapshots(discoveryPages);
    } catch { return failed(order, 'incomplete'); }
    const discoveryIssue = freshnessIssue(discoveryPages);
    if (discoveryIssue) return failed(order, discoveryIssue);
    const relationship = discovery.rows.find(row => row.salesContractNo === contract);
    if (!relationship) return failed(order, 'source_missing');
    // Exact normalized BillNo only; never style matching or a second Matcher.
    const insideOrderNo = relationship.insideOrderNo;
    let pages: AinuokeReportSnapshot[] | null;
    try { pages = await ports.readMaterial(identity, 'material_purchase_statistics', { insideOrderNo }); }
    catch { return failed(order, 'source_failed'); }
    if (pages === null) return null;
    if (!pages.length) return failed(order, 'source_missing');
    if (pages.some(page => page.reportId === '6087051')) {
      try { const parsed = adaptItMaterialSnapshots(pages); if (parsed.metadata.query.salesContractNo !== contract) return failed(order, 'identity_mismatch'); }
      catch { return failed(order, 'incomplete'); }
    } else if (pages.some(page => page.reportId !== AINUOKE_REPORT_CATALOG.material_purchase_statistics.reportId
      || Object.keys(page.queryContext).length !== 1
      || normalizeAinuokeInsideOrderNo(page.queryContext.insideOrderNo) !== normalizeAinuokeInsideOrderNo(insideOrderNo))) {
      return failed(order, 'identity_mismatch');
    }
    if (pages.some(page => !Number.isFinite(Date.parse(page.fetchedAt)))) return failed(order, 'incomplete');
    const materialIssue = freshnessIssue(pages);
    if (materialIssue) return failed(order, materialIssue);
    // Detach provider snapshots; sole read projection performs Material Normalize/Dedup/Validate and completeness checks.
    return { salesOrderId: order.id, salesContractNo: contract, provenance: ports.provenance, snapshots: structuredClone(pages) };
  };
}
