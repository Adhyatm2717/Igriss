import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const query = new URLSearchParams(window.location.search);
const notchWidth = Number(query.get('notchWidth')) || 200;
const expandedWidth = Number(query.get('expandedWidth')) || 480;
const expandedHeight = Number(query.get('expandedHeight')) || 240;
const menuBarHeight = Number(query.get('menuBarHeight')) || 24;
const transitionDuration = Number(query.get('transitionDuration')) || 200;
const shapePath = query.get('shapePath') || '';

function App() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [contentVisible, setContentVisible] = React.useState(false);
  const collapsePending = React.useRef(false);
  const style = {
    '--notch-width': `${notchWidth}px`,
    '--expanded-width': `${expandedWidth}px`,
    '--expanded-height': `${expandedHeight}px`,
    '--menu-bar-height': `${menuBarHeight}px`,
    '--transition-duration': `${transitionDuration}ms`
  };

  React.useEffect(() => {
    const notchApi = window.igriss?.notch;
    if (!notchApi) return undefined;

    const stopOpen = notchApi.onOpen(() => {
      collapsePending.current = false;
      setIsOpen(true);
    });
    const stopClose = notchApi.onClose(() => {
      collapsePending.current = true;
      setContentVisible(false);
      setIsOpen(false);
    });

    return () => {
      stopOpen();
      stopClose();
    };
  }, []);

  function handleTransitionEnd(event) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return;

    if (isOpen) {
      setContentVisible(true);
    } else if (collapsePending.current) {
      collapsePending.current = false;
      window.igriss?.notch.collapseComplete();
    }
  }

  return (
    <main className="window-root" style={style}>
      <svg
        className={`notch-shape ${isOpen ? 'open' : ''}`}
        viewBox={`0 0 ${expandedWidth} ${expandedHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        onTransitionEnd={handleTransitionEnd}
      >
        <path d={shapePath} fill="#000" />
      </svg>
      {contentVisible ? <section className="notch-content" /> : null}
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
