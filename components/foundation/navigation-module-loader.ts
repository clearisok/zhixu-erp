type ModuleLoader = () => Promise<unknown>;

/** Code-only tasks: never fetch RSC, business data, credentials or persisted state. */
export function createNavigationModuleLoader(loaders: Readonly<Record<string, ModuleLoader>>) {
  const pending = new Map<string, Promise<void>>();
  return (path: string): Promise<void> => {
    const loader = Object.hasOwn(loaders, path) ? loaders[path] : undefined;
    if (!loader) return Promise.resolve();
    const existing = pending.get(path);
    if (existing) return existing;
    const task = Promise.resolve().then(loader).then(() => undefined).catch(() => {
      // Intent loading must not block navigation. A later explicit intent may retry.
      pending.delete(path);
    });
    pending.set(path, task);
    return task;
  };
}
