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
    try {
      const response = await fetchImpl(url);
      if (response.ok) return { ready: true };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { ready: false, lastError };
}

