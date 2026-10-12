import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  const [appVersion, setAppVersion] = useState('Loading…');

  useEffect(() => {
    let isMounted = true;

    window.liltwise.getAppInfo()
      .then((info) => {
        if (isMounted) setAppVersion(info.version);
      })
      .catch(() => {
        if (isMounted) setAppVersion('Unavailable');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="welcome-shell">
      <header className="app-header">
        <a aria-label="Liltwise" className="app-wordmark" href="#welcome">
          <span aria-hidden="true" className="app-mark">L</span>
          <span>liltwise</span>
        </a>
        <span className="app-version">DESKTOP PREVIEW · {appVersion}</span>
      </header>

      <section className="welcome-content" id="welcome">
        <div aria-hidden="true" className="welcome-illustration">
          <span className="illustration-sun" />
          <span className="illustration-card illustration-card-back" />
          <span className="illustration-card illustration-card-front">
            <i /><i /><i /><b />
          </span>
          <span className="illustration-star">✳</span>
        </div>
        <p className="welcome-eyebrow"><span /> YOUR AI CO-PRESENTER</p>
        <h1>Stay present.<br /><em>Never lose</em> your words.</h1>
        <p className="welcome-description">A calmer way to prepare for the moments when your words matter. We’re building the tools to help you feel ready, stay connected, and find your place again.</p>
        <div className="welcome-next"><span className="next-number">01</span><span><strong>First up: your floating script</strong><small>The teleprompter window is the next milestone.</small></span><span aria-hidden="true" className="next-arrow">↗</span></div>
      </section>

      <footer className="app-footer"><span>MADE FOR THE MOMENT</span><span>© Liltwise</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
