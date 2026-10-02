// Master GSAP timeline scrubbed by ScrollTrigger over #scroll-track (Lenis smooth
// scroll). Timeline progress drives the camera (via the rig) and every scene effect:
// sun, fog, storm, snow, clouds, plinth, contours, route reveal, camps, summit flag.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { CHAPTERS, chapterAt, arrivalProgress } from './chapters.js';

gsap.registerPlugin(ScrollTrigger);

// fx is the single source of truth the render loop reads every frame.
export const fx = {
  p: 0,
  sunEl: 3, sunAz: 100,
  haze: 1, storm: 0, snow: 0, clouds: 0.35,
  plinth: 1, contour: 0,
  abruzzi: 4800, cesen: 4800, cesenIntensity: 0.45,
  camps: 0, flag: 0,
};

export function createStory({ onChapter }) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  tl.to(fx, { p: 1, duration: 1 }, 0);
  // Sun: low amber dawn → high white midday → warm again at the summit.
  // Day 1: dawn on the Baltoro → afternoon on the Abruzzi. Night: the summit push through the
  // Bottleneck (blue hour). Day 2: sunrise on the summit.
  const sun = [[0, 3, 100], [0.1, 6, 104], [0.28, 18, 125], [0.45, 34, 150], [0.62, 22, 228], [0.69, -1.6, 268], [0.79, -1.6, 70], [0.86, 5, 92], [1, 12, 108]];
  for (let k = 1; k < sun.length; k++) {
    const [t0] = sun[k - 1];
    const [t1, el, az] = sun[k];
    tl.to(fx, { sunEl: el, sunAz: az, duration: t1 - t0, ease: 'sine.inOut' }, t0);
  }
  tl.to(fx, { plinth: 0, duration: 0.07 }, 0.09)
    .to(fx, { clouds: 1, duration: 0.12 }, 0.1)
    .to(fx, { contour: 0.55, duration: 0.06 }, 0.31)
    .to(fx, { contour: 0.75, duration: 0.05 }, 0.46)
    .to(fx, { contour: 0, duration: 0.05 }, 0.64)
    // routes climb with the Climb chapter; Cesen shown dimmer for context
    .to(fx, { abruzzi: 8700, duration: 0.15, ease: 'power1.inOut' }, 0.47)
    .to(fx, { cesen: 8700, duration: 0.15, ease: 'power1.inOut' }, 0.49)
    .to(fx, { camps: 1, duration: 0.04, ease: 'none' }, 0.31)
    .to(fx, { camps: 6, duration: 0.14, ease: 'none' }, 0.47)
    // the Bottleneck: storm, heavy spindrift, thicker haze
    .to(fx, { storm: 0.55, snow: 1, haze: 1.6, clouds: 1.15, duration: 0.06, ease: 'sine.inOut' }, 0.66)
    .to(fx, { storm: 0.12, snow: 0.35, haze: 0.8, clouds: 0.85, duration: 0.06, ease: 'sine.inOut' }, 0.8)
    .to(fx, { flag: 1, duration: 0.04, ease: 'back.out(2)' }, 0.86)
    .to(fx, { snow: 0.12, duration: 0.1 }, 0.9);

  const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, syncTouch: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  const track = document.getElementById('scroll-track');
  const st = ScrollTrigger.create({
    trigger: track,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.6,
    animation: tl,
  });

  let chapter = -1;
  function syncChapter() {
    const i = chapterAt(fx.p);
    if (i !== chapter) {
      chapter = i;
      onChapter(i, CHAPTERS[i]);
    }
    return chapter;
  }
  tl.eventCallback('onUpdate', syncChapter);
  syncChapter();

  function scrollForProgress(p) {
    return st.start + (st.end - st.start) * p;
  }

  function jumpTo(i, { immediate = false } = {}) {
    lenis.scrollTo(scrollForProgress(arrivalProgress(i)), { immediate, duration: immediate ? 0 : 2.2, lock: false });
  }

  // Deterministic seek for tests, stills and the screen recording.
  function seek(p) {
    lenis.scrollTo(scrollForProgress(p), { immediate: true, force: true });
    tl.progress(p);
    st.update?.();
    syncChapter();
  }

  // nav dots + in-page anchors
  document.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    jumpTo(Number(a.dataset.jump));
  }));

  return { tl, st, lenis, jumpTo, seek, get chapter() { return chapter; } };
}
