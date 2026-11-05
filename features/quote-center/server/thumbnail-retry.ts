function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Only idempotent thumbnail reads, never uploads or auth/validation failures. */
export async function retryThumbnail<T>(read: () => Promise<T>, signal: AbortSignal, wait = pause): Promise<T> {
  const delays = [500, 1500];
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await read(); }
    catch (error) {
      const status = error && typeof error === "object" && "status" in error ? error.status : null;
      if (signal.aborted || attempt >= delays.length || ![502, 503, 504].includes(status as number)) throw error;
      await wait(delays[attempt], signal);
    }
  }
}
