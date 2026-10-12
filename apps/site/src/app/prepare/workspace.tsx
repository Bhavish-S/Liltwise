'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  eventBriefSchema,
  generatedScriptSchema,
  type AgendaItem,
  type EventBrief,
  type EventGuest,
  type GeneratedScript,
} from '@liltwise/contracts';
import { countWords, enrichScriptDraft } from '@liltwise/domain';

const initialEvent: EventBrief = {
  title: '',
  eventType: '',
  date: '',
  venue: '',
  organization: '',
  speakingRole: 'emcee',
  customRole: '',
  audience: '',
  purpose: '',
  language: 'English',
  tone: 'warm',
  customTone: '',
  targetMinutes: 5,
  detailLevel: 'balanced',
  instructions: '',
  guests: [],
  agenda: [],
  eventGuide: '',
};

const roleLabels: Record<EventBrief['speakingRole'], string> = {
  emcee: 'Emcee',
  host: 'Host',
  keynote: 'Keynote speaker',
  guest: 'Guest speaker',
  moderator: 'Moderator',
  panelist: 'Panelist',
  custom: 'Custom role',
};

type ApiError = { error?: { code?: string; message?: string } };

function createId(): string {
  return crypto.randomUUID();
}

function prettyField(path: PropertyKey[]): string {
  const last = path.at(-1)?.toString() ?? 'Event details';
  return last.replace(/[A-Z]/gu, (letter) => ` ${letter.toLocaleLowerCase('en-US')}`);
}

function scriptText(script: GeneratedScript): string {
  return script.sections.map((section) => [
    section.title,
    section.stageDirection ? `[${section.stageDirection}]` : '',
    section.speechText,
  ].filter(Boolean).join('\n')).join('\n\n');
}

function markdownText(script: GeneratedScript): string {
  const sections = script.sections.map((section) => [
    `## ${section.title}`,
    section.purpose ? `_${section.purpose}_` : '',
    section.stageDirection ? `> ${section.stageDirection}` : '',
    section.speechText,
    `_${Math.ceil(section.estimatedSeconds / 60)} min_`,
  ].filter(Boolean).join('\n\n')).join('\n\n');
  const confirmations = script.confirmations.length
    ? `\n\n## Confirm before the event\n${script.confirmations.map((item) => `- ${item}`).join('\n')}`
    : '';
  const checklist = script.factChecklist.length
    ? `\n\n## Fact-check checklist\n${script.factChecklist.map((item) => `- ${item}`).join('\n')}`
    : '';
  return `# ${script.title}\n\n${sections}${confirmations}${checklist}\n`;
}

