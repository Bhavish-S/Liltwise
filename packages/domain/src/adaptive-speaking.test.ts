import assert from 'node:assert/strict';
import test from 'node:test';
import { AdaptiveSpeakingSession, scriptTextToAlignmentSections } from './index.ts';

const script = [
  { id: 'opening', text: 'Good morning, everyone. We gather here today to celebrate bright ideas.' },
  { id: 'middle', text: 'Our next promise is clear speech. We build it together.' },
  { id: 'closing', text: 'Thank you for joining us. We look forward to tomorrow.' },
];

function session() { return new AdaptiveSpeakingSession(script); }

test('matches an exact phrase and reports section and phrase token range', () => {
  const result = session().apply({ type: 'transcript', text: 'We gather here today', isFinal: true });
  assert.equal(result.state, 'advancing');
  assert.equal(result.currentSectionId, 'opening');
  assert.equal(result.phraseStartToken, 3);
  assert.equal(result.phraseEndToken, 6);
  assert.equal(result.matchKind, 'exact');
});

test('ignores punctuation and capitalization differences', () => {
  const result = session().apply({ type: 'transcript', text: 'GOOD MORNING everyone', isFinal: true });
  assert.equal(result.matchKind, 'exact');
  assert.equal(result.currentSectionId, 'opening');
});

test('normalizes Unicode comparison while retaining source section identifiers', () => {
  const tracker = new AdaptiveSpeakingSession([
    { id: 'kannada', text: 'ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ, Café is open.' },
  ]);
  const result = tracker.apply({ type: 'transcript', text: 'ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ Café', isFinal: true });
  assert.equal(result.currentSectionId, 'kannada');
  assert.equal(result.matchKind, 'exact');
});

test('interim recognition previews a match but does not move confirmed progress', () => {
  const tracker = session();
  const preview = tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: false });
  assert.equal(preview.isPreview, true);
  assert.equal(preview.action, 'hold');
  assert.equal(tracker.confirmedPosition.tokenIndex, 0);
  const final = tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: true });
  assert.equal(final.isPreview, false);
  assert.equal(tracker.confirmedPosition.tokenIndex, 3);
});

test('replaces an interim hypothesis with a corrected interim before final confirmation', () => {
  const tracker = session();
  const wrong = tracker.apply({ type: 'transcript', text: 'Good evening everyone', isFinal: false, timestampMs: 10 });
  assert.equal(wrong.isPreview, true);
  assert.equal(tracker.confirmedPosition.tokenIndex, 0);
  const corrected = tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: false, timestampMs: 11 });
  assert.equal(corrected.isPreview, true);
  assert.equal(tracker.confirmedPosition.tokenIndex, 0);
  const final = tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: true, timestampMs: 12 });
  assert.equal(final.action, 'advance');
});

test('final transcript segments advance only the confirmed position', () => {
  const tracker = session();
  tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: true });
  const firstPosition = tracker.confirmedPosition;
  const next = tracker.apply({ type: 'transcript', text: 'We gather here today', isFinal: true });
  assert.equal(next.state, 'advancing');
  assert.ok(next.progress > 0);
  assert.ok(tracker.confirmedPosition.tokenIndex > firstPosition.tokenIndex);
});

test('permits a confident forward jump over an omitted sentence or section', () => {
  const result = session().apply({ type: 'transcript', text: 'Our next promise is clear speech', isFinal: true });
  assert.equal(result.state, 'skipped-ahead');
  assert.equal(result.currentSectionId, 'middle');
  assert.equal(result.action, 'advance');
});

test('distinguishes the same repeated phrase by the current confirmed position', () => {
  const tracker = new AdaptiveSpeakingSession([
    { id: 'first', text: 'Welcome distinguished guests.' },
    { id: 'second', text: 'Welcome distinguished guests.' },
  ]);
  assert.equal(tracker.apply({ type: 'transcript', text: 'Welcome distinguished guests', isFinal: true }).currentSectionId, 'first');
  const repeated = tracker.apply({ type: 'transcript', text: 'Welcome distinguished guests', isFinal: true });
  assert.equal(repeated.currentSectionId, 'second');
});

test('labels a repeated prior sentence and holds instead of moving backward', () => {
  const tracker = new AdaptiveSpeakingSession([{ id: 'only', text: 'Welcome distinguished guests. We begin now.' }]);
  tracker.apply({ type: 'transcript', text: 'Welcome distinguished guests', isFinal: true });
  const confirmed = tracker.confirmedPosition;
  const repeated = tracker.apply({ type: 'transcript', text: 'Welcome distinguished guests', isFinal: true });
  assert.equal(repeated.state, 'repeated');
  assert.equal(repeated.action, 'hold');
  assert.equal(repeated.progress, tracker.apply({ type: 'pause' }).progress);
  assert.deepEqual(tracker.confirmedPosition, confirmed);
});

test('tolerates a small insertion or recognition error', () => {
  const result = session().apply({ type: 'transcript', text: 'We gather there today', isFinal: true });
  assert.equal(result.action, 'advance');
  assert.equal(result.currentSectionId, 'opening');
  assert.equal(result.matchKind, 'close');
});

