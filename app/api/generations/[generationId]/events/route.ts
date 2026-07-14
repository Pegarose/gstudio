import { z } from "zod";
import { listGenerationEvents } from "@/lib/generation/event-repository";
import { getGeneration } from "@/lib/generation/repository";
import { subscribeGenerationEvents } from "@/lib/generation/coordination";

const GenerationParamsSchema = z.object({ generationId: z.string().uuid() });
const AfterSchema = z.coerce.number().int().nonnegative().default(0);
const terminalStatuses = new Set(["passed", "failed", "cancelled"]);
const encoder = new TextEncoder();

function isTerminalEvent(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const candidate = event as { status?: unknown; payload?: { status?: unknown } };
  return terminalStatuses.has(String(candidate.status ?? candidate.payload?.status ?? ""));
}

function encodeEvent(event: unknown) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ generationId: string }> },
) {
  const parsedParams = GenerationParamsSchema.safeParse(await params);
  const parsedAfter = AfterSchema.safeParse(new URL(request.url).searchParams.get("after") ?? 0);
  if (!parsedParams.success || !parsedAfter.success) {
    return new Response(JSON.stringify({ error: "Invalid events request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const generation = await getGeneration(parsedParams.data.generationId);
    if (!generation) {
      return new Response(JSON.stringify({ error: "Generation not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const initiallyTerminal = terminalStatuses.has(generation.status);
    let unsubscribe: (() => Promise<void>) | undefined;
    let cleanedUp = false;

    async function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      await unsubscribe?.();
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const bufferedEvents: unknown[] = [];
        let replaying = true;
        const seenSequences = new Set<number>();
        try {
          unsubscribe = await subscribeGenerationEvents(parsedParams.data.generationId, (event) => {
            if (replaying) {
              bufferedEvents.push(event);
              return;
            }
            const sequence = event && typeof event === "object" ? (event as { sequence?: unknown }).sequence : undefined;
            if (typeof sequence === "number" && seenSequences.has(sequence)) return;
            if (typeof sequence === "number") seenSequences.add(sequence);
            controller.enqueue(encodeEvent(event));
            if (isTerminalEvent(event)) void cleanup().finally(() => controller.close());
          });

          const persistedEvents = (await listGenerationEvents(parsedParams.data.generationId))
            .filter((event) => event.sequence > parsedAfter.data);
          for (const event of persistedEvents) {
            seenSequences.add(event.sequence);
            controller.enqueue(encodeEvent(event));
          }

          replaying = false;
          for (const event of bufferedEvents) {
            const sequence = event && typeof event === "object" ? (event as { sequence?: unknown }).sequence : undefined;
            if (typeof sequence === "number" && seenSequences.has(sequence)) continue;
            if (typeof sequence === "number") seenSequences.add(sequence);
            controller.enqueue(encodeEvent(event));
            if (isTerminalEvent(event)) {
              await cleanup();
              controller.close();
              return;
            }
          }

          if (initiallyTerminal || persistedEvents.some(isTerminalEvent)) {
            await cleanup();
            controller.close();
          }
        } catch (error) {
          await cleanup();
          controller.error(error);
        }
      },
      async cancel() {
        await cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  } catch (error) {
    console.error("[generations] Error streaming events:", error);
    return new Response(JSON.stringify({ error: "Failed to stream generation events" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
