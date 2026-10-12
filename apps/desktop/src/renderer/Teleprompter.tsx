import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlignmentControl, AlignmentResult } from '@liltwise/contracts';
import type { ReadingSettings, TeleprompterData } from '@liltwise/contracts';
import { AdaptiveSpeakingSession, countWords, DEFAULT_READING_SETTINGS, scriptTextToAlignmentSections, tokenizeAlignmentText } from '@liltwise/domain';

type SimulationMode = 'ready' | 'simulating' | 'paused';
const SIMULATOR_SEGMENT_DELAY_MS = 2_000;

function speechSentences(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  return Array.from(segmenter.segment(text), (part) => part.segment.trim()).filter(Boolean);
}

function stateLabel(result: AlignmentResult, mode: SimulationMode): string {
  if (mode === 'ready' && result.state === 'ready') return 'Simulation ready';
  if (mode === 'paused' || result.state === 'paused') return 'Paused · position held';
  const labels: Record<AlignmentResult['state'], string> = {
    ready: 'Ready', listening: 'Listening to simulated text', advancing: 'Matched script', paused: 'Paused · position held',
    uncertain: 'Uncertain · position held', repeated: 'Repeated passage · position held', 'skipped-ahead': 'Skipped ahead',
    diverged: 'Off script · recovery available', 'recovery-required': 'Choose a passage to resynchronize', stopped: 'Simulation stopped',
  };
  return labels[result.state];
}

