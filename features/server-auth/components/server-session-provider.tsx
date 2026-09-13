"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PermissionKey } from "../../permissions/model/permissions";
import { ServerAuthError, serverAuthClient, type ServerAuthClient } from "../server-auth-client";
import {
  anonymousServerSession,
  checkingServerSession,
  serverSessionHasPermission,
  type ServerSessionState,
} from "../server-session-model";
import {
  loginServerSession,
  logoutServerSession,
  restoreServerSession,
} from "../server-session-service";

type ServerSessionContextValue = ServerSessionState & {
  hasPermission(permission: PermissionKey): boolean;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  invalidate(): void;
};

const ServerSessionContext = createContext<ServerSessionContextValue | null>(null);

function safeRestoreError(error: unknown): string {
  if (error instanceof ServerAuthError) return error.message;
  return "无法确认织序 Server 登录状态，请稍后重试。";
}

export function ServerSessionProvider({
  children,
  client = serverAuthClient,
}: {
  children: ReactNode;
  client?: ServerAuthClient;
}) {
  const [state, setState] = useState<ServerSessionState>(checkingServerSession);
  const operation = useRef(0);

  const refresh = useCallback(async () => {
    const currentOperation = ++operation.current;
    setState(checkingServerSession);
    try {
      const next = await restoreServerSession(client);
      if (operation.current === currentOperation) setState(next);
    } catch (error) {
      if (operation.current === currentOperation) {
        setState({ status: "error", user: null, permissions: [], error: safeRestoreError(error) });
      }
    }
  }, [client]);

  useEffect(() => {
    const currentOperation = ++operation.current;
    void restoreServerSession(client).then(
      (next) => { if (operation.current === currentOperation) setState(next); },
      (error: unknown) => {
        if (operation.current === currentOperation) {
          setState({ status: "error", user: null, permissions: [], error: safeRestoreError(error) });
        }
      },
    );
    return () => { operation.current += 1; };
  }, [client]);

  const login = useCallback(async (username: string, password: string) => {
    const currentOperation = ++operation.current;
    try {
      const next = await loginServerSession(client, username, password);
      if (operation.current === currentOperation) setState(next);
    } catch (error) {
      if (operation.current === currentOperation) setState(anonymousServerSession);
      throw error;
    }
  }, [client]);

  const logout = useCallback(async () => {
    const currentOperation = ++operation.current;
    const next = await logoutServerSession(client);
    if (operation.current === currentOperation) setState(next);
  }, [client]);

  const invalidate = useCallback(() => {
    operation.current += 1;
    setState(anonymousServerSession);
  }, []);

  const value = useMemo<ServerSessionContextValue>(() => ({
    ...state,
    hasPermission: (permission) => serverSessionHasPermission(state, permission),
    login,
    logout,
    refresh,
    invalidate,
  }), [invalidate, login, logout, refresh, state]);

  return <ServerSessionContext.Provider value={value}>{children}</ServerSessionContext.Provider>;
}

export function useServerSession(): ServerSessionContextValue {
  const context = useContext(ServerSessionContext);
  if (!context) throw new Error("useServerSession must be used within ServerSessionProvider");
  return context;
}
