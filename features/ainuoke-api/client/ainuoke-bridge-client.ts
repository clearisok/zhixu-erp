import type {
  AinuokeAccountView,
  AinuokeDetailReportKey,
  AinuokeOrderDiscoveryQuery,
  AinuokeReportQuery,
  AinuokeReportSnapshot,
} from "../model/ainuoke-api.ts";
import { AINUOKE_REPORT_CATALOG } from "../model/ainuoke-api.ts";

export const DEFAULT_AINUOKE_BRIDGE_URL = "http://127.0.0.1:8765";

type FetchLike = typeof fetch;
type BridgeSession = { csrfToken: string };

export class AinuokeBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AinuokeBridgeError";
    this.code = code;
  }
}

export function createAinuokeBridgeClient(options: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_AINUOKE_BRIDGE_URL).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  let activeUserId: string | null = null;
  let session: BridgeSession | null = null;

  const parse = async <T>(response: Response): Promise<T> => {
    const body = await response.json() as T & { error?: { code?: string; message?: string } };
    if (!response.ok) throw new AinuokeBridgeError(body.error?.code ?? "bridge_error", body.error?.message ?? "本地艾诺科 Bridge 请求失败");
    return body;
  };

  const createSession = async (userId: string): Promise<BridgeSession> => {
    const response = await fetchImpl(`${baseUrl}/v1/session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const next = await parse<BridgeSession>(response);
    activeUserId = userId;
    session = next;
    return next;
  };

  const ensureSession = async (userId: string): Promise<BridgeSession> => activeUserId === userId && session ? session : createSession(userId);

  const request = async <T>(userId: string, path: string, init: RequestInit = {}): Promise<T> => {
    const bridgeSession = await ensureSession(userId);
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.method && init.method !== "GET" ? { "X-Zhixu-CSRF": bridgeSession.csrfToken } : {}),
        ...init.headers,
      },
    });
    return parse<T>(response);
  };

  const readReport = (userId: string, reportKey: AinuokeDetailReportKey, input: { page?: number; pageSize?: number; query: AinuokeReportQuery }) => request<AinuokeReportSnapshot>(userId, `/v1/ainuoke/reports/${reportKey}/query`, {
    method: "POST",
    body: JSON.stringify({ page: input.page ?? 1, pageSize: input.pageSize ?? 100, query: input.query }),
  });

  const readOrderDiscoveryPage = (userId: string, input: { page?: number; pageSize?: number } = {}) => request<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>(userId, "/v1/ainuoke/reports/order_discovery/query", {
    method: "POST",
    body: JSON.stringify({ page: input.page ?? 1, pageSize: input.pageSize ?? 50, query: {} }),
  });

  const readGarmentColorSizePage = (userId: string, input: { page?: number; pageSize?: number; insideOrderNo: string }) => readReport(
    userId,
    "garment_color_size_details",
    { page: input.page, pageSize: input.pageSize, query: { insideOrderNo: input.insideOrderNo } },
  );

  const readAllReportPages = async (userId: string, reportKey: AinuokeDetailReportKey, input: { pageSize?: number; maxPages?: number; query: AinuokeReportQuery }) => {
    const snapshots: AinuokeReportSnapshot[] = [];
    const pageSize = input.pageSize ?? 50;
    const maxPages = input.maxPages ?? 100;
    const insideOrderNo = input.query.insideOrderNo.normalize("NFKC").trim();
    if (!insideOrderNo) throw new AinuokeBridgeError("report_query_invalid", "艾诺科报表 InsideOrderNo 不能为空");
    const expectedReportId = AINUOKE_REPORT_CATALOG[reportKey].reportId;
    let expectedTotal: number | null = null;
    let readCount = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const snapshot = await readReport(userId, reportKey, { page, pageSize, query: { insideOrderNo } });
      if (snapshot.reportId !== expectedReportId
        || snapshot.page !== page
        || snapshot.pageSize !== pageSize
        || snapshot.queryContext.insideOrderNo.normalize("NFKC").trim() !== insideOrderNo) {
        throw new AinuokeBridgeError("report_contract_mismatch", "艾诺科 detail 响应与固定只读协议不一致");
      }
      if (expectedTotal === null) expectedTotal = snapshot.total;
      if (snapshot.total !== expectedTotal || snapshot.rows.length > pageSize) {
        throw new AinuokeBridgeError("report_paging_mismatch", "艾诺科 detail 分页总数不一致");
      }
      snapshots.push(snapshot);
      readCount += snapshot.rows.length;
      if (readCount === expectedTotal) return snapshots;
      if (readCount > expectedTotal || snapshot.rows.length === 0 || snapshot.rows.length < pageSize) {
        throw new AinuokeBridgeError("report_incomplete", "艾诺科 detail 未读取完整分页");
      }
    }
    throw new AinuokeBridgeError("paging_limit", `艾诺科报表超过 ${maxPages} 页安全上限，已停止读取`);
  };

  return {
    getAccount(userId: string) {
      return request<AinuokeAccountView>(userId, "/v1/ainuoke/account", { method: "GET" });
    },
    putAccount(userId: string, credential: { username: string; password: string }) {
      return request<AinuokeAccountView>(userId, "/v1/ainuoke/account", { method: "PUT", body: JSON.stringify(credential) });
    },
    testAccount(userId: string, credential?: { username: string; password: string }) {
      return request<AinuokeAccountView>(userId, "/v1/ainuoke/account/test", { method: "POST", body: JSON.stringify(credential ?? {}) });
    },
    async deleteAccount(userId: string) {
      const result = await request<{ deleted: true }>(userId, "/v1/ainuoke/account", { method: "DELETE" });
      activeUserId = null;
      session = null;
      return result;
    },
    readReport,
    readGarmentColorSizePage,
    readOrderDiscoveryPage,
    async readAllOrderDiscoveryPages(userId: string, input: { pageSize?: number; maxPages?: number } = {}) {
      const snapshots: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[] = [];
      const pageSize = input.pageSize ?? 50;
      const maxPages = input.maxPages ?? 100;
      let expectedTotal: number | null = null;
      let readCount = 0;
      for (let page = 1; page <= maxPages; page += 1) {
        const snapshot = await readOrderDiscoveryPage(userId, { page, pageSize });
        if (snapshot.reportId !== "6086103" || snapshot.page !== page || snapshot.pageSize !== pageSize || Object.keys(snapshot.queryContext).length !== 0) {
          throw new AinuokeBridgeError("discovery_contract_mismatch", "艾诺科订单发现响应与固定只读协议不一致");
        }
        if (expectedTotal === null) expectedTotal = snapshot.total;
        if (snapshot.total !== expectedTotal || snapshot.rows.length > pageSize) {
          throw new AinuokeBridgeError("discovery_paging_mismatch", "艾诺科订单发现分页总数不一致");
        }
        snapshots.push(snapshot);
        readCount += snapshot.rows.length;
        if (readCount === expectedTotal) return snapshots;
        if (readCount > expectedTotal || snapshot.rows.length === 0 || snapshot.rows.length < pageSize) {
          throw new AinuokeBridgeError("discovery_incomplete", "艾诺科订单发现未读取完整分页");
        }
      }
      throw new AinuokeBridgeError("paging_limit", `艾诺科订单发现超过 ${maxPages} 页安全上限，已停止读取`);
    },
    readAllReportPages,
    async readAllGarmentColorSizePages(userId: string, input: { insideOrderNo: string; pageSize?: number; maxPages?: number }) {
      return readAllReportPages(userId, "garment_color_size_details", {
        pageSize: input.pageSize,
        maxPages: input.maxPages,
        query: { insideOrderNo: input.insideOrderNo },
      });
    },
    clearSession() {
      activeUserId = null;
      session = null;
    },
  };
}

export const ainuokeBridgeClient = createAinuokeBridgeClient();
