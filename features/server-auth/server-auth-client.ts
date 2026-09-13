import { PERMISSION_KEYS, type PermissionKey } from "../permissions/model/permissions";

export type ServerSessionUser = {
  id: string;
  username: string;
  name: string;
};

export type ServerAuthentication = {
  user: ServerSessionUser;
  permissions: PermissionKey[];
};

export type ServerAuthClient = {
  login(username: string, password: string): Promise<ServerAuthentication>;
  logout(): Promise<void>;
  getMe(): Promise<ServerSessionUser>;
  getPermissions(): Promise<PermissionKey[]>;
};

const safeCodes = new Set([
  "invalid_credentials",
  "login_rate_limited",
  "authentication_required",
  "permission_denied",
  "database_unavailable",
  "internal_error",
]);
const permissionKeys = new Set<string>(PERMISSION_KEYS);

function safeMessage(status: number, code: string): string {
  if (code === "invalid_credentials") return "Server 账号或密码不正确。";
  if (code === "login_rate_limited" || status === 429) return "登录尝试过于频繁，请稍后再试。";
  if (code === "authentication_required" || status === 401) return "请登录织序 Server。";
  if (code === "permission_denied" || status === 403) return "当前 Server 账号没有执行此操作的权限。";
  if (code === "database_unavailable" || status === 503) return "织序 Server 暂时不可用，请稍后再试。";
  return "织序 Server 请求失败，请稍后再试。";
}

export class ServerAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = safeMessage(status, code),
  ) {
    super(message);
    this.name = "ServerAuthError";
  }
}

function safeCode(status: number, code: unknown): string {
  if (typeof code === "string" && safeCodes.has(code)) return code;
  if (status === 401) return "authentication_required";
  if (status === 403) return "permission_denied";
  if (status === 429) return "login_rate_limited";
  if (status === 503) return "database_unavailable";
  return "internal_error";
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json() as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readUser(value: unknown): ServerSessionUser {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServerAuthError(500, "internal_error");
  }
  const user = value as Record<string, unknown>;
  if (typeof user.id !== "string" || !user.id
    || typeof user.username !== "string" || !user.username
    || typeof user.name !== "string") {
    throw new ServerAuthError(500, "internal_error");
  }
  return { id: user.id, username: user.username, name: user.name };
}

function readPermissions(value: unknown): PermissionKey[] {
  if (!Array.isArray(value) || value.some((permission) => typeof permission !== "string")) {
    throw new ServerAuthError(500, "internal_error");
  }
  return [...new Set(value.filter((permission): permission is PermissionKey => permissionKeys.has(permission)))];
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const payload = await responsePayload(response);
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)
      ? payload.error as Record<string, unknown>
      : {};
    const code = safeCode(response.status, error.code);
    throw new ServerAuthError(response.status, code);
  }
  return payload;
}

export function createServerAuthClient(options: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
} = {}): ServerAuthClient {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/u, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      throw new ServerAuthError(0, "database_unavailable");
    }
    return parseResponse(response);
  }

  return {
    async login(username, password) {
      const payload = await request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zhixu-Request": "1",
        },
        body: JSON.stringify({ username, password }),
      });
      return {
        user: readUser(payload.user),
        permissions: readPermissions(payload.permissions),
      };
    },
    async logout() {
      await request("/api/v1/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zhixu-Request": "1",
        },
        body: "{}",
      });
    },
    async getMe() {
      const payload = await request("/api/v1/auth/me");
      return readUser(payload.user);
    },
    async getPermissions() {
      const payload = await request("/api/v1/auth/permissions");
      return readPermissions(payload.permissions);
    },
  };
}

export const serverAuthClient = createServerAuthClient();
