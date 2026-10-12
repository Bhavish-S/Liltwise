import { z } from 'zod';

export const APP_INFO_CHANNEL = 'app:get-info' as const;
export const OPEN_TELEPROMPTER_CHANNEL = 'teleprompter:open' as const;
export const UPDATE_TELEPROMPTER_CHANNEL = 'teleprompter:update' as const;
export const HIDE_TELEPROMPTER_CHANNEL = 'teleprompter:hide' as const;
export const GET_TELEPROMPTER_STATUS_CHANNEL = 'teleprompter:get-status' as const;
export const TELEPROMPTER_READY_CHANNEL = 'teleprompter:ready' as const;
export const TELEPROMPTER_DATA_CHANNEL = 'teleprompter:data' as const;
export const TELEPROMPTER_STATUS_CHANNEL = 'teleprompter:status' as const;

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

export type AppInfo = z.infer<typeof appInfoSchema>;

export const readingSettingsSchema = z.object({
  fontSize: z.number().int().min(22).max(56).multipleOf(2),
  scrollSpeed: z.number().int().min(12).max(96).multipleOf(4),
  surfaceOpacity: z.number().int().min(70).max(95).multipleOf(5),
});

export const teleprompterDataSchema = z.object({
  script: z.string().max(100_000),
  settings: readingSettingsSchema,
});

export const teleprompterStatusSchema = z.object({
  open: z.boolean(),
  visible: z.boolean(),
});

export const teleprompterActionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), message: z.string() }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);

export type ReadingSettings = z.infer<typeof readingSettingsSchema>;
export type TeleprompterData = z.infer<typeof teleprompterDataSchema>;
export type TeleprompterStatus = z.infer<typeof teleprompterStatusSchema>;
export type TeleprompterActionResult = z.infer<typeof teleprompterActionResultSchema>;

const shortText = (max: number) => z.string().trim().max(max);
const rowId = z.string().min(1).max(80);

export const guestSchema = z.object({
  id: rowId,
  name: z.string().trim().min(1).max(160),
  officialTitle: shortText(160),
  designation: shortText(200),
  organization: shortText(200),
  pronunciation: shortText(240),
  protocolNotes: shortText(1000),
});

export const agendaItemSchema = z.object({
  id: rowId,
  title: z.string().trim().min(1).max(200),
  timing: shortText(100),
  durationMinutes: z.number().int().min(0).max(600),
  speaker: shortText(200),
  handoff: shortText(500),
  notes: shortText(1000),
});

export const eventBriefSchema = z.object({
  title: z.string().trim().min(2).max(200),
  eventType: z.string().trim().min(2).max(120),
  date: shortText(40),
  venue: shortText(240),
  organization: shortText(240),
  speakingRole: z.enum(['emcee', 'host', 'keynote', 'guest', 'moderator', 'panelist', 'custom']),
  customRole: shortText(120),
  audience: z.string().trim().min(2).max(1200),
  purpose: z.string().trim().min(2).max(1600),
  language: z.string().trim().min(2).max(80),
  tone: z.enum(['formal', 'professional', 'warm', 'inspirational', 'conversational', 'ceremonial', 'custom']),
  customTone: shortText(120),
  targetMinutes: z.number().int().min(1).max(180),
  detailLevel: z.enum(['concise', 'balanced', 'detailed']),
  instructions: shortText(5000),
  guests: z.array(guestSchema).max(40),
  agenda: z.array(agendaItemSchema).max(40),
  eventGuide: shortText(40_000),
}).superRefine((event, context) => {
  if (event.speakingRole === 'custom' && !event.customRole.trim()) {
    context.addIssue({ code: 'custom', path: ['customRole'], message: 'Describe your speaking role.' });
  }
  if (event.tone === 'custom' && !event.customTone.trim()) {
    context.addIssue({ code: 'custom', path: ['customTone'], message: 'Describe the tone you want.' });
  }
});

export const generatedSectionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u),
  title: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(500),
  speechText: z.string().trim().min(1).max(20_000),
  estimatedSeconds: z.number().int().min(0).max(36_000),
  stageDirection: shortText(1000),
});

export const scriptDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sections: z.array(generatedSectionSchema).min(1).max(40),
  confirmations: z.array(z.string().trim().min(1).max(500)).max(30),
  factChecklist: z.array(z.string().trim().min(1).max(500)).max(30),
});

export const generatedScriptSchema = scriptDraftSchema.extend({
  totalWordCount: z.number().int().min(0),
  estimatedMinutes: z.number().min(0),
});

export const fullGenerationRequestSchema = z.object({
  mode: z.literal('full'),
  event: eventBriefSchema,
});

export const sectionGenerationRequestSchema = z.object({
  mode: z.literal('section'),
  event: eventBriefSchema,
  script: generatedScriptSchema,
  sectionId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u),
  instruction: z.string().trim().min(3).max(1000),
});

export const eventBrainGenerationRequestSchema = z.discriminatedUnion('mode', [
  fullGenerationRequestSchema,
  sectionGenerationRequestSchema,
]);

export type EventGuest = z.infer<typeof guestSchema>;
export type AgendaItem = z.infer<typeof agendaItemSchema>;
export type EventBrief = z.infer<typeof eventBriefSchema>;
export type GeneratedSection = z.infer<typeof generatedSectionSchema>;
export type ScriptDraft = z.infer<typeof scriptDraftSchema>;
export type GeneratedScript = z.infer<typeof generatedScriptSchema>;
export type EventBrainGenerationRequest = z.infer<typeof eventBrainGenerationRequestSchema>;
