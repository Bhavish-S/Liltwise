import { useEffect, useMemo, useState } from 'react';
import type { ReadingSettings, TeleprompterStatus } from '@liltwise/contracts';
import { countWords, DEFAULT_READING_SETTINGS } from '@liltwise/domain';

const SAMPLE_SCRIPT = `Good afternoon, everyone, and thank you for being here.

Today is a chance to step back from the day-to-day work and remember why we started. The best ideas rarely arrive fully formed. They grow when people share what they see, listen carefully, and make room for a better answer.

Over the next few minutes, I’d like to share what we’ve learned, what we’re building next, and where your perspective can make a difference. Let’s begin.`;

const MAX_SCRIPT_LENGTH = 100_000;

function wordCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'word' : 'words'}`;
}

function formatMinutes(count: number): string {
  if (!count) return '—';
  const minutes = Math.max(1, Math.ceil(count / 130));
  return `~${minutes} min`;
}

export function Workspace() {
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [settings, setSettings] = useState<ReadingSettings>(DEFAULT_READING_SETTINGS);
  const [status, setStatus] = useState<TeleprompterStatus>({ open: false, visible: false });
  const [message, setMessage] = useState('Your draft stays on this device for this session.');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const words = useMemo(() => countWords(script), [script]);
  const canOpen = script.trim().length > 0 && script.length <= MAX_SCRIPT_LENGTH && !isSubmitting;

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = window.liltwise.onTeleprompterStatus((nextStatus) => {
      if (isMounted) setStatus(nextStatus);
    });

    window.liltwise.getTeleprompterStatus()
      .then((nextStatus) => {
        if (isMounted) setStatus(nextStatus);
      })
      .catch(() => {
        if (isMounted) setError('Could not read the floating-window status. Restart the app and try again.');
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  function updateSetting<K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]): void {
    setSettings((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function sendScript(action: 'open' | 'update'): Promise<void> {
    setError('');
    setIsSubmitting(true);
    try {
      const result = action === 'open'
        ? await window.liltwise.openTeleprompter({ script, settings })
        : await window.liltwise.updateTeleprompter({ script, settings });
      if (result.ok) setMessage(result.message);
      else setError(result.message);
    } catch {
      setError('Liltwise could not contact its floating window. Close it and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <a className="brand-lockup" href="#home" aria-label="Liltwise home">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span className="brand-name">liltwise</span>
        </a>
        <div className="header-context"><span className="context-dot" /> DESKTOP STUDIO</div>
        <div className="header-preview">MILESTONE PREVIEW</div>
      </header>

      <section className="workspace-intro" id="home">
        <p className="section-kicker">YOUR AI CO-PRESENTER</p>
        <h1>Make room for your words.</h1>
        <p>Shape a draft, set your reading pace, and bring your script into a calm floating window.</p>
      </section>

      <section className="workspace-grid" aria-label="Script workspace">
        <article className="editor-card">
          <div className="card-heading">
            <div><span className="card-overline">01 / YOUR SCRIPT</span><h2>Draft for the moment</h2></div>
            <span className="draft-badge"><span /> SESSION DRAFT</span>
          </div>
          <label className="visually-hidden" htmlFor="script-editor">Speech script</label>
          <textarea
            id="script-editor"
            className="script-editor"
            value={script}
            onChange={(event) => {
              setScript(event.target.value);
              setError('');
              setMessage('Draft changed. Update the floating script when you are ready.');
            }}
            maxLength={MAX_SCRIPT_LENGTH}
            spellCheck
            placeholder="Write or paste your speech here…"
          />
          <div className="editor-footer">
            <span>{wordCountLabel(words)} <span className="footer-separator">·</span> {formatMinutes(words)} at 130 wpm</span>
            <span>{script.length.toLocaleString()} / {MAX_SCRIPT_LENGTH.toLocaleString()}</span>
          </div>
          <div className="editor-hint"><span className="hint-spark">✳</span> Your draft is kept locally in this app session.</div>
        </article>

        <aside className="settings-card" aria-label="Reading controls">
          <div className="card-heading compact-heading">
            <div><span className="card-overline">02 / READING SETUP</span><h2>Find your rhythm</h2></div>
            <span className="settings-icon" aria-hidden="true">☷</span>
          </div>

          <label className="range-control">
            <span className="range-label"><span>Letter size</span><strong>{settings.fontSize}px</strong></span>
            <input aria-label="Letter size" type="range" min="22" max="56" step="2" value={settings.fontSize} onChange={(event) => updateSetting('fontSize', Number(event.target.value))} />
            <span className="range-ends"><span>Aa</span><span className="large-aa">Aa</span></span>
          </label>

          <label className="range-control">
            <span className="range-label"><span>Preview pace</span><strong>{settings.scrollSpeed} px/s</strong></span>
            <input aria-label="Preview pace" type="range" min="12" max="96" step="4" value={settings.scrollSpeed} onChange={(event) => updateSetting('scrollSpeed', Number(event.target.value))} />
            <span className="range-ends"><span>Gentle</span><span>Brisk</span></span>
          </label>

          <label className="range-control">
            <span className="range-label"><span>Surface opacity</span><strong>{settings.surfaceOpacity}%</strong></span>
            <input aria-label="Surface opacity" type="range" min="70" max="95" step="5" value={settings.surfaceOpacity} onChange={(event) => updateSetting('surfaceOpacity', Number(event.target.value))} />
            <span className="range-ends"><span>Airy</span><span>Solid</span></span>
          </label>

          <div className="settings-divider" />
          <div className="launch-note"><span className="launch-icon" aria-hidden="true">↗</span><span>Reading preview only<br /><small>Scroll follows time, not your voice.</small></span></div>
          <div className="launch-actions">
            <button className="primary-button" type="button" disabled={!canOpen} onClick={() => void sendScript('open')}>
              <span>{isSubmitting ? 'Opening…' : status.open ? 'Open / refresh floating script' : 'Open floating teleprompter'}</span>
              <span aria-hidden="true">↗</span>
            </button>
            {status.open && <button className="secondary-button" type="button" disabled={isSubmitting} onClick={() => void sendScript('update')}>Update floating script</button>}
          </div>
          <p className="status-message" role="status">{error || (!script.trim() ? 'Add script text before opening the floating window.' : message)}</p>
          <div className="window-status"><span className={status.visible ? 'status-pip is-live' : 'status-pip'} />{status.visible ? 'Floating window is open' : status.open ? 'Floating window is hidden' : 'Floating window is closed'}</div>
        </aside>
      </section>

      <footer className="workspace-footer"><span>MADE FOR THE MOMENT</span><span>© Liltwise <i /> Preview build</span></footer>
    </main>
  );
}
