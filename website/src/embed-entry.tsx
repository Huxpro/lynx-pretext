/**
 * Embed entry point — renders inside the iframe created by the embed API.
 * Mirrors go-web/example/src/embed-entry.tsx.
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@douyinfe/semi-ui/dist/css/semi.min.css';
import { GoConfigProvider, Go } from '@lynx-js/go-web';
import type { GoConfig } from '@lynx-js/go-web';
import './styles.css';

type EmbedOptions = {
  example: string;
  defaultFile?: string;
  defaultTab?: 'preview' | 'web' | 'qrcode';
  img?: string;
  defaultEntryFile?: string;
  highlight?: string;
  entry?: string | string[];
  seamless?: boolean;
  exampleBasePath?: string;
};

function EmbedApp() {
  const [options, setOptions] = useState<EmbedOptions | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; options?: EmbedOptions };
      if (data?.type === 'go-embed:init' && data.options) {
        setOptions(data.options);
      }
      if (data?.type === 'go-embed:update' && data.options) {
        setOptions((prev) => (prev ? { ...prev, ...data.options } : null));
      }
    };

    window.addEventListener('message', handleMessage);
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'go-embed:ready' }, '*');
    }
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!options) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#999',
          fontFamily: 'sans-serif',
        }}
      >
        Loading...
      </div>
    );
  }

  const goConfig: GoConfig = {
    exampleBasePath: options.exampleBasePath || '/examples',
  };

  return (
    <GoConfigProvider config={goConfig}>
      <div style={{ height: '100%', overflow: 'hidden' }}>
        <Go
          key={`${options.exampleBasePath}/${options.example}`}
          example={options.example}
          defaultFile={options.defaultFile}
          defaultTab={options.defaultTab}
          img={options.img}
          defaultEntryFile={options.defaultEntryFile}
          highlight={options.highlight}
          entry={options.entry}
        />
      </div>
    </GoConfigProvider>
  );
}

createRoot(document.getElementById('embed-root')!).render(<EmbedApp />);