test('holds on unrelated speech and low recognition confidence', () => {
  const tracker = session();
  const noise = tracker.apply({ type: 'transcript', text: 'The and it is a', isFinal: true });
  assert.equal(noise.action, 'hold');
  assert.equal(noise.state, 'uncertain');
  const low = tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: true, recognitionConfidence: 0.1 });
  assert.equal(low.action, 'hold');
  assert.equal(tracker.confirmedPosition.tokenIndex, 0);
});

test('a pause holds position and never marks the speech complete', () => {
  const tracker = session();
  tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: true });
  const position = tracker.confirmedPosition;
  const paused = tracker.apply({ type: 'pause' });
  assert.equal(paused.state, 'paused');
  assert.equal(paused.speechComplete, false);
  assert.deepEqual(tracker.confirmedPosition, position);
});

test('transcript events received while paused cannot move confirmed progress', () => {
  const tracker = session();
  const beforePause = tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: true });
  tracker.apply({ type: 'pause' });

  const duringPause = tracker.apply({ type: 'transcript', text: 'We gather here today', isFinal: true });

  assert.equal(duringPause.state, 'paused');
  assert.equal(duringPause.progress, beforePause.progress);
  assert.deepEqual(tracker.confirmedPosition, { sectionIndex: 0, tokenIndex: 3 });
});

test('supports a stopped state and ignores later transcript input until reset', () => {
  const tracker = session();
  const stopped = tracker.apply({ type: 'stop' });
  assert.equal(stopped.state, 'stopped');
  assert.equal(tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: true }).state, 'stopped');
  assert.equal(tracker.reset().state, 'ready');
});

test('ignores stale out-of-order updates', () => {
  const tracker = session();
  tracker.apply({ type: 'transcript', text: 'Our next promise is clear speech', isFinal: true, timestampMs: 200 });
  const confirmed = tracker.confirmedPosition;
  const stale = tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: false, timestampMs: 100 });
  assert.deepEqual(tracker.confirmedPosition, confirmed);
  assert.equal(stale.state, 'skipped-ahead');
});

test('requires resynchronization after continued divergence and recovers afterward', () => {
  const tracker = session();
  tracker.apply({ type: 'transcript', text: 'completely unrelated improvised words', isFinal: true });
  tracker.apply({ type: 'transcript', text: 'more unrelated improvised words', isFinal: true });
  const recovery = tracker.apply({ type: 'transcript', text: 'another unrelated improvised phrase', isFinal: true });
  assert.equal(recovery.state, 'recovery-required');
  assert.equal(recovery.action, 'recover');
  const matched = tracker.apply({ type: 'transcript', text: 'We gather here today', isFinal: true });
  assert.equal(matched.state, 'advancing');
});

test('keeps progress stable across overlapping transcript updates', () => {
  const tracker = session();
  const first = tracker.apply({ type: 'transcript', text: 'Good morning everyone. We gather here', isFinal: true });
  const next = tracker.apply({ type: 'transcript', text: 'We gather here today to celebrate', isFinal: true });
  assert.ok(next.progress >= first.progress);
});

test('supports explicit manual resynchronization into a later section', () => {
  const tracker = session();
  const result = tracker.apply({ type: 'resynchronize', position: { sectionIndex: 2, tokenIndex: 3 } });
  assert.equal(result.state, 'listening');
  assert.equal(result.currentSectionId, 'closing');
  assert.equal(tracker.confirmedPosition.sectionIndex, 2);
});

test('handles an empty script and empty transcript without inventing progress', () => {
  const tracker = new AdaptiveSpeakingSession([]);
  assert.equal(tracker.apply({ type: 'transcript', text: 'hello there', isFinal: true }).state, 'ready');
  assert.equal(tracker.apply({ type: 'transcript', text: '', isFinal: true }).progress, 0);
});

test('moves cleanly across section boundaries', () => {
  const tracker = session();
  tracker.apply({ type: 'transcript', text: 'Good morning everyone. We gather here today to celebrate bright ideas.', isFinal: true });
  const next = tracker.apply({ type: 'transcript', text: 'Our next promise is clear speech', isFinal: true });
  assert.equal(next.currentSectionId, 'middle');
  assert.ok(next.progress > 0.5);
});

test('returns the same validated result for the same inputs', () => {
  const run = () => {
    const tracker = session();
    tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: false, timestampMs: 1 });
    return tracker.apply({ type: 'transcript', text: 'Good morning everyone', isFinal: true, timestampMs: 2 });
  };
  assert.deepEqual(run(), run());
});

test('the simulator input and future transcription use the same session apply method', () => {
  const fromSimulator = session();
  const fromTranscriptAdapter = session();
  const event = { type: 'transcript' as const, text: 'Good morning everyone', isFinal: true };
  assert.deepEqual(fromSimulator.apply(event), fromTranscriptAdapter.apply(event));
});

test('splits existing script paragraphs without changing their text or order', () => {
  assert.deepEqual(scriptTextToAlignmentSections('First paragraph.\n\nನಮಸ್ಕಾರ.\n\nCafé.'), [
    { id: 'paragraph-1', text: 'First paragraph.' },
    { id: 'paragraph-2', text: '\u0ca8\u0cae\u0cb8\u0ccd\u0c95\u0cbe\u0cb0.' },
    { id: 'paragraph-3', text: 'Café.' },
  ]);
});
