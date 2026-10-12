export type CapabilityStatus = 'planned' | 'in-development';

export interface ProductCapability {
  readonly title: string;
  readonly description: string;
  readonly status: CapabilityStatus;
}

/** Product direction for the public site; these items are not implemented yet. */
export const PRODUCT_CAPABILITIES = [
  {
    title: 'A discreet teleprompter',
    description: 'Keep prepared words nearby in a desktop companion while you present.',
    status: 'in-development',
  },
  {
    title: 'Adaptive speaking support',
    description: 'A future speaking engine will help you find your place after a pause or a skipped line.',
    status: 'planned',
  },
  {
    title: 'Event-aware speech drafts',
    description: 'Prepare a draft around the event, audience, and guidance you provide.',
    status: 'planned',
  },
] as const satisfies readonly ProductCapability[];

export const DEFAULT_READING_SETTINGS = {
  fontSize: 34,
  scrollSpeed: 32,
  surfaceOpacity: 85,
} as const;

export interface ReadingSettingsValues {
  fontSize: number;
  scrollSpeed: number;
  surfaceOpacity: number;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function clampReadingSettings(settings: ReadingSettingsValues): ReadingSettingsValues {
  return {
    fontSize: Math.min(56, Math.max(22, Math.round(settings.fontSize / 2) * 2)),
    scrollSpeed: Math.min(96, Math.max(12, Math.round(settings.scrollSpeed / 4) * 4)),
    surfaceOpacity: Math.min(95, Math.max(70, Math.round(settings.surfaceOpacity / 5) * 5)),
  };
}