export function Teleprompter() {
  const [data, setData] = useState<TeleprompterData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [alignment, setAlignment] = useState<AlignmentResult>({
    state: 'ready', action: 'none', currentSectionId: null, currentSectionIndex: null,
    phraseStartToken: null, phraseEndToken: null, progress: 0, confidence: 0,
    matchKind: 'none', isPreview: false, speechComplete: false, message: 'Ready to simulate speech tracking.',
  });
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('ready');
  const [resyncSection, setResyncSection] = useState(0);
  const [improvisedText, setImprovisedText] = useState('The weather is green and the city speaks quietly.');
  const session = useRef<AdaptiveSpeakingSession | null>(null);
  const sequenceIndex = useRef(0);
  const lastSentence = useRef('');
  const sequenceTimer = useRef<number | null>(null);
  const resumePreparedSequence = useRef(false);
  const scrollArea = useRef<HTMLDivElement>(null);
  const alignmentSections = useMemo(() => scriptTextToAlignmentSections(data?.script ?? ''), [data?.script]);
  const scriptTokens = useMemo(() => tokenizeAlignmentText(data?.script ?? ''), [data?.script]);
  const simulationSequence = useMemo(() => alignmentSections.flatMap((section) => speechSentences(section.text)), [alignmentSections]);

  useEffect(() => {
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
    session.current = new AdaptiveSpeakingSession(alignmentSections);
    setAlignment(session.current.reset());
    sequenceIndex.current = 0;
    lastSentence.current = '';
    resumePreparedSequence.current = false;
    setSimulationMode('ready');
    setResyncSection(0);
  }, [alignmentSections]);

  useEffect(() => () => {
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
  }, []);

  useEffect(() => window.liltwise.onTeleprompterData((nextData) => {
    setData(nextData);
    setError('');
  }), []);

  useEffect(() => {
    if (!data?.script) return;
    scrollArea.current?.scrollTo({ top: 0 });
    setProgress(0);
    setIsPlaying(false);
  }, [data?.script]);

  useEffect(() => {
    const area = scrollArea.current;
    if (!area || !isPlaying || !data) return;
    let frame = 0;
    let previousTime = 0;

    const advance = (time: number): void => {
      if (previousTime) {
        const elapsedSeconds = Math.min(50, time - previousTime) / 1000;
        const maximumScroll = area.scrollHeight - area.clientHeight;
        area.scrollTop = Math.min(maximumScroll, area.scrollTop + data.settings.scrollSpeed * elapsedSeconds);
        if (area.scrollTop >= maximumScroll) {
          setIsPlaying(false);
          return;
        }
      }
      previousTime = time;
      frame = window.requestAnimationFrame(advance);
    };

    frame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frame);
  }, [data, isPlaying]);

  function updateSetting<K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]): void {
    setData((current) => current ? { ...current, settings: { ...current.settings, [key]: value } } : current);
  }

  function updateProgress(): void {
    const area = scrollArea.current;
    if (!area) return;
    const maximum = area.scrollHeight - area.clientHeight;
    setProgress(maximum > 0 ? Math.round((area.scrollTop / maximum) * 100) : 0);
  }

  function applySimulationEvent(event: AlignmentControl): AlignmentResult | null {
    if (!session.current) return null;
    const result = session.current.apply(event);
    setAlignment(result);
    if (event.type === 'transcript' && event.isFinal) lastSentence.current = event.text;
    if (result.action === 'advance' && !result.isPreview && result.phraseEndToken !== null) {
      const target = document.querySelector<HTMLElement>(`[data-script-token="${result.phraseEndToken}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return result;
  }

  function nextSentence(): string {
    if (!simulationSequence.length) return '';
    return simulationSequence[Math.min(sequenceIndex.current, simulationSequence.length - 1)] ?? '';
  }

  function playPreparedSequence(): void {
    const playNext = (): void => {
      if (sequenceIndex.current >= simulationSequence.length) {
        setSimulationMode('paused');
        applySimulationEvent({ type: 'pause' });
        sequenceTimer.current = null;
        resumePreparedSequence.current = false;
        return;
      }
      const text = simulationSequence[sequenceIndex.current] ?? '';
      sequenceIndex.current += 1;
      applySimulationEvent({ type: 'transcript', text, isFinal: true, timestampMs: Date.now() });
      sequenceTimer.current = window.setTimeout(playNext, SIMULATOR_SEGMENT_DELAY_MS);
    };
    playNext();
  }

  function startPreparedSequence(): void {
    if (!simulationSequence.length) return;
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
    sequenceTimer.current = null;
    resumePreparedSequence.current = false;
    setIsPlaying(false);
    setSimulationMode('simulating');
    applySimulationEvent({ type: 'resume' });
    playPreparedSequence();
  }

  function sendInterim(): void {
    const text = nextSentence();
    if (!text) return;
    applySimulationEvent({ type: 'transcript', text, isFinal: false, timestampMs: Date.now() });
  }

  function confirmNext(): void {
    const text = nextSentence();
    if (!text) return;
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
    sequenceTimer.current = null;
    resumePreparedSequence.current = false;
    sequenceIndex.current = Math.min(sequenceIndex.current + 1, simulationSequence.length);
    setSimulationMode('simulating');
    applySimulationEvent({ type: 'resume' });
    applySimulationEvent({ type: 'transcript', text, isFinal: true, timestampMs: Date.now() });
  }

  function skipParagraph(): void {
    const targetSection = Math.min((session.current?.confirmedPosition.sectionIndex ?? 0) + 1, alignmentSections.length - 1);
    const text = speechSentences(alignmentSections[targetSection]?.text ?? '')[0] ?? '';
    if (!text) return;
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
    sequenceTimer.current = null;
    resumePreparedSequence.current = false;
    sequenceIndex.current = alignmentSections.slice(0, targetSection)
      .reduce((count, section) => count + speechSentences(section.text).length, 0) + 1;
    setSimulationMode('simulating');
    applySimulationEvent({ type: 'resume' });
    applySimulationEvent({ type: 'transcript', text, isFinal: true, timestampMs: Date.now() });
  }

  function pauseSimulation(): void {
    resumePreparedSequence.current = sequenceTimer.current !== null;
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
    sequenceTimer.current = null;
    setSimulationMode('paused');
    applySimulationEvent({ type: 'pause' });
  }

  function resumeSimulation(): void {
    setSimulationMode('simulating');
    applySimulationEvent({ type: 'resume' });
    if (resumePreparedSequence.current) {
      resumePreparedSequence.current = false;
      playPreparedSequence();
    }
  }

  function stopSimulation(): void {
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
    sequenceTimer.current = null;
    resumePreparedSequence.current = false;
    setSimulationMode('ready');
    applySimulationEvent({ type: 'stop' });
  }

  function manualResynchronize(): void {
    const section = alignmentSections[resyncSection];
    if (!section) return;
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
    sequenceTimer.current = null;
    resumePreparedSequence.current = false;
    sequenceIndex.current = alignmentSections.slice(0, resyncSection)
      .reduce((count, prior) => count + speechSentences(prior.text).length, 0);
    setSimulationMode('simulating');
    applySimulationEvent({ type: 'resynchronize', position: { sectionIndex: resyncSection, tokenIndex: 0 } });
    const firstGlobalToken = alignmentSections.slice(0, resyncSection)
      .reduce((count, prior) => count + tokenizeAlignmentText(prior.text).length, 0);
    document.querySelector<HTMLElement>(`[data-script-token="${firstGlobalToken}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetSimulation(): void {
    if (sequenceTimer.current !== null) window.clearTimeout(sequenceTimer.current);
    sequenceTimer.current = null;
    resumePreparedSequence.current = false;
    sequenceIndex.current = 0;
    lastSentence.current = '';
    setSimulationMode('ready');
    setAlignment(session.current?.reset() ?? alignment);
    setIsPlaying(false);
    setProgress(0);
    scrollArea.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function hide(): Promise<void> {
    setError('');
    try {
      await window.liltwise.hideTeleprompter();
    } catch {
      setError('Could not hide the window. You can close it from the app dock.');
    }
  }

  const settings = data?.settings ?? DEFAULT_READING_SETTINGS;
  const hasScript = Boolean(data?.script.trim());

  return (
    <main className={`teleprompter-shell font-size-${settings.fontSize} opacity-${settings.surfaceOpacity}`}>
      <header className="prompter-header drag-region">
        <div className="prompter-brand"><span className="brand-mark small-mark">L</span><span>liltwise</span><i /> <span className="prompter-mode">READING PREVIEW · NO MIC</span></div>
        <button className="hide-button no-drag" type="button" onClick={() => void hide()} aria-label="Hide floating teleprompter">Hide <span aria-hidden="true">×</span></button>
      </header>

      <div className="prompter-meta"><span>{hasScript ? `${countWords(data?.script ?? '')} WORDS` : 'NO SCRIPT YET'}</span><span>POSITION {progress}%</span></div>
      <section className="prompter-reading-area" ref={scrollArea} onScroll={updateProgress} aria-label="Teleprompter script">
        {hasScript ? <p className="prompter-script">{scriptTokens.map((token, index) => {
          const before = (data?.script ?? '').slice(index === 0 ? 0 : scriptTokens[index - 1]?.end ?? 0, token.start);
          const content = (data?.script ?? '').slice(token.start, token.end);
          const isActive = alignment.phraseStartToken !== null && alignment.phraseEndToken !== null
            && index >= alignment.phraseStartToken && index <= alignment.phraseEndToken;
          return <span key={`${token.start}-${index}`}>{before}<span data-script-token={index} className={isActive ? `script-token-active${alignment.isPreview ? ' is-preview' : ''}` : undefined}>{content}</span></span>;
        })}{scriptTokens.length > 0 && (data?.script ?? '').slice(scriptTokens.at(-1)?.end ?? 0)}</p> : <div className="prompter-empty"><strong>Your script will appear here.</strong><span>Return to Liltwise and add or update your draft.</span></div>}
      </section>

      <footer className="prompter-controls no-drag">
        <details className="tracking-simulator" open>
          <summary><span>Speech tracking simulator</span><b>SIMULATION · NO MICROPHONE</b></summary>
          <div className="simulator-status" role="status"><span>{stateLabel(alignment, simulationMode)}</span><span>{Math.round(alignment.progress * 100)}% · {Math.round(alignment.confidence * 100)}% match</span></div>
          <div className="simulator-actions">
            <button type="button" onClick={startPreparedSequence} disabled={!simulationSequence.length || simulationMode === 'simulating' || alignment.state === 'stopped'}>▶ Play sequence</button>
            <button type="button" onClick={sendInterim} disabled={!hasScript}>Interim preview</button>
            <button type="button" onClick={confirmNext} disabled={!hasScript || alignment.state === 'stopped'}>Confirm next phrase</button>
            <button type="button" onClick={pauseSimulation} disabled={simulationMode === 'paused' || alignment.state === 'ready' || alignment.state === 'stopped'}>Pause</button>
            <button type="button" onClick={resumeSimulation} disabled={alignment.state !== 'paused'}>Resume</button>
            <button type="button" onClick={stopSimulation} disabled={alignment.state === 'ready' || alignment.state === 'stopped'}>Stop tracking</button>
            <button type="button" onClick={skipParagraph} disabled={alignmentSections.length < 2}>Skip paragraph</button>
            <button type="button" onClick={() => lastSentence.current && applySimulationEvent({ type: 'transcript', text: lastSentence.current, isFinal: true, timestampMs: Date.now() })} disabled={!lastSentence.current}>Repeat last sentence</button>
            <label className="simulator-improvise">Unmatched phrase
              <input aria-label="Unmatched phrase" value={improvisedText} onChange={(event) => setImprovisedText(event.target.value)} />
            </label>
            <button type="button" onClick={() => applySimulationEvent({ type: 'transcript', text: improvisedText, isFinal: true, timestampMs: Date.now() })} disabled={!improvisedText.trim()}>Send phrase</button>
            <label className="simulator-resync">Recovery passage
              <select aria-label="Recovery passage" value={resyncSection} onChange={(event) => setResyncSection(Number(event.target.value))}>
                {alignmentSections.map((section, index) => <option key={section.id} value={index}>{section.id.replace('paragraph-', 'Paragraph ')}</option>)}
              </select>
            </label>
            <button type="button" onClick={manualResynchronize}>Resynchronize</button>
            <button type="button" onClick={resetSimulation}>Reset</button>
          </div>
          <p className="simulator-message">{alignment.message}</p>
        </details>
        <div className="transport-controls">
          <button className="transport-button play-button" type="button" disabled={!hasScript} onClick={() => setIsPlaying((playing) => !playing)} aria-label={isPlaying ? 'Pause auto-scroll' : 'Start auto-scroll'}>{isPlaying ? 'Ⅱ' : '▶'} <span>{isPlaying ? 'Pause' : 'Play'}</span></button>
          <button className="transport-button" type="button" onClick={() => { setIsPlaying(false); scrollArea.current?.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="Reset reading position">↺ <span>Reset</span></button>
          <span className="preview-caption">Time-based reading preview</span>
        </div>
        <div className="prompter-adjustments">
          <label className="prompter-slider"><span>TYPE <b>{settings.fontSize}</b></span><input aria-label="Teleprompter font size" type="range" min="22" max="56" step="2" value={settings.fontSize} onChange={(event) => updateSetting('fontSize', Number(event.target.value))} /></label>
          <label className="prompter-slider"><span>PACE <b>{settings.scrollSpeed}</b></span><input aria-label="Teleprompter scroll speed" type="range" min="12" max="96" step="4" value={settings.scrollSpeed} onChange={(event) => updateSetting('scrollSpeed', Number(event.target.value))} /></label>
          <label className="prompter-slider"><span>SURFACE <b>{settings.surfaceOpacity}%</b></span><input aria-label="Teleprompter surface opacity" type="range" min="70" max="95" step="5" value={settings.surfaceOpacity} onChange={(event) => updateSetting('surfaceOpacity', Number(event.target.value))} /></label>
        </div>
        {error && <p className="prompter-error" role="status">{error}</p>}
      </footer>
    </main>
  );
}
