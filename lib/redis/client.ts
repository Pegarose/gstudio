import { createClient } from "redis";

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (error) => console.error("[redis]", error));
  }

  if (!client.isOpen) {
    await client.connect();
    client.unref();
  }

  return client;
}
