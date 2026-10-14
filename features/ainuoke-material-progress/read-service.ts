import type { MaterialConfirmation } from './confirmed-facts.ts';
import type { MaterialSourceIssue } from './source-adapter.ts';
import type { TrustedIdentity } from '../../server/auth/session.ts';
import type { SalesOrderReadModel } from '../../server/sales-orders/model.ts';
import type { AinuokeReportSnapshot } from '../ainuoke-api/model/ainuoke-api.ts';
import { normalizeAinuokeSalesContractNo } from '../ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts';
import { orderMaterialNavigation, type OrderMaterialNavigation } from './order-navigation.ts';
import { projectMaterialProgress, type MaterialProgressView } from './projection.ts';

export type VisibleMaterialOrder = Pick<SalesOrderReadModel, 'id' | 'version' | 'salesContractNo' | 'styleNo' | 'insideOrderNo'>;
export type BoundMaterialSource = {
  salesOrderId: string; salesContractNo: string;
  provenance: 'synthetic' | 'server_snapshot'; snapshots: AinuokeReportSnapshot[]; issue?: MaterialSourceIssue;
};
export type OrderMaterialReadModel = {
  salesOrderId: string; orderVersion: number; navigation: OrderMaterialNavigation;
  provenance: 'not_connected' | 'synthetic' | 'server_snapshot'; progress: MaterialProgressView;
};
export type MaterialReadResult = { status: 200; body: OrderMaterialReadModel }
  | { status: 400 | 401 | 403 | 404 | 503; error: { code: string; message: string } };
export type MaterialReadPorts = {
  /** Optional request-local batch snapshot; preserves the same trust/freshness checks. */
  prepareBatch?: (identity: TrustedIdentity, salesOrderIds: string[]) => Promise<MaterialReadPorts>;
  /** Future Server adapter must enforce authorized team/order visibility before returning a scope.
   * This is an injected read capability, not a Repository or a client-provided trust flag.
   */
  resolveVisibleOrder: (identity: TrustedIdentity, salesOrderId: string) => Promise<VisibleMaterialOrder | null>;
  /** Absent by default. Gate 1.5 supplies an isolated injected adapter; no Bridge/DB wiring. */
  /** Trusted operator-reviewed injection only; never taken from the HTTP request. */
  loadConfirmations?: (order: VisibleMaterialOrder, identity: TrustedIdentity) => Promise<readonly MaterialConfirmation[]>;
  loadSource?: (order: VisibleMaterialOrder, identity: TrustedIdentity) => Promise<BoundMaterialSource | null>;
};
const failure = (status: 400 | 401 | 403 | 404 | 503, code: string, message: string): MaterialReadResult => ({ status, error: { code, message } });

/** Server-side preparation only. identity must be resolved by existing IdentityAuthority;
 * never accept it, a BillNo, an account identifier or return URL from an HTTP body.
 * Stateless: no raw/response cache, export writer, commercial-terms read or business write.
 */
export function createOrderMaterialReader(ports: MaterialReadPorts) {
  return async (identity: TrustedIdentity | null, request: unknown): Promise<MaterialReadResult> => {
    if (!identity) return failure(401, 'authentication_required', '需要可信织序身份。');
    if (!identity.permissions.includes('order.view') || !identity.permissions.includes('style_progress.read')) {
      return failure(403, 'material_read_forbidden', '没有订单或物料查看权限。');
    }
    if (!request || typeof request !== 'object' || Array.isArray(request)
      || Object.keys(request).length !== 1 || !Object.hasOwn(request, 'salesOrderId')) {
      return failure(400, 'invalid_order_request', '仅接受正式订单 UUID。');
    }
    const navigation = orderMaterialNavigation(Object.getOwnPropertyDescriptor(request, 'salesOrderId')?.value);
    if (!navigation) return failure(400, 'invalid_order_request', '仅接受正式订单 UUID。');
    try {
      const resolved = await ports.resolveVisibleOrder(identity, navigation.salesOrderId);
      if (!resolved) return failure(404, 'order_not_available', '订单不存在或不在授权范围内。');
      if (resolved.id.toLowerCase() !== navigation.salesOrderId || !Number.isSafeInteger(resolved.version) || resolved.version < 1) {
        return failure(503, 'order_scope_invalid', '可信订单关联暂不可用。');
      }
      // Do not forward an aggregate or future protected fields to a Source capability.
      const order: VisibleMaterialOrder = { id: navigation.salesOrderId, version: resolved.version,
        salesContractNo: resolved.salesContractNo, styleNo: resolved.styleNo, insideOrderNo: resolved.insideOrderNo };
      const progressOrder = { salesContractNo: order.salesContractNo ?? '', styleNo: order.styleNo, insideOrderNo: order.insideOrderNo ?? '' };
      const unconnected = (): MaterialReadResult => ({ status: 200, body: { salesOrderId: order.id, orderVersion: order.version,
        navigation, provenance: 'not_connected', progress: { ...projectMaterialProgress(progressOrder, null),
          sourceStatus: 'not_connected', message: '正式物料来源尚未接通；不会读取 Browser 本地数据。' } } });
      if (!ports.loadSource || !order.salesContractNo) return unconnected();
      const source = await ports.loadSource(order, identity);
      if (!source) return unconnected();
      if (source.salesOrderId.toLowerCase() !== order.id
        || normalizeAinuokeSalesContractNo(source.salesContractNo) !== normalizeAinuokeSalesContractNo(order.salesContractNo)
        || !['synthetic', 'server_snapshot'].includes(source.provenance)) {
        return failure(503, 'source_binding_invalid', '物料来源与可信订单关联不一致。');
      }
      return { status: 200, body: { salesOrderId: order.id, orderVersion: order.version, navigation,
        provenance: source.provenance, progress: source.issue ? { ...projectMaterialProgress(progressOrder, null), sourceStatus: source.issue,
          message: ({ source_failed: '物料来源读取失败；未使用缓存或 Browser 数据。', source_missing: '当前来源缺少合同关联或物料 Snapshot。',
            stale: '来源已超出可信读取时效；暂停物料状态判定。', incomplete: '来源分页或字段不完整；暂停物料状态判定。',
            identity_mismatch: '来源查询身份不一致；未关联物料。' } as const)[source.issue] }
          : projectMaterialProgress(progressOrder, source.snapshots, await ports.loadConfirmations?.(order, identity) ?? []) } };
    } catch {
      return failure(503, 'material_source_unavailable', '正式物料来源暂不可用；不会读取 Browser 本地数据。');
    }
  };
}
