// Shared test corpus for accuracy validation.
// Covers Latin, CJK, mixed scripts, emoji, long words, short/single-line text.

export const TEXTS: readonly { label: string; text: string }[] = [
  // English
  { label: 'English short', text: 'Hello world, this is a simple test.' },
  { label: 'English medium', text: "Just tried the new update and it's so much better. The performance improvements are really noticeable, especially on older devices." },
  { label: 'English punctuation', text: "Performance is critical for this kind of library. If you can't measure hundreds of text blocks per frame, it's not useful for real applications." },
  { label: 'English hyphenation', text: 'One thing I noticed is that the line breaking algorithm handles most cases well. Is hyphenation on the roadmap?' },
  { label: 'English caching', text: 'The key insight is that you can cache word measurements separately from layout results. This gives you the best of both worlds.' },
  { label: 'English compat', text: "Does anyone know if this works with the latest version? I've been having some issues since the upgrade." },

  // CJK
  { label: 'Chinese', text: '\u8FD9\u662F\u4E00\u6BB5\u4E2D\u6587\u6587\u672C\uFF0C\u7528\u4E8E\u6D4B\u8BD5\u6587\u672C\u5E03\u5C40\u5E93\u5BF9\u4E2D\u65E5\u97E9\u5B57\u7B26\u7684\u652F\u6301\u3002\u6BCF\u4E2A\u5B57\u7B26\u4E4B\u95F4\u90FD\u53EF\u4EE5\u65AD\u884C\u3002' },
  { label: 'Chinese short', text: '\u6027\u80FD\u6D4B\u8BD5\u663E\u793A\uFF0C\u65B0\u7684\u6587\u672C\u6D4B\u91CF\u65B9\u6CD5\u6BD4\u4F20\u7EDF\u65B9\u6CD5\u5FEB\u4E86\u5C06\u8FD1\u4E00\u5343\u4E94\u767E\u500D\u3002' },
  { label: 'Japanese', text: '\u3053\u308C\u306F\u30C6\u30AD\u30B9\u30C8\u30EC\u30A4\u30A2\u30A6\u30C8\u30E9\u30A4\u30D6\u30E9\u30EA\u306E\u30C6\u30B9\u30C8\u3067\u3059\u3002\u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3092\u6B63\u3057\u304F\u51E6\u7406\u3067\u304D\u308B\u304B\u78BA\u8A8D\u3057\u307E\u3059\u3002' },
  { label: 'Korean', text: '\uC774\uAC83\uC740 \uD14D\uC2A4\uD2B8 \uB808\uC774\uC544\uC6C3 \uB77C\uC774\uBE0C\uB7EC\uB9AC\uC758 \uD14C\uC2A4\uD2B8\uC785\uB2C8\uB2E4. \uD55C\uAD6D\uC5B4 \uD14D\uC2A4\uD2B8\uB97C \uC62C\uBC14\uB974\uAC8C \uCC98\uB9AC\uD560 \uC218 \uC788\uB294\uC9C0 \uD655\uC778\uD569\uB2C8\uB2E4.' },

  // Emoji
  { label: 'Emoji mixed', text: 'The quick \uD83E\uDD8A jumped over the lazy \uD83D\uDC15 and then went home \uD83C\uDFE0 to rest \uD83D\uDE34 for the night.' },
  { label: 'Emoji dense', text: 'Great work! \uD83D\uDC4F\uD83D\uDC4F\uD83D\uDC4F This is exactly what we needed \uD83C\uDFAF for the project \uD83D\uDE80' },

  // Mixed scripts
  { label: 'Multi-script', text: 'Hello \u4F60\u597D \u3053\u3093\u306B\u3061\u306F \uC548\uB155\uD558\uC138\uC694 \u2014 a greeting in four scripts!' },
  { label: 'Mixed en+cn', text: 'The new \u6587\u672C\u5E03\u5C40 engine handles mixed scripts \u975E\u5E38\u597D and CJK characters \u5B8C\u7F8E\u5730.' },

  // Edge cases
  { label: 'Empty', text: '' },
  { label: 'Single char', text: 'A' },
  { label: 'Whitespace', text: '   ' },
  { label: 'Long word', text: 'Superlongwordwithoutanyspacesthatshouldjustoverflowthelineandkeepgoing' },
  { label: 'Short single-line', text: 'OK' },
  { label: 'Numbers and punctuation', text: 'Version 3.2.1 was released on January 15th, 2024 with $42.99 pricing.' },
]

export const WIDTHS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500] as const

export const FONT_SIZE = 16
export const LINE_HEIGHT = 20
