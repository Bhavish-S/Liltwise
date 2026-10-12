import {
  DocumentExtractionError,
  extractEventGuideText,
  readLimitedBytes,
  UploadTooLargeError,
} from './documents.ts';
import { createMemoryRateLimiter } from './http.ts';

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function createGuideExtractionHandler(
  extract = extractEventGuideText,
  allowRequest = createMemoryRateLimiter(10, 10 * 60 * 1000),
) {
  return async function handleExtraction(request: Request): Promise<Response> {
    const caller = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim()
      || 'unknown').slice(0, 128);
    if (!allowRequest(caller)) {
      return json({ error: { code: 'UPLOAD_RATE_LIMIT', message: 'Too many document uploads. Wait a few minutes and try again.' } }, 429);
    }

    const filename = new URL(request.url).searchParams.get('name') ?? '';
    const mimeType = request.headers.get('content-type') ?? '';
    try {
      const buffer = await readLimitedBytes(request);
      const extracted = await extract(filename, mimeType, buffer);
      return json(extracted, 200);
    } catch (error) {
      if (error instanceof DocumentExtractionError || error instanceof UploadTooLargeError) {
        return json({ error: { code: error.code, message: error.message } }, error.status);
      }
      return json({ error: { code: 'DOCUMENT_EXTRACTION_FAILED', message: 'The file could not be read. Try saving it again as TXT, Markdown, PDF, or DOCX.' } }, 422);
    }
  };
}
