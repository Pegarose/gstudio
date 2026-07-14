export interface SseFrame {
  event?: string;
  data: string;
}

function parseFrame(rawFrame: string): SseFrame | null {
  let event: string | undefined;
  const data: string[] = [];

  for (const line of rawFrame.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).replace(/^ /, ""));
    }
  }

  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/**
 * Accumulates complete SSE frames across ReadableStream reader chunks. A frame
 * is intentionally emitted only after its blank-line delimiter arrives.
 */
export class SseFrameBuffer {
  private pending = "";

  append(chunk: string): SseFrame[] {
    this.pending += chunk;
    const records = this.pending.split(/\r?\n\r?\n/);
    this.pending = records.pop() ?? "";

    return records
      .map(parseFrame)
      .filter((frame): frame is SseFrame => frame !== null);
  }

  hasPendingData(): boolean {
    return this.pending.trim().length > 0;
  }
}
