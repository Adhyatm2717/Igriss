import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const query = new URLSearchParams(window.location.search);
const panelWidth = Number(query.get('panelWidth')) || 404;
const panelShapeWidth = Number(query.get('panelShapeWidth')) || 415;
const panelHeight = Number(query.get('panelHeight')) || 123;
const notchHeight = Number(query.get('notchHeight')) || 32;
const centerZoneWidth = Number(query.get('centerZoneWidth')) || 220;
const expandDuration = Number(query.get('expandDuration')) || 250;
const collapseDuration = Number(query.get('collapseDuration')) || 200;
const contentFadeDuration = Number(query.get('contentFadeDuration')) || 100;
const notchShape = query.get('notchShape') || '';
const panelShape = query.get('panelShape') || '';

function tokenizePath(path) {
  return path.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) || [];
}

const notchTokens = tokenizePath(notchShape);
const panelTokens = tokenizePath(panelShape);

function interpolatePath(progress) {
  return notchTokens
    .map((startToken, index) => {
      const endToken = panelTokens[index];
      const start = Number(startToken);
      const end = Number(endToken);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return startToken;
      return String(Number((start + (end - start) * progress).toFixed(3)));
    })
    .join(' ');
}

function App() {
  const pathRef = React.useRef(null);
  const progressRef = React.useRef(0);
  const frameRef = React.useRef(null);
  const closeTimerRef = React.useRef(null);
  const closePendingRef = React.useRef(false);
  const [contentVisible, setContentVisible] = React.useState(false);
  const rootStyle = {
    '--panel-width': `${panelWidth}px`,
    '--panel-shape-width': `${panelShapeWidth}px`,
    '--panel-height': `${panelHeight}px`,
    '--notch-height': `${notchHeight}px`,
    '--center-zone-width': `${centerZoneWidth}px`,
    '--content-fade-duration': `${contentFadeDuration}ms`
  };

  React.useEffect(() => {
    const notchApi = window.igriss?.notch;
    if (!notchApi) return undefined;

    function animateTo(target, duration, ease, onComplete) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      const startProgress = progressRef.current;
      if (startProgress === target) {
        onComplete?.();
        return;
      }

      const startTime = performance.now();
      function tick(now) {
        const elapsed = Math.min(1, (now - startTime) / duration);
        const eased = ease(elapsed);
        const progress = startProgress + (target - startProgress) * eased;
        progressRef.current = progress;
        if (pathRef.current) pathRef.current.setAttribute('d', interpolatePath(progress));

        if (elapsed < 1) {
          frameRef.current = requestAnimationFrame(tick);
          return;
        }

        frameRef.current = null;
        progressRef.current = target;
        onComplete?.();
      }

      frameRef.current = requestAnimationFrame(tick);
    }

    const stopOpen = notchApi.onOpen(() => {
      closePendingRef.current = false;
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      const alreadyExpanded = progressRef.current === 1;
      if (alreadyExpanded) setContentVisible(true);
      animateTo(1, expandDuration, (time) => 1 - (1 - time) ** 2, () => {
        if (!closePendingRef.current) setContentVisible(true);
      });
    });

    const stopClose = notchApi.onClose(() => {
      closePendingRef.current = true;
      notchApi.releaseInputFocus();
      setContentVisible(false);

      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        if (!closePendingRef.current) return;

        animateTo(0, collapseDuration, (time) => time * time, () => {
          if (!closePendingRef.current) return;
          closePendingRef.current = false;
          notchApi.collapseComplete();
        });
      }, contentFadeDuration);
    });

    return () => {
      stopOpen();
      stopClose();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <main className="window-root" style={rootStyle}>
      <svg
        className="notch-shape"
        viewBox={`0 0 ${panelShapeWidth} ${panelHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path ref={pathRef} d={notchShape} fill="#000" />
      </svg>

    <section className={`panel-content ${contentVisible ? 'visible' : ''}`}>
        <header className="top-row">
          <div className="left-cluster">
            <span className="brand-label">Igriss</span>
          </div>
          <div className="hardware-clearance" aria-hidden="true" />
          <div className="right-cluster">
            <button className="icon-button" type="button" aria-label="Settings" title="Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
                <path d="m19.4 13.5 1.1.8-1.1 1.9-1.3-.5a7.8 7.8 0 0 1-1.5.9l-.2 1.4h-2.2l-.3-1.4a7.8 7.8 0 0 1-1.7 0l-.7 1.2-2-.9.4-1.4a7.8 7.8 0 0 1-1.1-1.4l-1.4.2-.6-2.1 1.3-.6a7.8 7.8 0 0 1 .1-1.7l-1.1-.8 1.1-1.9 1.3.5a7.8 7.8 0 0 1 1.5-.9l.2-1.4h2.2l.3 1.4a7.8 7.8 0 0 1 1.7 0l.7-1.2 2 .9-.4 1.4a7.8 7.8 0 0 1 1.1 1.4l1.4-.2.6 2.1-1.3.6a7.8 7.8 0 0 1-.1 1.7Z" />
              </svg>
            </button>
          </div>
        </header>

        <form className="composer" onSubmit={(event) => event.preventDefault()}>
          <input
            type="text"
            aria-label="Ask Igriss"
            placeholder="Ask Igriss…"
            onMouseDown={() => window.igriss?.notch.requestInputFocus()}
            onFocus={() => window.igriss?.notch.requestInputFocus()}
            onBlur={() => window.igriss?.notch.releaseInputFocus()}
          />
          <button className="send-button" type="submit" aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M12 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
