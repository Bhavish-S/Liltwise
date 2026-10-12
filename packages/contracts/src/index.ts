import { z } from 'zod';

export const APP_INFO_CHANNEL = 'app:get-info' as const;

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

export type AppInfo = z.infer<typeof appInfoSchema>;
