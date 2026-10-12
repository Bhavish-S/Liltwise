import { useEffect, useMemo, useState } from 'react';
import type { CompanionSnapshot, ReadingSettings, TeleprompterStatus } from '@liltwise/contracts';
import { countWords, DEFAULT_READING_SETTINGS } from '@liltwise/domain';

const SAMPLE_SCRIPT = `Good afternoon, everyone, and thank you for being here.

Today is a chance to step back from the day-to-day work and remember why we started. The best ideas rarely arrive fully formed. They grow when people share what they see, listen carefully, and make room for a better answer.

Over the next few minutes, I’d like to share what we’ve learned, what we’re building next, and where your perspective can make a difference. Let’s begin.`;

const MAX_SCRIPT_LENGTH = 100_000;
const emptyCompanionSnapshot: CompanionSnapshot = {
  available: false,
  diagnostic: 'Checking the local website connection…',
  allowedWebsiteConfigured: false,
  pairingCode: null,
  pairingExpiresAt: null,
  paired: false,
  pendingImport: null,
};

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
  const [companion, setCompanion] = useState<CompanionSnapshot>(emptyCompanionSnapshot);
  const [companionMessage, setCompanionMessage] = useState('');
  const words = useMemo(() => countWords(script), [script]);
  const canOpen = script.trim().length > 0 && script.length <= MAX_SCRIPT_LENGTH && !isSubmitting;

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = window.liltwise.onTeleprompterStatus((nextStatus) => {
      if (isMounted) setStatus(nextStatus);
    });
    const unsubscribeCompanion = window.liltwise.onCompanionState((nextSnapshot) => {
      if (isMounted) setCompanion(nextSnapshot);
    });

    window.liltwise.getTeleprompterStatus()
      .then((nextStatus) => {
        if (isMounted) setStatus(nextStatus);
      })
      .catch(() => {
        if (isMounted) setError('Could not read the floating-window status. Restart the app and try again.');
      });

    window.liltwise.getCompanionSnapshot()
      .then((nextSnapshot) => {
        if (isMounted) setCompanion(nextSnapshot);
      })
      .catch(() => {
        if (isMounted) setCompanionMessage('The website connection status could not be read. Restart the desktop app and try again.');
      });

    return () => {
      isMounted = false;
      unsubscribe();
      unsubscribeCompanion();
    };
  }, []);

  useEffect(() => {
    if (!companion.pairingCode) return;
    const timer = window.setInterval(() => {
      void window.liltwise.getCompanionSnapshot().then(setCompanion).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [companion.pairingCode]);

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

  async function startWebsitePairing(): Promise<void> {
    setCompanionMessage('');
    try {
      const next = await window.liltwise.createCompanionPairingCode();
      setCompanion(next);
      setCompanionMessage(next.available
        ? 'Enter this one-time code in the Liltwise website. It expires in five minutes.'
        : next.diagnostic || 'The local companion is unavailable.');
    } catch {
      setCompanionMessage('A pairing code could not be created. Restart Liltwise and try again.');
    }
  }

  async function disconnectWebsite(): Promise<void> {
    setCompanionMessage('');
    try {
      setCompanion(await window.liltwise.revokeCompanionPairing());
      setCompanionMessage('The website session and any unused pairing code were revoked.');
    } catch {
      setCompanionMessage('The website session could not be revoked. Quit Liltwise to close the local connection.');
    }
  }

  async function approveIncomingScript(): Promise<void> {
    const pending = companion.pendingImport;
    if (!pending) return;
    const accepted = window.confirm(`Load “${pending.script.title}” (${pending.script.sections.length} sections) and replace the current desktop draft and floating script? Your current draft is only held for this session.`);
    if (!accepted) return;
    setCompanionMessage('');
    try {
      const result = await window.liltwise.acceptIncomingScript(pending.transferId);
      if (!result.ok || !result.imported) {
        setCompanionMessage(result.message);
        return;
      }
      setScript(result.imported.formattedText);
      setError('');
      setMessage(`Loaded “${result.imported.title}” from the website. The floating teleprompter has the updated text.`);
      setCompanionMessage(result.message);
    } catch {
      setCompanionMessage('The incoming script could not be loaded. Your current draft was kept.');
    }
  }

  async function dismissIncomingScript(): Promise<void> {
    const pending = companion.pendingImport;
    if (!pending) return;
    try {
      const result = await window.liltwise.dismissIncomingScript(pending.transferId);
      setCompanionMessage(result.message);
    } catch {
      setCompanionMessage('The incoming script could not be dismissed. Your current draft was kept.');
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

      <section className="companion-card" aria-labelledby="companion-title">
        <div className="companion-card-heading">
          <div><span className="card-overline">WEBSITE CONNECTION</span><h2 id="companion-title">Bring a prepared script over</h2><p>Pair with Liltwise in your browser to send a script to this computer.</p></div>
          <span className={`companion-status ${companion.paired ? 'is-connected' : ''}`}><i />{companion.paired ? 'Website paired' : companion.available ? 'Ready on this computer' : 'Connection unavailable'}</span>
        </div>
        {!companion.available && companion.diagnostic && <p className="companion-diagnostic" role="status">{companion.diagnostic}</p>}
        {!companion.allowedWebsiteConfigured && <p className="companion-diagnostic" role="status">This desktop build has no website origin configured. Set <code>LILTWISE_ALLOWED_WEB_ORIGINS</code> when building a production desktop app.</p>}
        <div className="companion-controls">
          {companion.pairingCode
            ? <div className="pairing-code-block"><span>ONE-TIME PAIRING CODE</span><strong aria-label={`Pairing code ${companion.pairingCode}`}>{companion.pairingCode}</strong><small>Expires in {Math.max(0, Math.ceil(((companion.pairingExpiresAt ?? 0) - Date.now()) / 60_000))} min · enter it on the website</small></div>
            : <button className="primary-button" type="button" disabled={!companion.available || !companion.allowedWebsiteConfigured} onClick={() => void startWebsitePairing()}>Connect Website <span aria-hidden="true">↗</span></button>}
          {companion.paired && <button className="secondary-button" type="button" onClick={() => void disconnectWebsite()}>Disconnect website</button>}
          {companion.pairingCode && <button className="secondary-button" type="button" onClick={() => void disconnectWebsite()}>Cancel pairing</button>}
          {companion.paired && !companion.pairingCode && <button className="text-button" type="button" onClick={() => void startWebsitePairing()}>Create a new code</button>}
        </div>
        {companionMessage && <p className="status-message" role="status">{companionMessage}</p>}
        {companion.pendingImport && <div className="incoming-script-card" role="region" aria-label="Incoming website script">
          <div><span className="card-overline">INCOMING SCRIPT · REVIEW REQUIRED</span><h3>{companion.pendingImport.script.title}</h3><p>{companion.pendingImport.script.sections.length} sections · {companion.pendingImport.script.totalWordCount} words{companion.pendingImport.eventTitle ? ` · ${companion.pendingImport.eventTitle}` : ''}{companion.pendingImport.eventType ? ` · ${companion.pendingImport.eventType}` : ''}</p></div>
          <div className="companion-controls"><button className="primary-button" type="button" onClick={() => void approveIncomingScript()}>Review and load</button><button className="secondary-button" type="button" onClick={() => void dismissIncomingScript()}>Dismiss</button></div>
          <p className="incoming-preview">{companion.pendingImport.script.sections[0]?.speechText.slice(0, 320)}{(companion.pendingImport.script.sections[0]?.speechText.length ?? 0) > 320 ? '…' : ''}</p>
        </div>}
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
