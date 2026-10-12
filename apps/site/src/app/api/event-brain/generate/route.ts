import { createGenerationHandler } from '@/lib/event-brain/http';
import { createOpenAIProvider } from '@/lib/event-brain/service';

export const runtime = 'nodejs';

export const POST = createGenerationHandler({
  createProvider: createOpenAIProvider,
});
