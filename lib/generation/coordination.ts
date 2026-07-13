import { randomUUID } from "node:crypto";
import { getRedisClient } from "../redis/client";

const RELEASE_LOCK = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

function lockKey(generationId: string) {
  return `generation:${generationId}:lock`;
}

function eventChannel(generationId: string) {
  return `generation:${generationId}:events`;
}

function cancellationKey(generationId: string) {
  return `generation:${generationId}:cancelled`;
}

export async function acquireGenerationLock(
  generationId: string,
  ttlMs: number,
): Promise<string | null> {
  const token = randomUUID();
  const client = await getRedisClient();
  const result = await client.set(lockKey(generationId), token, {
    PX: ttlMs,
    NX: true,
  });

  return result === "OK" ? token : null;
}

export async function releaseGenerationLock(
  generationId: string,
  token: string,
): Promise<boolean> {
  const client = await getRedisClient();
  const released = await client.eval(RELEASE_LOCK, {
    keys: [lockKey(generationId)],
    arguments: [token],
  });

  return Number(released) === 1;
}

export async function publishGenerationEvent(
  generationId: string,
  event: unknown,
): Promise<number> {
  const client = await getRedisClient();
  return client.publish(eventChannel(generationId), JSON.stringify(event));
}

export async function subscribeGenerationEvents(
  generationId: string,
  listener: (event: unknown) => void,
): Promise<() => Promise<void>> {
  const client = await getRedisClient();
  const subscriber = client.duplicate();
  subscriber.on("error", (error) => console.error("[redis subscriber]", error));
  await subscriber.connect();
  subscriber.unref();

  const channel = eventChannel(generationId);
  const onMessage = (message: string) => listener(JSON.parse(message));
  await subscriber.subscribe(channel, onMessage);

  return async () => {
    await subscriber.unsubscribe(channel, onMessage);
    await subscriber.quit();
  };
}

export async function requestGenerationCancellation(generationId: string): Promise<void> {
  const client = await getRedisClient();
  await client.set(cancellationKey(generationId), "1");
}

export async function isGenerationCancelled(generationId: string): Promise<boolean> {
  const client = await getRedisClient();
  return (await client.get(cancellationKey(generationId))) === "1";
}
