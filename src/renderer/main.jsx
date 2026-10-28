import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  const [expanded, setExpanded] = React.useState(false);

  function expand() {
    setExpanded(true);
    window.igriss.notch.setExpanded(true);
  }

  function collapse() {
    setExpanded(false);
    window.igriss.notch.setExpanded(false);
  }

  return (
    <main
      className={`notch ${expanded ? 'notch-expanded' : ''}`}
      onMouseEnter={expand}
      onMouseLeave={collapse}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
