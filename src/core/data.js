// Cached JSON loading from public/data and public/models.
const cache = new Map();
const BASE = import.meta.env.BASE_URL;

export function asset(path) {
  return `${BASE}${path.replace(/^\//, '')}`;
}

export function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(asset(path)).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(path);
}

export const getFacts = () => getJSON('data/facts.json');
export const getTimeline = () => getJSON('data/timeline.json');
export const getRoutes = () => getJSON('data/routes.json');
export const getCompare = () => getJSON('data/everest_vs_k2.json');

// Hotspot ids in the GLB use either hyphens or underscores; the site uses hyphens.
export const normId = (id) => String(id).replace(/_/g, '-');
