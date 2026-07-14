import assert from "node:assert/strict";
import test from "node:test";

import { SseFrameBuffer } from "../../app/generation/sse-frame-buffer";

function readWithLegacyLineParser(chunks: string[]): string[] {
  const eventTypes: string[] = [];

  for (const chunk of chunks) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;

      try {
        eventTypes.push(JSON.parse(line.slice(6)).type);
      } catch {
        // The former builder parser discarded partial JSON instead of saving it
        // for the next reader chunk.
      }
    }
  }

  return eventTypes;
}

test("retains validation and terminal apply SSE frames split across arbitrary reader chunks", () => {
  const stream = [
    "event: validation-report\n",
    'data: {"type":"validation-report","message":"Checks completed"}\n\n',
    "event: complete\n",
    'data: {"type":"complete","results":{"filesCreated":[]}}\n\n',
  ].join("");
  const chunks = Array.from(stream);

  assert.deepEqual(readWithLegacyLineParser(chunks), []);

  const parser = new SseFrameBuffer();
  const frames = chunks.flatMap((chunk) => parser.append(chunk));

  assert.deepEqual(
    frames.map((frame) => ({
      event: frame.event,
      type: JSON.parse(frame.data).type,
    })),
    [
      { event: "validation-report", type: "validation-report" },
      { event: "complete", type: "complete" },
    ],
  );
  assert.equal(parser.hasPendingData(), false);
});

test("does not turn an unterminated partial SSE record into a terminal event", () => {
  const parser = new SseFrameBuffer();
  const frames = parser.append('data: {"type":"complete"');

  assert.deepEqual(frames, []);
  assert.equal(parser.hasPendingData(), true);
});