function downloadText(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function newGuest(): EventGuest {
  return { id: createId(), name: '', officialTitle: '', designation: '', organization: '', pronunciation: '', protocolNotes: '' };
}

function newAgendaItem(): AgendaItem {
  return { id: createId(), title: '', timing: '', durationMinutes: 0, speaker: '', handoff: '', notes: '' };
}

export function EventBrainWorkspace() {
  const [event, setEvent] = useState<EventBrief>(initialEvent);
  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [formError, setFormError] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [notice, setNotice] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [busySection, setBusySection] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [sectionInstructions, setSectionInstructions] = useState<Record<string, string>>({});
  const [showEventDetails, setShowEventDetails] = useState(true);
  function updateEvent<K extends keyof EventBrief>(key: K, value: EventBrief[K]): void {
    setEvent((current) => ({ ...current, [key]: value }));
    setFormError('');
  }

  function updateGuest(id: string, key: keyof EventGuest, value: string): void {
    setEvent((current) => ({
      ...current,
      guests: current.guests.map((guest) => guest.id === id ? { ...guest, [key]: value } : guest),
    }));
    setFormError('');
  }

  function updateAgenda(id: string, key: keyof AgendaItem, value: string | number): void {
    setEvent((current) => ({
      ...current,
      agenda: current.agenda.map((item) => item.id === id ? { ...item, [key]: value } : item),
    }));
    setFormError('');
  }

  function validateEvent(): EventBrief | null {
    const result = eventBriefSchema.safeParse(event);
    if (!result.success) {
      const issues = result.error.issues.slice(0, 4).map((issue) => `${prettyField(issue.path)}: ${issue.message}`);
      setFormError(issues.join(' '));
      setShowEventDetails(true);
      return null;
    }
    setFormError('');
    return result.data;
  }

  async function submitGeneration(payload: unknown): Promise<GeneratedScript | null> {
    setGenerationError('');
    const response = await fetch('/api/event-brain/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (body as ApiError | null)?.error?.message;
      throw new Error(message || 'Script generation could not complete. Try again shortly.');
    }
    const parsed = generatedScriptSchema.safeParse((body as { script?: unknown } | null)?.script);
    if (!parsed.success) throw new Error('The generated script did not pass its safety checks. Try again.');
    return parsed.data;
  }

  async function generateFullScript(): Promise<void> {
    const validEvent = validateEvent();
    if (!validEvent) return;
    if (script && !window.confirm('Regenerate the entire script? This replaces your current edits.')) return;
    setIsGenerating(true);
    setNotice('');
    try {
      const nextScript = await submitGeneration({ mode: 'full', event: validEvent });
      if (nextScript) {
        setScript(nextScript);
        setShowEventDetails(false);
        setNotice('Your new draft is ready. Review every name, title, and event fact before using it.');
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Script generation could not complete.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function regenerateSection(sectionId: string): Promise<void> {
    const validEvent = validateEvent();
    const instruction = sectionInstructions[sectionId]?.trim() ?? '';
    if (!validEvent || !script) return;
    if (instruction.length < 3) {
      setGenerationError('Add a short instruction for the section you want to revise.');
      return;
    }
    setBusySection(sectionId);
    setGenerationError('');
    setNotice('');
    try {
      const nextScript = await submitGeneration({ mode: 'section', event: validEvent, script, sectionId, instruction });
      if (nextScript) {
        setScript(nextScript);
        setSectionInstructions((current) => ({ ...current, [sectionId]: '' }));
        setNotice('That section was revised. Your other sections and their edits were kept.');
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'This section could not be revised.');
    } finally {
      setBusySection('');
    }
  }

  async function uploadGuide(file: File | undefined): Promise<void> {
    if (!file) return;
    setUploadError('');
    setNotice('');
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Choose a file smaller than 10 MiB.');
      return;
    }
    setIsUploading(true);
    try {
      const query = new URLSearchParams({ name: file.name });
      const response = await fetch(`/api/event-guides/extract?${query.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((body as ApiError | null)?.error?.message || 'This file could not be read.');
      }
      const extracted = body as { filename?: unknown; text?: unknown };
      if (typeof extracted.text !== 'string' || typeof extracted.filename !== 'string') {
        throw new Error('The file did not return readable text. Try another document.');
      }
      const addition = `--- Extracted from ${extracted.filename} ---\n${extracted.text}`;
      const combined = [event.eventGuide.trim(), addition].filter(Boolean).join('\n\n');
      if (combined.length > 40_000) throw new Error('The combined guide is longer than 40,000 characters. Shorten it before adding this file.');
      updateEvent('eventGuide', combined);
      setNotice(`Text extracted from ${extracted.filename}. Review and edit it below before generating.`);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'This file could not be read.');
    } finally {
      setIsUploading(false);
    }
  }

  function updateSection(sectionId: string, speechText: string): void {
    setScript((current) => current ? enrichScriptDraft({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId ? { ...section, speechText } : section),
    }) as GeneratedScript : current);
    setNotice('Your edit is saved in this page for this session.');
  }

  async function copyText(text: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied to the clipboard.`);
      setGenerationError('');
    } catch {
      setGenerationError('Clipboard access is unavailable. Select the script text and copy it manually.');
    }
  }

  return (
    <main className="prepare-page" id="top">
      <header className="site-header prepare-header">
        <div className="header-inner">
          <Link aria-label="Liltwise home" className="wordmark" href="/">
            <span aria-hidden="true" className="wordmark-mark"><svg viewBox="0 0 32 32" fill="none"><path d="M7 22V10l9 8 9-8v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="23" r="2" fill="currentColor" /></svg></span>
            <span>liltwise</span>
          </Link>
          <Link className="prepare-home-link" href="/">Back to home</Link>
        </div>
      </header>

      <section className="prepare-intro section-wrap">
        <p className="eyebrow"><span className="eyebrow-dot" /> EVENT BRAIN · PREPARATION STUDIO</p>
        <h1>Bring the whole<br /><span>moment into focus.</span></h1>
        <p>Share what the event is really about. Liltwise will shape a clear, speakable draft that you can review and make your own.</p>
        <div className="prepare-steps" aria-label="Preparation steps"><span className={showEventDetails ? 'is-current' : 'is-done'}>01 <b>Event context</b></span><i /><span className={!showEventDetails && script ? 'is-current' : ''}>02 <b>Your script</b></span></div>
      </section>

      <div className="prepare-layout section-wrap">
        <section className={`event-form-card ${!showEventDetails && script ? 'details-collapsed' : ''}`} aria-labelledby="event-form-title">
          <div className="prepare-card-heading">
            <div><p className="card-kicker">01 / EVENT BRIEF</p><h2 id="event-form-title">Start with the essentials</h2><p className="card-subtitle">Fields marked required give the script its direction.</p></div>
            {script && <button className="text-button" type="button" onClick={() => setShowEventDetails((visible) => !visible)}>{showEventDetails ? 'Hide details' : 'Edit details'} <span aria-hidden="true">{showEventDetails ? '−' : '+'}</span></button>}
          </div>

          {showEventDetails && <form onSubmit={(submitEvent) => { submitEvent.preventDefault(); void generateFullScript(); }}>
            <div className="form-section">
              <div className="form-section-title"><span>01</span><div><h3>The event</h3><p>Give your script a clear setting.</p></div></div>
              <div className="field-grid two-columns">
                <label className="form-field"><span>Event title <i>Required</i></span><input autoComplete="off" value={event.title} onChange={(e) => updateEvent('title', e.target.value)} maxLength={200} placeholder="Annual leadership gathering" required /></label>
                <label className="form-field"><span>Event type <i>Required</i></span><input value={event.eventType} onChange={(e) => updateEvent('eventType', e.target.value)} maxLength={120} placeholder="Conference, ceremony, town hall…" required /></label>
                <label className="form-field"><span>Date <small>Optional</small></span><input type="date" value={event.date} onChange={(e) => updateEvent('date', e.target.value)} /></label>
                <label className="form-field"><span>Organization <small>Optional</small></span><input value={event.organization} onChange={(e) => updateEvent('organization', e.target.value)} maxLength={240} placeholder="Organization or community" /></label>
                <label className="form-field"><span>Venue <small>Optional</small></span><input value={event.venue} onChange={(e) => updateEvent('venue', e.target.value)} maxLength={240} placeholder="Venue or online event" /></label>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title"><span>02</span><div><h3>Your part in it</h3><p>Choose the role and delivery style that fit.</p></div></div>
              <div className="field-grid two-columns">
                <label className="form-field"><span>Speaking role <i>Required</i></span><select value={event.speakingRole} onChange={(e) => updateEvent('speakingRole', e.target.value as EventBrief['speakingRole'])}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {event.speakingRole === 'custom' && <label className="form-field"><span>Your role <i>Required</i></span><input value={event.customRole} onChange={(e) => updateEvent('customRole', e.target.value)} maxLength={120} placeholder="Describe your role" /></label>}
                <label className="form-field"><span>Language <i>Required</i></span><input value={event.language} onChange={(e) => updateEvent('language', e.target.value)} maxLength={80} placeholder="English" required /></label>
                <label className="form-field"><span>Tone <i>Required</i></span><select value={event.tone} onChange={(e) => updateEvent('tone', e.target.value as EventBrief['tone'])}><option value="formal">Formal</option><option value="professional">Professional</option><option value="warm">Warm</option><option value="inspirational">Inspirational</option><option value="conversational">Conversational</option><option value="ceremonial">Ceremonial</option><option value="custom">Customized</option></select></label>
                {event.tone === 'custom' && <label className="form-field"><span>Describe the tone <i>Required</i></span><input value={event.customTone} onChange={(e) => updateEvent('customTone', e.target.value)} maxLength={120} placeholder="The feeling you want to create" /></label>}
                <label className="form-field"><span>Speaking time <i>Required</i></span><div className="input-with-suffix"><input type="number" min={1} max={180} value={event.targetMinutes} onChange={(e) => updateEvent('targetMinutes', Number(e.target.value))} /><span>minutes</span></div></label>
                <label className="form-field"><span>Level of detail</span><select value={event.detailLevel} onChange={(e) => updateEvent('detailLevel', e.target.value as EventBrief['detailLevel'])}><option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></label>
                <label className="form-field field-span"><span>Who will be listening? <i>Required</i></span><textarea value={event.audience} onChange={(e) => updateEvent('audience', e.target.value)} maxLength={1200} rows={2} placeholder="Describe the audience and what they already know." required /></label>
                <label className="form-field field-span"><span>What is the event meant to accomplish? <i>Required</i></span><textarea value={event.purpose} onChange={(e) => updateEvent('purpose', e.target.value)} maxLength={1600} rows={2} placeholder="What should people understand, feel, or do by the end?" required /></label>
                <label className="form-field field-span"><span>Additional writing guidance <small>Optional</small></span><textarea value={event.instructions} onChange={(e) => updateEvent('instructions', e.target.value)} maxLength={5000} rows={3} placeholder="Topics to emphasize, words to avoid, accessibility needs, or personal preferences." /></label>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title"><span>03</span><div><h3>People to acknowledge</h3><p>Only include names and protocol details you have verified.</p></div></div>
              <div className="dynamic-list">
                {event.guests.map((guest, index) => <fieldset className="repeat-card" key={guest.id}>
                  <legend>Important person {index + 1}</legend>
                  <button className="remove-button" type="button" aria-label={`Remove important person ${index + 1}`} onClick={() => updateEvent('guests', event.guests.filter((item) => item.id !== guest.id))}>Remove</button>
                  <div className="field-grid two-columns">
                    <label className="form-field"><span>Full name <i>Required</i></span><input value={guest.name} onChange={(e) => updateGuest(guest.id, 'name', e.target.value)} maxLength={160} placeholder="Name as it should be spoken" /></label>
                    <label className="form-field"><span>Official title <small>Optional</small></span><input value={guest.officialTitle} onChange={(e) => updateGuest(guest.id, 'officialTitle', e.target.value)} maxLength={160} placeholder="Dr., Mayor, Professor…" /></label>
                    <label className="form-field"><span>Designation <small>Optional</small></span><input value={guest.designation} onChange={(e) => updateGuest(guest.id, 'designation', e.target.value)} maxLength={200} placeholder="Exact office or position" /></label>
                    <label className="form-field"><span>Organization <small>Optional</small></span><input value={guest.organization} onChange={(e) => updateGuest(guest.id, 'organization', e.target.value)} maxLength={200} placeholder="Organization" /></label>
                    <label className="form-field"><span>Pronunciation help <small>Optional</small></span><input value={guest.pronunciation} onChange={(e) => updateGuest(guest.id, 'pronunciation', e.target.value)} maxLength={240} placeholder="A simple phonetic guide" /></label>
                    <label className="form-field"><span>Protocol notes <small>Optional</small></span><input value={guest.protocolNotes} onChange={(e) => updateGuest(guest.id, 'protocolNotes', e.target.value)} maxLength={1000} placeholder="Order or form of acknowledgement supplied by organizers" /></label>
                  </div>
                </fieldset>)}
                <button className="add-row-button" type="button" onClick={() => updateEvent('guests', [...event.guests, newGuest()])}>＋ Add an important person</button>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title"><span>04</span><div><h3>Agenda and handoffs</h3><p>Give the script a reliable sequence to follow.</p></div></div>
              <div className="dynamic-list">
                {event.agenda.map((item, index) => <fieldset className="repeat-card" key={item.id}>
                  <legend>Agenda item {index + 1}</legend>
                  <button className="remove-button" type="button" aria-label={`Remove agenda item ${index + 1}`} onClick={() => updateEvent('agenda', event.agenda.filter((row) => row.id !== item.id))}>Remove</button>
                  <div className="field-grid two-columns">
                    <label className="form-field"><span>Item or speaker <i>Required</i></span><input value={item.title} onChange={(e) => updateAgenda(item.id, 'title', e.target.value)} maxLength={200} placeholder="Opening remarks" /></label>
                    <label className="form-field"><span>Speaker or lead <small>Optional</small></span><input value={item.speaker} onChange={(e) => updateAgenda(item.id, 'speaker', e.target.value)} maxLength={200} placeholder="Name as supplied" /></label>
                    <label className="form-field"><span>Timing <small>Optional</small></span><input value={item.timing} onChange={(e) => updateAgenda(item.id, 'timing', e.target.value)} maxLength={100} placeholder="9:30 AM or after the welcome" /></label>
                    <label className="form-field"><span>Duration <small>Optional</small></span><div className="input-with-suffix"><input type="number" min={0} max={600} value={item.durationMinutes} onChange={(e) => updateAgenda(item.id, 'durationMinutes', Number(e.target.value))} /><span>minutes</span></div></label>
                    <label className="form-field field-span"><span>Handoff or transition <small>Optional</small></span><input value={item.handoff} onChange={(e) => updateAgenda(item.id, 'handoff', e.target.value)} maxLength={500} placeholder="How the next speaker should be introduced" /></label>
                    <label className="form-field field-span"><span>Notes <small>Optional</small></span><textarea value={item.notes} onChange={(e) => updateAgenda(item.id, 'notes', e.target.value)} maxLength={1000} rows={2} placeholder="Only information supplied by the organizer" /></label>
                  </div>
                </fieldset>)}
                <button className="add-row-button" type="button" onClick={() => updateEvent('agenda', [...event.agenda, newAgendaItem()])}>＋ Add an agenda item</button>
              </div>
            </div>

            <div className="form-section guide-section">
              <div className="form-section-title"><span>05</span><div><h3>Event guide and organizer notes</h3><p>Paste or upload the complete guide. Review extracted text before generation.</p></div></div>
              <label className="form-field"><span>Event guide <small>Optional · up to 40,000 characters</small></span><textarea className="guide-textarea" value={event.eventGuide} onChange={(e) => updateEvent('eventGuide', e.target.value)} maxLength={40_000} rows={9} placeholder="Paste the event brief, agenda notes, speaker introductions, or organizer guidance here. This text is treated as source material, not as instructions that override Liltwise's fact-checking rules." /></label>
              <div className="guide-footer"><span>{event.eventGuide.length.toLocaleString()} / 40,000 characters</span><label className="upload-button">{isUploading ? 'Reading file…' : 'Upload a guide'}<input type="file" accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={isUploading} onChange={(e) => { const file = e.target.files?.[0]; void uploadGuide(file); e.currentTarget.value = ''; }} /></label></div>
              <p className="upload-help">TXT, Markdown, text PDFs, and DOCX · max 10 MiB per file · scanned-PDF OCR is not included.</p>
              {uploadError && <p className="inline-error" role="alert">{uploadError}</p>}
            </div>

            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="generation-consent"><span aria-hidden="true">i</span><p>When you generate, these event details are sent to OpenAI to create your draft. Liltwise does not save them in this milestone. Review the text before using it live.</p></div>
            <div className="generate-row"><p><strong>Keep control of the final words.</strong><br />You can edit every section and export the draft.</p><button className="button button-primary generate-button" type="submit" disabled={isGenerating || isUploading}>{isGenerating ? <><span className="button-spinner" /> Preparing your draft…</> : script ? 'Regenerate entire script' : 'Create my script'} <span aria-hidden="true">↗</span></button></div>
          </form>}
        </section>

        <section className={`script-result-card ${script ? 'has-script' : ''}`} aria-labelledby="script-result-title" aria-live="polite">
          {!script ? <div className="script-empty-state"><div className="empty-mark" aria-hidden="true">L</div><p className="card-kicker">02 / YOUR SCRIPT</p><h2 id="script-result-title">A thoughtful draft<br />starts with context.</h2><p>Complete the event brief to prepare a script shaped around your role, audience, people, and agenda.</p><div className="empty-script-outline"><span>01</span>Opening and welcome<i /><span>02</span>Transitions and handoffs<i /><span>03</span>Closing, when it fits</div><small>Every output is a draft. Verify names, titles, timing, and protocol.</small></div> : <>
            <div className="script-output-header">
              <div><p className="card-kicker">02 / EVENT SCRIPT</p><input className="script-title-input" aria-label="Script title" value={script.title} maxLength={200} onChange={(e) => setScript((current) => current ? { ...current, title: e.target.value } : current)} /><p className="script-meta">{script.totalWordCount.toLocaleString()} words <i /> about {script.estimatedMinutes} min at 130 wpm</p></div>
              <button className="text-button" type="button" onClick={() => setShowEventDetails(true)}>Edit event details</button>
            </div>
            <div className="script-toolbar"><button type="button" onClick={() => void copyText(scriptText(script), 'Complete script')}>Copy full script</button><button type="button" onClick={() => downloadText('liltwise-script.md', markdownText(script), 'text/markdown;charset=utf-8')}>Download Markdown</button><button type="button" onClick={() => downloadText('liltwise-script.txt', scriptText(script), 'text/plain;charset=utf-8')}>Download text</button></div>
            <div className="script-section-list">
              {script.sections.map((section, index) => <article className="script-section-editor" key={section.id}>
                <div className="script-section-heading"><span className="script-section-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{section.title}</h3><p>{section.purpose}</p></div><span className="section-time">~{Math.max(1, Math.ceil(section.estimatedSeconds / 60))} min</span></div>
                {section.stageDirection && <p className="stage-direction">{section.stageDirection}</p>}
                <textarea aria-label={`Speech text: ${section.title}`} value={section.speechText} maxLength={20_000} rows={Math.min(12, Math.max(4, Math.ceil(section.speechText.length / 88)))} onChange={(e) => updateSection(section.id, e.target.value)} />
                <div className="section-editor-footer"><span>{countWords(section.speechText)} words</span><button type="button" onClick={() => void copyText(`${section.title}\n\n${section.speechText}`, 'Section')}>Copy section</button></div>
                <details className="section-refine"><summary>Refine this section</summary><label className="form-field"><span>What should change?</span><input maxLength={1000} value={sectionInstructions[section.id] ?? ''} onChange={(e) => setSectionInstructions((current) => ({ ...current, [section.id]: e.target.value }))} placeholder="Make the opening shorter and more conversational" /></label><button className="refine-button" type="button" disabled={busySection !== '' || isGenerating} onClick={() => void regenerateSection(section.id)}>{busySection === section.id ? 'Revising this section…' : 'Regenerate this section'}</button></details>
              </article>)}
            </div>
            {script.confirmations.length > 0 && <div className="review-panel"><h3>Confirm these details</h3><ul>{script.confirmations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
            {script.factChecklist.length > 0 && <div className="review-panel checklist-panel"><h3>Before the event</h3><ul>{script.factChecklist.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
            <p className="script-review-note"><span aria-hidden="true">✓</span> Read the full script aloud and verify every supplied fact, name, title, and handoff. The draft may use placeholders when details are missing.</p>
          </>}
          {generationError && <p className="form-error output-error" role="alert">{generationError}</p>}
          {notice && <p className="success-note" role="status">{notice}</p>}
        </section>
      </div>
      <footer className="prepare-footer section-wrap"><Link className="wordmark" href="/"><span aria-hidden="true" className="wordmark-mark"><svg viewBox="0 0 32 32" fill="none"><path d="M7 22V10l9 8 9-8v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>liltwise</span></Link><span>Event drafts are yours to review. No event data is saved by this milestone.</span></footer>
    </main>
  );
}
