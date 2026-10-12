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
    description: 'Build an editable speaking draft from your event, audience, agenda, and guide.',
    status: 'in-development',
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

export function estimateSpeakingSeconds(wordCount: number, wordsPerMinute = 130): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  return Math.ceil((wordCount / wordsPerMinute) * 60);
}

export function enrichScriptDraft<Section extends { speechText: string; estimatedSeconds: number }, Draft extends { sections: Section[] }>(
  draft: Draft,
): Draft & { totalWordCount: number; estimatedMinutes: number } {
  const sections = draft.sections.map((section) => ({
    ...section,
    estimatedSeconds: estimateSpeakingSeconds(countWords(section.speechText)),
  }));
  const totalWordCount = sections.reduce((total, section) => total + countWords(section.speechText), 0);
  return {
    ...draft,
    sections,
    totalWordCount,
    estimatedMinutes: Math.round((estimateSpeakingSeconds(totalWordCount) / 60) * 10) / 10,
  };
}

export function mergeRegeneratedSection<Section extends { id: string }, Script extends { sections: Section[] }>(
  script: Script,
  replacement: Section,
): Script {
  if (!script.sections.some((section) => section.id === replacement.id)) {
    throw new Error('The section to replace does not exist in this script.');
  }
  return {
    ...script,
    sections: script.sections.map((section) => section.id === replacement.id ? replacement : section),
  };
}

export function formatScriptForTeleprompter(script: {
  title: string;
  sections: Array<{ title: string; stageDirection: string; speechText: string }>;
}): string {
  return [
    script.title,
    ...script.sections.map((section) => [
      section.title,
      section.stageDirection ? `[${section.stageDirection}]` : '',
      section.speechText,
    ].filter(Boolean).join('\n')),
  ].join('\n\n');
}
