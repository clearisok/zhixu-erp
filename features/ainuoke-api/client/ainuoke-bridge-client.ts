import type { AinuokeAccountView, AinuokeReportKey, AinuokeReportQuery, AinuokeReportSnapshot } from "../model/ainuoke-api.ts";

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
    readReport(userId: string, reportKey: AinuokeReportKey, input: { page?: number; pageSize?: number; query: AinuokeReportQuery }) {
      return request<AinuokeReportSnapshot>(userId, `/v1/ainuoke/reports/${reportKey}/query`, {
        method: "POST",
        body: JSON.stringify({ page: input.page ?? 1, pageSize: input.pageSize ?? 100, query: input.query }),
      });
    },
    clearSession() {
      activeUserId = null;
      session = null;
    },
  };
}

export const ainuokeBridgeClient = createAinuokeBridgeClient();
