import {
  alignmentControlSchema,
  alignmentPositionSchema,
  alignmentResultSchema,
  alignmentSectionSchema,
  type AlignmentControl,
  type AlignmentPosition,
  type AlignmentResult,
  type AlignmentSection,
} from '@liltwise/contracts';

interface ScriptToken {
  value: string;
  sectionIndex: number;
  localIndex: number;
  start: number;
  end: number;
}

interface Candidate {
  start: number;
  end: number;
  score: number;
  exact: boolean;
}

const LOOKAHEAD_TOKENS = 90;
const OVERLAP_TOKENS = 2;
const REPEAT_LOOKBACK_TOKENS = 60;
const MINIMUM_MATCH_SCORE = 0.57;
const MINIMUM_PROVIDER_CONFIDENCE = 0.35;
const COMMON_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'our', 'so', 'that', 'the', 'their', 'them', 'then', 'there', 'this',
  'to', 'was', 'we', 'were', 'with', 'you', 'your',
]);

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[’‘`]/gu, "'");
}

function tokenize(text: string, sectionIndex: number): ScriptToken[] {
  const segmenter = new Intl.Segmenter('und', { granularity: 'word' });
  const result: ScriptToken[] = [];
  for (const part of segmenter.segment(text)) {
    if (!part.isWordLike) continue;
    result.push({
      value: normalized(part.segment),
      sectionIndex,
      localIndex: result.length,
      start: part.index,
      end: part.index + part.segment.length,
    });
  }
  return result;
}

function editSimilarity(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1);
      current[column] = Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, substitution);
    }
    previous = current;
  }
  return 1 - (previous[right.length] ?? Math.max(left.length, right.length)) / Math.max(left.length, right.length);
}

function hasUsefulWords(words: string[]): boolean {
  return words.some((word) => Array.from(word).length > 2 && !COMMON_WORDS.has(word));
}

function findBestCandidate(script: ScriptToken[], phrase: string[], from: number, to: number, minimumEnd = 0): Candidate | null {
  if (!phrase.length || !hasUsefulWords(phrase)) return null;
  const minLength = Math.max(1, phrase.length - 2);
  const maxLength = Math.min(phrase.length + 2, 14);
  let best: Candidate | null = null;

  for (let start = from; start < to; start += 1) {
    for (let length = minLength; length <= maxLength; length += 1) {
      const end = start + length;
      if (end > to || end <= minimumEnd) continue;
      const passage = script.slice(start, end).map((token) => token.value);
      const similarity = editSimilarity(phrase, passage);
      const sharedUseful = phrase.filter((word) => !COMMON_WORDS.has(word) && passage.includes(word)).length;
      const usefulCount = phrase.filter((word) => !COMMON_WORDS.has(word)).length;
      const usefulCoverage = usefulCount ? sharedUseful / usefulCount : 0;
      const score = similarity * 0.72 + usefulCoverage * 0.28;
      const exact = phrase.length === passage.length && phrase.every((word, index) => word === passage[index]);
      // Stable tie-breaking prefers the nearest forward passage, especially for repeated lines.
      if (!best || score > best.score + 0.0001 || (Math.abs(score - best.score) <= 0.0001 && start < best.start)) {
        best = { start, end, score, exact };
      }
    }
  }
  return best;
}

function emptyResult(state: AlignmentResult['state'], action: AlignmentResult['action'], progress = 0, message = ''): AlignmentResult {
  return alignmentResultSchema.parse({
    state, action, currentSectionId: null, currentSectionIndex: null,
    phraseStartToken: null, phraseEndToken: null, progress, confidence: 0,
    matchKind: 'none', isPreview: false, speechComplete: false, message,
  });
}

/** Stateful, deterministic matcher. Interim updates preview; only accepted finals move confirmed progress. */
export class AdaptiveSpeakingSession {
  readonly sections: AlignmentSection[];
  private readonly tokens: ScriptToken[];
  private confirmedNextToken = 0;
  private speakerState: AlignmentResult['state'] = 'ready';
  private lowConfidenceCount = 0;
  private lastTimestamp = -1;
  private lastResult: AlignmentResult;
  private readonly minimumMatchScore: number;
  private readonly minimumProviderConfidence: number;

  constructor(sections: AlignmentSection[], options: { minimumMatchScore?: number; minimumProviderConfidence?: number } = {}) {
    this.minimumMatchScore = options.minimumMatchScore ?? MINIMUM_MATCH_SCORE;
    this.minimumProviderConfidence = options.minimumProviderConfidence ?? MINIMUM_PROVIDER_CONFIDENCE;
    if (![this.minimumMatchScore, this.minimumProviderConfidence].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new Error('Alignment confidence thresholds must be between 0 and 1.');
    }
    this.sections = sections.map((section) => alignmentSectionSchema.parse(section));
    if (new Set(this.sections.map((section) => section.id)).size !== this.sections.length) {
      throw new Error('Script section IDs must be unique.');
    }
    this.tokens = this.sections.flatMap((section, index) => tokenize(section.text, index));
    this.lastResult = emptyResult(this.tokens.length ? 'ready' : 'ready', 'none', 0, 'Ready to simulate speech tracking.');
  }

  get confirmedPosition(): AlignmentPosition {
    if (!this.tokens.length) return { sectionIndex: 0, tokenIndex: 0 };
    const token = this.tokens[Math.min(this.confirmedNextToken, this.tokens.length - 1)];
    return { sectionIndex: token?.sectionIndex ?? 0, tokenIndex: token?.localIndex ?? 0 };
  }

  private progressAt(nextToken: number): number {
    return this.tokens.length ? Math.min(1, Math.max(0, nextToken / this.tokens.length)) : 0;
  }

  private resultAt(state: AlignmentResult['state'], action: AlignmentResult['action'], start: number | null, end: number | null, confidence: number, matchKind: AlignmentResult['matchKind'], isPreview: boolean, message: string): AlignmentResult {
    const active = end === null ? null : this.tokens[end];
    const clampedEnd = end === null ? this.confirmedNextToken : end + 1;
    const result = alignmentResultSchema.parse({
      state, action,
      currentSectionId: active ? this.sections[active.sectionIndex]?.id ?? null : null,
      currentSectionIndex: active?.sectionIndex ?? null,
      phraseStartToken: start,
      phraseEndToken: end,
      progress: this.progressAt(isPreview || action === 'hold' ? this.confirmedNextToken : clampedEnd),
      confidence: Math.max(0, Math.min(1, confidence)),
      matchKind, isPreview, speechComplete: false, message,
    });
    if (!isPreview) this.lastResult = result;
    return result;
  }

  apply(input: AlignmentControl): AlignmentResult {
    const control = alignmentControlSchema.parse(input);
    if (control.type === 'stop') {
      this.speakerState = 'stopped';
      return this.resultAt('stopped', 'none', null, null, 0, 'none', false, 'Tracking stopped.');
    }
    if (control.type === 'pause') {
      this.speakerState = 'paused';
      return this.resultAt('paused', 'hold', this.lastResult.phraseStartToken, this.lastResult.phraseEndToken,
        this.lastResult.confidence, this.lastResult.matchKind, false, 'Paused. Your confirmed position is saved.');
    }
    if (control.type === 'resume') {
      this.speakerState = 'listening';
      return this.resultAt('listening', 'hold', this.lastResult.phraseStartToken, this.lastResult.phraseEndToken,
        this.lastResult.confidence, this.lastResult.matchKind, false, 'Simulation ready for transcript input.');
    }
    if (control.type === 'resynchronize') {
      const position = alignmentPositionSchema.parse(control.position);
      const section = this.sections[position.sectionIndex];
      if (!section) throw new Error('Choose a script section that exists.');
      const localTokens = this.tokens.filter((token) => token.sectionIndex === position.sectionIndex);
      if (position.tokenIndex > localTokens.length) throw new Error('Choose a position inside the selected section.');
      const selected = localTokens[Math.min(position.tokenIndex, Math.max(0, localTokens.length - 1))];
      this.confirmedNextToken = selected ? this.tokens.indexOf(selected) : this.tokens.length;
      this.lowConfidenceCount = 0;
      this.speakerState = 'listening';
      return this.resultAt('listening', 'advance', selected ? this.confirmedNextToken : null, selected ? this.confirmedNextToken : null, 1, 'exact', false, 'Position reset. Continue speaking from this point.');
    }

    if (this.speakerState === 'stopped' || this.speakerState === 'paused') return this.lastResult;
    if (control.timestampMs !== undefined && control.timestampMs < this.lastTimestamp) return this.lastResult;
    if (control.timestampMs !== undefined) this.lastTimestamp = control.timestampMs;
    const phrase = tokenize(control.text, 0).map((token) => token.value).slice(-14);
    if (!phrase.length || !this.tokens.length) {
      if (!this.tokens.length) return emptyResult('ready', 'hold', 0, 'Add script text before simulating tracking.');
      return this.lastResult;
    }

    const lowerBound = Math.max(0, this.confirmedNextToken - OVERLAP_TOKENS);
    const upperBound = Math.min(this.tokens.length, this.confirmedNextToken + LOOKAHEAD_TOKENS);
    const candidate = findBestCandidate(this.tokens, phrase, lowerBound, upperBound, this.confirmedNextToken);
    const providerConfidence = control.providerConfidence;
    // Result confidence is the matcher's lexical score. Provider confidence is optional
    // metadata and must never be invented or folded into a different score.
    const confidence = candidate?.score ?? 0;
    const accepted = candidate !== null && candidate.score >= this.minimumMatchScore
      && (providerConfidence === undefined || providerConfidence >= this.minimumProviderConfidence);

    if (!control.isFinal) {
      this.speakerState = 'listening';
      if (!accepted || !candidate) {
        return this.resultAt('uncertain', 'hold', null, null, confidence, 'none', true, 'Interim words are uncertain; confirmed position is held.');
      }
      return this.resultAt('listening', 'hold', candidate.start, candidate.end - 1, confidence, candidate.exact ? 'exact' : 'close', true, 'Interim match preview. It will not move confirmed progress.');
    }

    if (!accepted || !candidate) {
      const repeat = findBestCandidate(
        this.tokens,
        phrase,
        Math.max(0, this.confirmedNextToken - REPEAT_LOOKBACK_TOKENS),
        this.confirmedNextToken,
      );
      if (repeat && repeat.score >= this.minimumMatchScore
        && (providerConfidence === undefined || providerConfidence >= this.minimumProviderConfidence)) {
        this.lowConfidenceCount = 0;
        this.speakerState = 'repeated';
        return this.resultAt('repeated', 'hold', repeat.start, repeat.end - 1, repeat.score,
          repeat.exact ? 'exact' : 'close', false, 'A previous passage was repeated. Confirmed position stays where it was.');
      }
      this.lowConfidenceCount += 1;
      const state = this.lowConfidenceCount >= 3 ? 'recovery-required' : this.lowConfidenceCount >= 2 ? 'diverged' : 'uncertain';
      this.speakerState = state;
      return this.resultAt(state, state === 'recovery-required' ? 'recover' : 'hold',
        state === 'recovery-required' ? null : this.lastResult.phraseStartToken,
        state === 'recovery-required' ? null : this.lastResult.phraseEndToken,
        confidence, this.lastResult.matchKind, false,
        state === 'recovery-required' ? 'The last matches were uncertain. Choose a passage to resynchronize.' : 'No reliable script match. Confirmed position is held.');
    }

    const skipped = candidate.start > this.confirmedNextToken + 3
      || (this.tokens[candidate.start]?.sectionIndex ?? 0) > (this.tokens[Math.min(this.confirmedNextToken, this.tokens.length - 1)]?.sectionIndex ?? 0);
    this.confirmedNextToken = Math.max(this.confirmedNextToken, candidate.end);
    this.lowConfidenceCount = 0;
    this.speakerState = skipped ? 'skipped-ahead' : 'advancing';
    return this.resultAt(this.speakerState, 'advance', candidate.start, candidate.end - 1, confidence, candidate.exact ? 'exact' : 'close', false,
      skipped ? 'A confident later passage matched; skipped text was left behind.' : 'Confident script match.');
  }

  reset(): AlignmentResult {
    this.confirmedNextToken = 0;
    this.speakerState = this.tokens.length ? 'ready' : 'ready';
    this.lowConfidenceCount = 0;
    this.lastTimestamp = -1;
    this.lastResult = emptyResult('ready', 'none', 0, 'Ready to simulate speech tracking.');
    return this.lastResult;
  }
}

/** Preserve source paragraphs and ordering while giving each a stable ID for one script version. */
export function scriptTextToAlignmentSections(script: string): AlignmentSection[] {
  return script.split(/\n\s*\n/u).map((text, index) => ({ id: `paragraph-${index + 1}`, text: text.trim() })).filter((section) => section.text.length > 0);
}

export function tokenizeAlignmentText(text: string): Array<{ value: string; start: number; end: number }> {
  return tokenize(text, 0).map(({ value, start, end }) => ({ value, start, end }));
}
