import type { AlignmentControl, AlignmentSection } from '@liltwise/contracts';

/** Synthetic text-only cases. These exercise matching rules, not speech-recognition accuracy. */
export interface TranscriptFixture {
  name: string;
  sections: AlignmentSection[];
  events: AlignmentControl[];
  expected: {
    action: 'advance' | 'hold' | 'recover' | 'none';
    state: string;
    sectionId: string | null;
    progress: 'zero' | 'positive' | 'unchanged';
  };
}

const standard: AlignmentSection[] = [
  { id: 'opening', text: 'Good morning everyone. We gather here today to celebrate bright ideas.' },
  { id: 'middle', text: 'Our next promise is clear speech. We build it together.' },
  { id: 'closing', text: 'Thank you for joining us. We look forward to tomorrow.' },
];

export const syntheticTranscriptFixtures: TranscriptFixture[] = [
  { name: 'exact speech', sections: standard, events: [{ type: 'transcript', text: 'We gather here today', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'opening', progress: 'positive' } },
  { name: 'punctuation and capitalization', sections: standard, events: [{ type: 'transcript', text: 'GOOD MORNING, EVERYONE!', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'opening', progress: 'positive' } },
  { name: 'contraction and small recognition error', sections: [{ id: 'terms', text: "We are ready to welcome Liltwise's guests." }], events: [{ type: 'transcript', text: "We're ready to welcome Liltwise guests", isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'terms', progress: 'positive' } },
  { name: 'filler and short hesitation', sections: standard, events: [{ type: 'transcript', text: 'Good, um, morning everyone', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'opening', progress: 'positive' } },
  { name: 'pause and resume', sections: standard, events: [{ type: 'transcript', text: 'Good morning everyone', isFinal: true }, { type: 'pause' }, { type: 'resume' }, { type: 'transcript', text: 'We gather here today', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'opening', progress: 'positive' } },
  { name: 'skipped sentence', sections: standard, events: [{ type: 'transcript', text: 'Our next promise is clear speech', isFinal: true }], expected: { action: 'advance', state: 'skipped-ahead', sectionId: 'middle', progress: 'positive' } },
  { name: 'repeated phrase at next occurrence', sections: [{ id: 'first', text: 'Welcome distinguished guests.' }, { id: 'second', text: 'Welcome distinguished guests.' }], events: [{ type: 'transcript', text: 'Welcome distinguished guests', isFinal: true }, { type: 'transcript', text: 'Welcome distinguished guests', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'second', progress: 'positive' } },
  { name: 'interim revision before final', sections: standard, events: [{ type: 'transcript', text: 'Good evening everyone', isFinal: false, timestampMs: 10 }, { type: 'transcript', text: 'Good morning everyone', isFinal: false, timestampMs: 11 }, { type: 'transcript', text: 'Good morning everyone', isFinal: true, timestampMs: 12 }], expected: { action: 'advance', state: 'advancing', sectionId: 'opening', progress: 'positive' } },
  { name: 'interim-only preview does not confirm position', sections: standard, events: [{ type: 'transcript', text: 'Good morning everyone', isFinal: false, timestampMs: 10 }], expected: { action: 'hold', state: 'listening', sectionId: 'opening', progress: 'zero' } },
  { name: 'stale out-of-order event', sections: standard, events: [{ type: 'transcript', text: 'Our next promise is clear speech', isFinal: true, timestampMs: 20 }, { type: 'transcript', text: 'Good morning everyone', isFinal: true, timestampMs: 10 }], expected: { action: 'advance', state: 'skipped-ahead', sectionId: 'middle', progress: 'positive' } },
  { name: 'brief unscripted introduction holds', sections: standard, events: [{ type: 'transcript', text: 'Hello I am happy to be here', isFinal: true }], expected: { action: 'hold', state: 'uncertain', sectionId: null, progress: 'zero' } },
  { name: 'long digression requests recovery', sections: standard, events: [{ type: 'transcript', text: 'A completely unrelated improvised passage with several new ideas', isFinal: true }, { type: 'transcript', text: 'The audience asks another unrelated question about a different subject', isFinal: true }, { type: 'transcript', text: 'Nothing in this long passage matches our prepared speech at all', isFinal: true }], expected: { action: 'recover', state: 'recovery-required', sectionId: null, progress: 'zero' } },
  { name: 'section transition with short updates', sections: standard, events: [{ type: 'transcript', text: 'Good morning everyone. We gather here today to celebrate bright ideas.', isFinal: true }, { type: 'transcript', text: 'Our next promise is clear speech', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'middle', progress: 'positive' } },
  { name: 'Kannada and accented Unicode', sections: [{ id: 'unicode', text: 'ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ. Café is open.' }], events: [{ type: 'transcript', text: 'ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ Café', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'unicode', progress: 'positive' } },
  { name: 'specialized name and terminology', sections: [{ id: 'terms', text: 'Dr. Asha Rao will present the Liltwise Adaptive Speaking Engine.' }], events: [{ type: 'transcript', text: 'Asha Rao will present the Liltwise Adaptive Speaking Engine', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'terms', progress: 'positive' } },
  { name: 'English and Kannada mixed-language phrase', sections: [{ id: 'mixed', text: 'ನಮಸ್ಕಾರ everyone, welcome to Liltwise.' }], events: [{ type: 'transcript', text: 'ನಮಸ್ಕಾರ everyone welcome to Liltwise', isFinal: true }], expected: { action: 'advance', state: 'advancing', sectionId: 'mixed', progress: 'positive' } },
  { name: 'empty transcript holds without progress', sections: standard, events: [{ type: 'transcript', text: '', isFinal: true }], expected: { action: 'none', state: 'ready', sectionId: null, progress: 'zero' } },
  { name: 'low-information transcript holds', sections: standard, events: [{ type: 'transcript', text: 'the and it is a', isFinal: true }], expected: { action: 'hold', state: 'uncertain', sectionId: null, progress: 'zero' } },
];

/** End-of-sequence confirmed cursor snapshots for the fixtures above. */
export const syntheticTranscriptExpectedPositions: Record<string, { sectionIndex: number; tokenIndex: number }> = {
  'exact speech': { sectionIndex: 0, tokenIndex: 7 },
  'punctuation and capitalization': { sectionIndex: 0, tokenIndex: 3 },
  'contraction and small recognition error': { sectionIndex: 0, tokenIndex: 6 },
  'filler and short hesitation': { sectionIndex: 0, tokenIndex: 3 },
  'pause and resume': { sectionIndex: 0, tokenIndex: 7 },
  'skipped sentence': { sectionIndex: 1, tokenIndex: 6 },
  'repeated phrase at next occurrence': { sectionIndex: 1, tokenIndex: 2 },
  'interim revision before final': { sectionIndex: 0, tokenIndex: 3 },
  'interim-only preview does not confirm position': { sectionIndex: 0, tokenIndex: 0 },
  'stale out-of-order event': { sectionIndex: 1, tokenIndex: 6 },
  'brief unscripted introduction holds': { sectionIndex: 0, tokenIndex: 0 },
  'long digression requests recovery': { sectionIndex: 0, tokenIndex: 0 },
  'section transition with short updates': { sectionIndex: 1, tokenIndex: 6 },
  'Kannada and accented Unicode': { sectionIndex: 0, tokenIndex: 3 },
  'specialized name and terminology': { sectionIndex: 0, tokenIndex: 9 },
  'English and Kannada mixed-language phrase': { sectionIndex: 0, tokenIndex: 4 },
  'empty transcript holds without progress': { sectionIndex: 0, tokenIndex: 0 },
  'low-information transcript holds': { sectionIndex: 0, tokenIndex: 0 },
};
