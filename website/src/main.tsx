import React from 'react';
import { createRoot } from 'react-dom/client';
import '@douyinfe/semi-ui/dist/css/semi.min.css';
import { GoConfigProvider, Go } from '@lynx-js/go-web';
import type { GoConfig } from '@lynx-js/go-web';
import './styles.css';

const goConfig: GoConfig = {
  exampleBasePath: '/examples',
  defaultTab: 'preview' as const,
};

interface CardConfig {
  title: string;
  description: string;
  example: string;
  entry: string;
  img?: string;
}

const cards: CardConfig[] = [
  {
    title: 'Editorial',
    description: 'Editorial layout engine',
    example: 'editorial',
    entry: 'main',
    img: '/examples/editorial/preview.mp4',
  },
  {
    title: 'ASCII Torus',
    description: '3D wireframe torus rendered in ASCII art',
    example: 'ascii-arts',
    entry: 'torus',
    img: '/examples/ascii-arts/preview-torus.mp4',
  },
  {
    title: 'ASCII Particles',
    description: 'Particle system rendered in ASCII art',
    example: 'ascii-arts',
    entry: 'particles',
    img: '/examples/ascii-arts/preview-particles.mp4',
  },
  {
    title: 'Dance',
    description: 'Text wrap around an animating character',
    example: 'dance',
    entry: 'main',
    img: '/examples/dance/preview.mp4',
  },
  {
    title: 'Dynamic Layout',
    description: 'Dynamic text layout with animations',
    example: 'dynamic-layout',
    entry: 'main',
    img: '/examples/dynamic-layout/preview.mp4',
  },
  {
    title: 'Bubbles',
    description: 'iMessage bubble',
    example: 'bubble',
    entry: 'main',
    img: '/examples/bubble/preview.mp4',
  },
];

function ExampleCard({ card }: { card: CardConfig }) {
  return (
    <div className="example-card">
      <div className="example-header">
        <h3 className="example-title">{card.title}</h3>
        <p className="example-description">{card.description}</p>
      </div>
      <div className="example-preview">
        <Go
          example={card.example}
          defaultEntryName={card.entry}
          img={card.img}
          mode="preview"
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <GoConfigProvider config={goConfig}>
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Lynx Pretext</p>
            <h1>Demos</h1>
          </div>
          <a
            className="github-link"
            href="https://github.com/Huxpro/lynx-pretext"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
          >
            <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </header>
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

        <div className="examples-grid">
          {cards.map((card) => (
            <ExampleCard key={`${card.example}-${card.entry}`} card={card} />
          ))}
        </div>
      </div>
    </GoConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
