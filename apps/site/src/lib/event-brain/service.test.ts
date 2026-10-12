import assert from 'node:assert/strict';
import test from 'node:test';
import { eventBriefSchema, eventBrainGenerationRequestSchema, generatedScriptSchema } from '@liltwise/contracts';
import { countWords } from '@liltwise/domain';
import { createGenerationHandler } from './http.ts';
import { EventBrainError, eventBrainErrorResponse, generateEventScript, readAIConfiguration } from './service.ts';
import { validDraft, validEvent } from './test-fixtures.ts';

test('validates required event details, guests, and agenda rows', () => {
  assert.equal(eventBriefSchema.safeParse(validEvent).success, true);
  assert.equal(eventBriefSchema.safeParse({ ...validEvent, title: '' }).success, false);
  assert.equal(eventBriefSchema.safeParse({ ...validEvent, guests: [{ ...validEvent.guests[0], name: '' }] }).success, false);
  assert.equal(eventBriefSchema.safeParse({ ...validEvent, agenda: [{ ...validEvent.agenda[0], title: '' }] }).success, false);
});

test('requires a custom role and tone when those options are selected', () => {
  assert.equal(eventBriefSchema.safeParse({ ...validEvent, speakingRole: 'custom', customRole: '' }).success, false);
  assert.equal(eventBriefSchema.safeParse({ ...validEvent, tone: 'custom', customTone: '' }).success, false);
});

test('validates generated script sections before returning them', async () => {
  const result = await generateEventScript({ mode: 'full', event: validEvent }, async () => validDraft, 'mock-model');
  assert.equal(result.totalWordCount, result.sections.reduce((sum, section) => sum + countWords(section.speechText), 0));
  assert.equal(result.sections[0]?.estimatedSeconds, 4);
  assert.equal(generatedScriptSchema.safeParse(result).success, true);
  await assert.rejects(
    generateEventScript({ mode: 'full', event: validEvent }, async () => ({ title: 'broken', sections: [] }), 'mock-model'),
    (error: unknown) => error instanceof EventBrainError && error.code === 'INVALID_MODEL_OUTPUT',
  );
});

test('rejects requests that fail the runtime event schema', async () => {
  assert.equal(eventBrainGenerationRequestSchema.safeParse({ mode: 'full', event: validEvent }).success, true);
  await assert.rejects(generateEventScript({ mode: 'full', event: { ...validEvent, purpose: '' } }, async () => validDraft, 'mock-model'), (error: unknown) => error instanceof EventBrainError && error.status === 400);
});

test('section regeneration keeps every unaffected edited section and recalculates totals', async () => {
  const edited = { ...validDraft, sections: validDraft.sections.map((section) => section.id === 'welcome' ? { ...section, speechText: 'My carefully edited first section.' } : section) };
  const response = await generateEventScript({ mode: 'section', event: validEvent, script: edited, sectionId: 'welcome', instruction: 'Make this welcome more concise.' }, async () => ({ ...validDraft.sections[0], id: 'model-returned-another-id', speechText: 'Good evening, everyone.' }), 'mock-model');
  assert.equal(response.sections[0]?.id, 'welcome');
  assert.equal(response.sections[0]?.speechText, 'Good evening, everyone.');
  assert.equal(response.sections[1]?.id, edited.sections[1]?.id);
  assert.equal(response.sections[1]?.speechText, edited.sections[1]?.speechText);
  assert.equal(response.totalWordCount, 12);
});

test('returns a safe setup error without exposing or requiring credentials in tests', async () => {
  assert.equal(readAIConfiguration({}), null);
  assert.equal(readAIConfiguration({ OPENAI_API_KEY: 'server-key', OPENAI_MODEL: 'bad model name' }), null);
  const handler = createGenerationHandler({ environment: () => ({}), allowRequest: () => true });
  const response = await handler(new Request('http://localhost/api/event-brain/generate', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503);
  assert.match((await response.text()), /OPENAI_API_KEY and OPENAI_MODEL/u);
});

test('handles provider outage, timeout, and oversized event context safely', async () => {
  await assert.rejects(generateEventScript({ mode: 'full', event: validEvent }, async () => { throw new Error('private provider details'); }, 'mock-model'), (error: unknown) => {
    const mapped = eventBrainErrorResponse(error);
    return mapped.status === 503 && !mapped.body.error.message.includes('private provider details');
  });
  await assert.rejects(generateEventScript({ mode: 'full', event: validEvent }, () => new Promise(() => {}), 'mock-model', 5), (error: unknown) => eventBrainErrorResponse(error).status === 504);
  const largeEvent = { ...validEvent, eventGuide: 'x'.repeat(40_000), instructions: 'y'.repeat(5_000), audience: 'a'.repeat(1_200), purpose: 'p'.repeat(1_600), guests: Array.from({ length: 40 }, (_, index) => ({ ...validEvent.guests[0], id: `guest-${index}`, protocolNotes: 'n'.repeat(1_000) })) };
  await assert.rejects(generateEventScript({ mode: 'full', event: largeEvent }, async () => validDraft, 'mock-model'), (error: unknown) => error instanceof EventBrainError && error.code === 'EVENT_TOO_LARGE');
});

test('bounds a streamed generation body even when Content-Length is absent', async () => {
  const handler = createGenerationHandler({ environment: () => ({ OPENAI_API_KEY: 'key', OPENAI_MODEL: 'mock' }), createProvider: () => async () => validDraft, allowRequest: () => true });
  const response = await handler(new Request('http://localhost/api/event-brain/generate', { method: 'POST', body: new Uint8Array(200_001) }));
  assert.equal(response.status, 413);
});

test('rate limiter rejects excess attempts and permits them again after its window', async () => {
  const { createMemoryRateLimiter } = await import('./http.ts');
  let now = 100;
  const allow = createMemoryRateLimiter(2, 50, () => now);
  assert.equal(allow('speaker-1'), true);
  assert.equal(allow('speaker-1'), true);
  assert.equal(allow('speaker-1'), false);
  now = 151;
  assert.equal(allow('speaker-1'), true);
});
