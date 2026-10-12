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
