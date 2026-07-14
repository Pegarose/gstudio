import { createApplyAiCodeStreamRoute } from '@/lib/generation/live/apply-ai-code-stream-route';

// App Router modules may export handlers only. The implementation factory
// lives outside this module so integration tests can exercise the same POST
// and SSE behavior with deterministic collaborators.
export const POST = createApplyAiCodeStreamRoute();
