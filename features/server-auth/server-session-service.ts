import {
  ServerAuthError,
  type ServerAuthClient,
} from "./server-auth-client";
import {
  anonymousServerSession,
  authenticatedServerSession,
  type ServerSessionState,
} from "./server-session-model";

async function loadAuthenticatedSession(client: ServerAuthClient): Promise<ServerSessionState> {
  const user = await client.getMe();
  const permissions = await client.getPermissions();
  return authenticatedServerSession(user, permissions);
}

export async function restoreServerSession(client: ServerAuthClient): Promise<ServerSessionState> {
  try {
    return await loadAuthenticatedSession(client);
  } catch (error) {
    if (error instanceof ServerAuthError && error.status === 401) return anonymousServerSession;
    throw error;
  }
}

export async function loginServerSession(
  client: ServerAuthClient,
  username: string,
  password: string,
): Promise<ServerSessionState> {
  await client.login(username, password);
  return loadAuthenticatedSession(client);
}

export async function logoutServerSession(client: ServerAuthClient): Promise<ServerSessionState> {
  try {
    await client.logout();
  } catch (error) {
    if (!(error instanceof ServerAuthError && error.status === 401)) throw error;
  }
  return anonymousServerSession;
}
