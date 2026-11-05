/** Browser-memory reads only. No persistence, shared-server cache or credentials.
 * A session change invalidates in-flight consumers as well as settled entries.
 */
export function createSessionReadCache(now: () => number = Date.now) {
  let scope: string | null = null;
  let epoch = 0;
  const entries = new Map<string, { promise: Promise<unknown>; expires: number; once: boolean }>();
  const clear = () => { epoch++; entries.clear(); };
  const read = <T>(key: string, load: () => Promise<T>, ttl = 0, preload = false): Promise<T> => {
    if (scope === null) return load();
    const consumerEpoch = epoch;
    const consume = (value: unknown): T => {
      if (consumerEpoch !== epoch) throw new Error("Read scope changed; discard obsolete response");
      return structuredClone(value) as T;
    };
    const old = entries.get(key);
    if (old && old.expires > now()) {
      if (old.once && !preload) entries.delete(key);
      return old.promise.then(consume);
    }
    entries.delete(key);
    const generation = epoch;
    const entry = { promise: Promise.resolve() as Promise<unknown>, expires: Infinity, once: preload };
    entry.promise = Promise.resolve().then(load).then(value => {
      if (generation !== epoch) throw new Error("Read scope changed; discard obsolete response");
      entry.expires = now() + (preload ? 5_000 : ttl);
      if (!ttl && !preload && entries.get(key) === entry) entries.delete(key);
      return value;
    }).catch(error => {
      if (entries.get(key) === entry) entries.delete(key);
      if (error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 403)) clear();
      throw error;
    });
    if (entries.size >= 64) entries.delete(entries.keys().next().value!);
    entries.set(key, entry);
    return entry.promise.then(consume);
  };
  return {
    read,
    preload: <T>(key: string, load: () => Promise<T>) => read(key, load, 0, true),
    clear,
    setScope(next: string | null) { if (next !== scope) { clear(); scope = next; } },
  };
}

export const masterReadCache = createSessionReadCache();
export const navigationReadCache = createSessionReadCache();
export function clearSessionReads() { masterReadCache.clear(); navigationReadCache.clear(); }
export function setSessionReadScope(scope: string | null) { masterReadCache.setScope(scope); navigationReadCache.setScope(scope); }
