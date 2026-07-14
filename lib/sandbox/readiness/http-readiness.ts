export type HttpReadinessResult = {
  ready: boolean;
  lastError?: string;
};

export type HttpReadinessOptions = {
  url: string;
  timeoutMs: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
};

export async function waitForHttpReady({
  url,
  timeoutMs,
  intervalMs = 250,
  fetchImpl = fetch,
}: HttpReadinessOptions): Promise<HttpReadinessResult> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | undefined;

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
      if (response.ok) return { ready: true };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }

    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { ready: false, lastError };
}
