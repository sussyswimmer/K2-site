// Device / mode detection. The render mode itself is decided by the inline script in
// index.html (so the static layout never flashes); this module reads it back and adds
// the performance tier.
export function detectCaps() {
  const root = document.documentElement;
  const q = new URLSearchParams(location.search);
  const mobile = matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 8;
  const lowEnd = q.has('high') ? false : (q.has('low') || mobile || cores <= 4);
  return {
    mode: root.classList.contains('mode-webgl') ? 'webgl' : root.classList.contains('mode-reduced') ? 'reduced' : 'nowebgl',
    webgl: root.classList.contains('mode-webgl'),
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('reduced'),
    mobile,
    lowEnd,
    debug: q.has('debug'),
  };
}
