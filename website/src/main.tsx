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
