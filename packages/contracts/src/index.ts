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
