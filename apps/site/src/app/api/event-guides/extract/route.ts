import { createGuideExtractionHandler } from '@/lib/event-brain/uploads';

export const runtime = 'nodejs';

export const POST = createGuideExtractionHandler();
