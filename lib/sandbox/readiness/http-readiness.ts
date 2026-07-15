export type HttpReadinessResult = {
  ready: boolean;
  lastError?: string;
};

export type HttpReadinessOptions = {
  url: string;
  timeoutMs: number;
  intervalMs?: number;
  stableSuccesses?: number;
  isReady?: (response: Response) => boolean | Promise<boolean>;
  fetchImpl?: typeof fetch;
};

export async function waitForHttpReady({
  url,
  timeoutMs,
  intervalMs = 250,
  stableSuccesses = 1,
  isReady,
  fetchImpl = fetch,
}: HttpReadinessOptions): Promise<HttpReadinessResult> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | undefined;
  let consecutiveSuccesses = 0;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    const controller = new AbortController();
    const timeoutError = new Error('HTTP readiness request timed out');
    const timeout = setTimeout(() => controller.abort(timeoutError), remainingMs);
    const abortPromise = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(controller.signal.reason ?? timeoutError);
      }, { once: true });
    });

    try {
      const response = await Promise.race([
        fetchImpl(url, { signal: controller.signal }),
        abortPromise,
      ]);
      if (response.ok) {
        const contentReady = isReady ? await isReady(response) : true;
        if (contentReady) {
          consecutiveSuccesses += 1;
          if (consecutiveSuccesses >= Math.max(1, stableSuccesses)) {
            return { ready: true };
          }
        } else {
          consecutiveSuccesses = 0;
          lastError = 'HTTP 200 readiness predicate not satisfied';
        }
      } else {
        consecutiveSuccesses = 0;
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      consecutiveSuccesses = 0;
    } finally {
      clearTimeout(timeout);
    }

    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { ready: false, lastError };
}
