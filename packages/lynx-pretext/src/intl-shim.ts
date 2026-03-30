// PrimJS (Lynx's JS engine) does not provide the Intl global.
// @formatjs/intl-segmenter polyfill assumes Intl exists.
// This shim must be imported before the polyfill.
if (typeof Intl === 'undefined') {
  ;(globalThis as any).Intl = {}
}
