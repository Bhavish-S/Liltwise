import Link from 'next/link';
import { PRODUCT_CAPABILITIES } from '@liltwise/domain';

function Wordmark() {
  return (
    <Link aria-label="Liltwise home" className="wordmark" href="#top">
      <span aria-hidden="true" className="wordmark-mark">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M7 22V10l9 8 9-8v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="23" r="2" fill="currentColor" />
        </svg>
      </span>
      <span>liltwise</span>
    </Link>
  );
}

const steps = [
  { number: '01', title: 'Bring the context', text: 'Start with the event, your audience, and the guidance that matters.' },
  { number: '02', title: 'Shape your words', text: 'Prepare and edit a speech that sounds like you and fits the moment.' },
  { number: '03', title: 'Stay with your audience', text: 'Keep a useful prompt close while you focus on the people in the room.' },
];

export default function HomePage() {
  return (
    <main id="top">
      <header className="site-header">
        <div className="header-inner">
          <Wordmark />
          <nav aria-label="Main navigation" className="main-nav">
            <Link href="#product">The product</Link>
            <Link href="#how-it-works">How it works</Link>
            <Link href="#download">Download</Link>
          </nav>
          <Link className="header-cta" href="#download">Meet Liltwise <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <section aria-labelledby="hero-title" className="hero section-wrap">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> YOUR AI CO-PRESENTER</p>
          <h1 id="hero-title">Stay present.<br /><span>Never lose</span> your words.</h1>
          <p className="hero-lede">A calmer way to prepare and deliver your next presentation. Liltwise is being built to help you bring the right words into the room—and keep your attention on the people there.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="#product">Explore the product <span aria-hidden="true">↓</span></Link>
            <Link className="button button-quiet" href="#download">Desktop app status <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="hero-note"><span className="note-line" /> Thoughtful support for the moments that matter.</div>
        </div>

        <div aria-label="Illustration of a speaker's prepared notes" className="hero-art" role="img">
          <div className="art-glow" />
          <div className="note-card note-card-back">
            <span className="mini-label">EVENT BRIEF</span>
            <span className="skeleton skeleton-long" /><span className="skeleton skeleton-mid" /><span className="skeleton skeleton-short" />
          </div>
          <div className="note-card note-card-main">
            <div className="script-topline"><span className="live-dot" /> <span>YOUR TALK</span><span className="script-time">03:24</span></div>
            <p className="script-overline">A GOOD PLACE TO BEGIN</p>
            <h2>“The best ideas<br />start with a<br /><em>conversation.</em>”</h2>
            <div className="script-divider" />
            <p className="script-next">And today, I want to share one with you.</p>
            <div className="script-footer"><span>01 / 08</span><div className="progress-track"><span /></div><span>08:00</span></div>
          </div>
          <div className="art-caption"><span className="caption-spark">✳</span><span>Made for your next big moment</span></div>
        </div>
        <div aria-hidden="true" className="hero-arc" />
      </section>

      <section aria-label="Product status" className="status-strip">
        <div className="status-inner"><span className="status-pulse" /><p>Early foundation in progress</p><span className="status-separator">·</span><p>Designed for macOS &amp; Windows</p><span className="status-separator">·</span><p>Built around your voice</p></div>
      </section>

      <section aria-labelledby="product-title" className="product-section section-wrap" id="product">
        <div className="section-heading">
          <p className="eyebrow">A LITTLE MORE IN YOUR CORNER</p>
          <h2 id="product-title">Good preparation.<br /><span>More presence.</span></h2>
          <p className="section-intro">Liltwise is designed to support the whole speaking moment—from the first event notes to the last line on stage.</p>
        </div>
        <div className="feature-grid">
          {PRODUCT_CAPABILITIES.map((capability, index) => (
            <article className={`feature-card feature-card-${index + 1}`} key={capability.title}>
              <div className="feature-card-top"><span className="feature-number">0{index + 1}</span><span className="feature-status">{capability.status === 'in-development' ? 'IN DEVELOPMENT' : 'PLANNED'}</span></div>
              <div aria-hidden="true" className={`feature-symbol feature-symbol-${index + 1}`}>
                {index === 0 ? <><span className="symbol-line symbol-line-1" /><span className="symbol-line symbol-line-2" /><span className="symbol-line symbol-line-3" /><span className="symbol-caret" /></> : index === 1 ? <><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit-core">✳</span></> : <><span className="page-shape"><i /><i /><i /></span><span className="sparkle">✳</span></>}
              </div>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="steps-title" className="steps-section" id="how-it-works">
        <div className="section-wrap steps-inner">
          <div className="steps-heading">
            <p className="eyebrow">FROM PREP TO PRESENCE</p>
            <h2 id="steps-title">The moment is yours.<br /><span>We’ll help you feel ready.</span></h2>
          </div>
          <div className="steps-list">
            {steps.map((step) => <article className="step-row" key={step.number}><span className="step-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.text}</p></div><span aria-hidden="true" className="step-arrow">↗</span></article>)}
          </div>
        </div>
      </section>

      <section aria-labelledby="download-title" className="download-section section-wrap" id="download">
        <div className="download-panel">
          <div className="download-copy">
            <p className="eyebrow">A NOTE FROM THE TEAM</p>
            <h2 id="download-title">We’re getting<br />the foundation right.</h2>
            <p>The desktop companion is in its early build stage. Installers aren’t available yet. We’ll share them here when they’re ready to download.</p>
          </div>
          <div className="download-options" aria-label="Desktop installer availability">
            <div className="download-option"><span className="platform-icon platform-mac" aria-hidden="true">⌘</span><span className="platform-copy"><strong>macOS</strong><small>Installer coming soon</small></span><span className="coming-label">IN PROGRESS</span></div>
            <div className="download-option"><span className="platform-icon platform-windows" aria-hidden="true">⊞</span><span className="platform-copy"><strong>Windows</strong><small>Installer coming soon</small></span><span className="coming-label">IN PROGRESS</span></div>
            <p className="download-footnote">No download is available today. We’ll update this page when there’s something ready to install.</p>
          </div>
        </div>
      </section>

      <footer className="site-footer section-wrap">
        <Wordmark />
        <p>For the words you’ve prepared<br />and the moments you haven’t.</p>
        <span className="footer-copyright">© 2026 Liltwise</span>
      </footer>
    </main>
  );
}
