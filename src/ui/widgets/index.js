// Widget registry. Each widget module exports mount(el, ctx) → optional cleanup fn.
// ctx.mode is 'webgl' (inside the drawer, with scene controls) or 'static' (inline).
export const WIDGETS = {
  packer: { label: 'Pack for the expedition', load: () => import('./packer.js') },
  timeline: { label: 'K2 through time', load: () => import('./timeline.js') },
  routes: { label: 'Route explorer', load: () => import('./routeExplorer.js') },
  oxygen: { label: 'Breathe at altitude', load: () => import('./oxygen.js') },
  weather: { label: 'The summit window', load: () => import('./weather.js') },
  compare: { label: 'Everest vs K2', load: () => import('./compare.js') },
  quiz: { label: 'Quiz', load: () => import('./quiz.js') },
};

export async function mountWidget(name, el, ctx) {
  const w = WIDGETS[name];
  if (!w) return null;
  const mod = await w.load();
  el.dataset.widgetName = name;
  return mod.mount(el, ctx);
}

// Scene API stand-in for the static page (no 3D).
export const STATIC_CTX = {
  mode: 'static',
  focusRoute() {}, flyTo() {}, flyToHotspot() { return false; }, releaseCamera() {}, setWeather() {},
};
