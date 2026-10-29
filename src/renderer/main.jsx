import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const query = new URLSearchParams(window.location.search);
const collapsedWidth = Number(query.get('collapsedWidth')) || 200;
const collapsedHeight = Number(query.get('collapsedHeight')) || 24;
const expandedWidth = Number(query.get('expandedWidth')) || 480;
const expandedHeight = Number(query.get('expandedHeight')) || 240;
const notchRadius = Number(query.get('notchRadius')) || 14;
const pillRadius = Number(query.get('pillRadius')) || 6;
const expandedRadius = Number(query.get('expandedRadius')) || 20;
const hasNotch = query.get('hasNotch') !== 'false';
const transitionDuration = Number(query.get('transitionDuration')) || 200;

function App() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [contentVisible, setContentVisible] = React.useState(false);
  const collapsePending = React.useRef(false);
  const rootStyle = {
    '--collapsed-width': `${collapsedWidth}px`,
    '--collapsed-height': `${collapsedHeight}px`,
    '--expanded-width': `${expandedWidth}px`,
    '--expanded-height': `${expandedHeight}px`,
    '--notch-radius': `${notchRadius}px`,
    '--pill-radius': `${pillRadius}px`,
    '--expanded-radius': `${expandedRadius}px`,
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
      setIsOpen(false);
    });
    return () => {
      stopOpen();
      stopClose();
    };
  }, []);

  React.useEffect(() => {
    if (!isOpen && !contentVisible && collapsePending.current) {
      collapsePending.current = false;
      window.igriss?.notch.collapseComplete();
    }
  }, [isOpen, contentVisible]);

  function handleTransitionEnd(event) {
    if (event.target !== event.currentTarget || event.propertyName !== 'height') return;

    if (isOpen) {
      setContentVisible(true);
    } else {
      setContentVisible(false);
    }
  }

  return (
    <main className="window-root" style={rootStyle}>
      <div
        className={`notch ${hasNotch ? 'notched' : 'pill'} ${isOpen ? 'open' : ''}`}
        onTransitionEnd={handleTransitionEnd}
      >
        {contentVisible ? <section className="notch-content" /> : null}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
