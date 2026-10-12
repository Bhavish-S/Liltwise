import { useEffect, useRef, useState } from 'react';
import type { ReadingSettings, TeleprompterData } from '@liltwise/contracts';
import { countWords, DEFAULT_READING_SETTINGS } from '@liltwise/domain';

export function Teleprompter() {
  const [data, setData] = useState<TeleprompterData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const scrollArea = useRef<HTMLDivElement>(null);

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
        <div className="prompter-brand"><span className="brand-mark small-mark">L</span><span>liltwise</span><i /> <span className="prompter-mode">READING PREVIEW</span></div>
        <button className="hide-button no-drag" type="button" onClick={() => void hide()} aria-label="Hide floating teleprompter">Hide <span aria-hidden="true">×</span></button>
      </header>

      <div className="prompter-meta"><span>{hasScript ? `${countWords(data?.script ?? '')} WORDS` : 'NO SCRIPT YET'}</span><span>POSITION {progress}%</span></div>
      <section className="prompter-reading-area" ref={scrollArea} onScroll={updateProgress} aria-label="Teleprompter script">
        {hasScript ? <p className="prompter-script">{data?.script}</p> : <div className="prompter-empty"><strong>Your script will appear here.</strong><span>Return to Liltwise and add or update your draft.</span></div>}
      </section>

      <footer className="prompter-controls no-drag">
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
