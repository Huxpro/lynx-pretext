import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@douyinfe/semi-ui/dist/css/semi.min.css';
import { GoConfigProvider, Go } from '@lynx-js/go-web';
import type { GoConfig } from '@lynx-js/go-web';
import './styles.css';

// Injected at build time by rsbuild.config.ts
const entryNames: string[] = import.meta.env.ENTRY_NAMES;

const goConfig: GoConfig = {
  exampleBasePath: '/examples',
  defaultTab: 'preview' as const,
};

function App() {
  const hashName = location.hash.slice(1);
  const [active, setActive] = useState(
    entryNames.includes(hashName) ? hashName : entryNames[0] || '',
  );

  function switchTo(name: string) {
    setActive(name);
    history.replaceState(null, '', `#${name}`);
  }

  return (
    <GoConfigProvider config={goConfig}>
      <div className="page">
        <p className="eyebrow">Lynx Pretext</p>
        <h1>Demos</h1>
        <p className="intro">
          Lynx ports of the{' '}
          <a
            href="https://chenglou.me/pretext/"
            target="_blank"
            rel="noreferrer"
          >
            Pretext
          </a>{' '}
          layout demos. These run natively on Lynx via{' '}
          <code>getTextInfo()</code> — scan the QR code on a Lynx-enabled device
          to see them live.
        </p>

        <div className="tab-bar">
          {entryNames.map((name) => (
            <button
              key={name}
              className={`tab ${name === active ? 'active' : ''}`}
              onClick={() => switchTo(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="embed-section">
          <Go
            key={active}
            example="lynx-pretext"
            defaultEntryName={active}
            mode="preview"
          />
        </div>
      </div>
    </GoConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
