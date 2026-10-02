// Chapter ranges (Debrief 3) and what each chapter shows. Progress p ∈ [0, 1] is the
// master timeline position, scrubbed by the #scroll-track.
export const CHAPTERS = [
  { id: 0, title: 'Intro', start: 0.0, end: 0.1, hotspots: [] },
  { id: 1, title: 'The Approach', start: 0.1, end: 0.28,
    hotspots: ['concordia', 'broad-peak', 'gasherbrum-i', 'gasherbrum-ii', 'gasherbrum-iv', 'summit'] },
  { id: 2, title: 'Base Camp', start: 0.28, end: 0.45, hotspots: ['base-camp', 'gilkey-memorial', 'abc', 'summit'] },
  { id: 3, title: 'The Climb', start: 0.45, end: 0.65,
    hotspots: ['base-camp', 'abc', 'camp-1', 'camp-2', 'camp-3', 'camp-4', 'summit'] },
  { id: 4, title: 'The Bottleneck', start: 0.65, end: 0.82, hotspots: ['camp-4', 'bottleneck', 'summit'] },
  { id: 5, title: 'Summit', start: 0.82, end: 1.0, hotspots: ['summit', 'broad-peak', 'gasherbrum-i', 'gasherbrum-ii', 'bottleneck'] },
];

// Fraction of each chapter spent travelling; the rest is a hold so the card can be read.
export const TRAVEL = 0.62;

export function chapterAt(p) {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) if (p >= CHAPTERS[i].start - 1e-6) return i;
  return 0;
}

// Scroll position (as progress) where a chapter has "arrived": used by nav dots.
export function arrivalProgress(i) {
  const c = CHAPTERS[i];
  return i === 0 ? 0 : c.start + (c.end - c.start) * (TRAVEL + 0.04);
}
