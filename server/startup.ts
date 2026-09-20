export type ServerStartupSteps = {
  verifyMigrations: () => Promise<unknown>;
  synchronizePermissions: () => Promise<unknown>;
  bootstrapAdmin: () => Promise<unknown>;
  listen: () => Promise<void>;
};

export async function initializeServer(steps: ServerStartupSteps): Promise<void> {
  await steps.verifyMigrations();
  await steps.synchronizePermissions();
  await steps.bootstrapAdmin();
  await steps.listen();
}
