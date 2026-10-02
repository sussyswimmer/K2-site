// WebGL mode: builds the scene, runs the render loop and exposes a small API to the UI.
// Loaded with a dynamic import so the static / no-WebGL page never downloads three.js.
import * as THREE from 'three';
import { loadHeightmap } from './heightmap.js';
import { loadWorld, terrainUniforms } from './terrain.js';
import { createEnvironment } from './environment.js';
import { createRoutes } from './routes.js';
import { createClouds, createSnow } from './atmosphere.js';
import { createMarkers } from './markers.js';
import { createHotspots } from './hotspots.js';
import { buildRails } from '../scroll/rails.js';
import { createRig, updateNearFar, CLEARANCE } from '../scroll/rig.js';
import { createStory, fx } from '../scroll/story.js';
import { CHAPTERS } from '../scroll/chapters.js';
import { createAltimeter } from '../ui/altimeter.js';
import { setAmbience } from '../ui/audio.js';

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const NIGHT_CLOUD = new THREE.Color('#2a3a55');
const cloudLit = new THREE.Color();

export async function startWorld({ caps, sidepanel, onProgress, onChapter }) {
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    // No reversed depth: the Sky addon pins itself to the far plane (z = w), which a
    // reversed buffer turns into the near plane. A dynamic near plane does the job.
  });
  const maxDPR = caps.mobile ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDPR) * (caps.lowEnd && !caps.mobile ? 0.85 : 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = !caps.lowEnd;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 5, 140000);

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / Math.max(total, 1));

  const [heightmap, world] = await Promise.all([loadHeightmap(), loadWorld({ manager, lowEnd: caps.lowEnd, renderer })]);

  const env = createEnvironment(scene, { shadows: !caps.lowEnd });
  scene.add(world.terrainRoot);
  scene.add(world.plinth, world.slab);
  const routes = createRoutes(world.routes);
  scene.add(routes.group);
  const markers = createMarkers({ hotspots: world.hotspots, props: world.props });
  scene.add(markers.group);
  const clouds = createClouds({ lowEnd: caps.lowEnd });
  scene.add(clouds.group);
  const snow = createSnow({ count: caps.lowEnd ? 1500 : 3000, pixelRatio: renderer.getPixelRatio() });
  scene.add(snow.points);
  const labelsEl = document.getElementById('labels');
  const hotspots = createHotspots({
    hotspots: world.hotspots, container: labelsEl, heightmap,
    onSelect: (id, label) => sidepanel.open(id, label),
  });
  scene.add(hotspots.group);

  const rails = buildRails(world.cams);
  const rig = createRig({ camera, rails, heightmap });
  const altimeter = createAltimeter();

  // ---- state that widgets / explore mode can override ----
  const layers = { routes: true, contours: false, labels: true, section: false, plinth: false };
  let exploring = false;
  let controls = null;
  let override = null;        // { pos, look } camera target set by a widget
  const overrideCur = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let routeFocus = null;      // 'abruzzi' | 'cesen' | null
  let focusStart = 0;
  let weather = null;         // { snowBoost, storm, snow } from the weather simulator

  const story = createStory({
    onChapter: (i, ch) => {
      if (!exploring) hotspots.show(ch.hotspots);
      onChapter(i, ch);
    },
  });

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.75 ? 60 : camera.aspect < 1.2 ? 50 : 42;
    camera.updateProjectionMatrix();
    hotspots.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- per-frame application of the timeline state ----
  const video = document.getElementById('intro-video');
  let lastSun = '';
  function applyFx() {
    const sunKey = `${fx.sunEl.toFixed(2)}|${fx.sunAz.toFixed(2)}`;
    env.state.haze = fx.haze;
    env.state.storm = Math.max(fx.storm, weather?.storm ?? 0);
    if (sunKey !== lastSun || weather) { env.setSun(fx.sunEl, fx.sunAz); lastSun = sunKey; }
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.35, 0.95, env.state.day);
    cloudLit.copy(NIGHT_CLOUD).lerp(env.sun.color, env.state.day);
    clouds.setAmount(fx.clouds * (1 + 0.4 * (weather?.storm ?? 0)), cloudLit);
    const snowAmt = Math.max(fx.snow, weather?.snow ?? 0) * (caps.lowEnd ? 0.8 : 1);
    snow.setIntensity(snowAmt, 10 + 40 * env.state.storm);
    terrainUniforms.uSnowBoost.value = weather?.snowBoost ?? 0;
    terrainUniforms.uContour.value = layers.contours ? 0.85 : exploring ? 0 : fx.contour;
    const plinthO = exploring ? (layers.plinth ? 1 : 0) : fx.plinth;
    world.plinth.visible = plinthO > 0.01;
    world.plinth.traverse((o) => { if (o.material) o.material.opacity = o.isLineSegments || o.isLine ? 0.6 * plinthO : plinthO; });
    world.slab.visible = exploring && layers.section;
    // routes
    const fullAll = exploring || routeFocus;
    const aR = fullAll ? 8700 : fx.abruzzi;
    const cR = fullAll ? 8700 : fx.cesen;
    const aI = routeFocus ? (routeFocus === 'abruzzi' ? 1.25 : 0.18) : 1;
    const cI = routeFocus ? (routeFocus === 'cesen' ? 1.25 : 0.18) : fx.cesenIntensity;
    routes.set('abruzzi', { reveal: aR, intensity: layers.routes ? aI : 0 });
    routes.set('cesen', { reveal: cR, intensity: layers.routes ? cI : 0 });
    // camps light up one by one with the Climb; Cesen camps follow the cesen line.
    // With a route focused (Route Explorer) that route's camps pop in in order.
    const age = routeFocus ? t - focusStart : 0;
    const pop = (k) => clamp01(age * 2.2 - k * 0.35);
    markers.order.slice(0, 6).forEach((id, k) => {
      let a;
      if (routeFocus === 'abruzzi') a = pop(k);
      else if (routeFocus === 'cesen') a = id === 'base-camp' ? 1 : id === 'camp-4' ? pop(4) : 0;
      else a = exploring ? 1 : clamp01(fx.camps - k);
      markers.setCamp(id, a);
    });
    [['cesen-c1', 5950], ['cesen-c2', 6400], ['cesen-c3', 7000]].forEach(([id, z], j) => {
      const a = routeFocus === 'cesen' ? pop(j + 1) : routeFocus === 'abruzzi' ? 0 : clamp01((cR - z) / 220);
      markers.setCamp(id, a);
    });
    markers.setFlag(Math.max(fx.flag, exploring ? 1 : 0));
    // intro video fades into the live scene
    const vo = exploring ? 0 : 1 - THREE.MathUtils.smoothstep(fx.p, 0.03, 0.09);
    video.style.opacity = vo.toFixed(3);
    if (vo <= 0.001 && !video.paused) video.pause();
    setAmbience(1, Math.max(fx.storm * 1.6, weather?.storm ?? 0));
  }

  // ---- explore mode ----
  const bar = document.getElementById('explore-bar');
  const toggleBtn = document.getElementById('explore-toggle');
  async function enterExplore() {
    if (exploring) return;
    if (!controls) {
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 250;
      controls.maxDistance = 45000;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.zoomSpeed = 1.2;
    }
    exploring = true;
    controls.target.copy(rig.look);
    controls.enabled = true;
    controls.update();
    story.lenis.stop();
    document.documentElement.classList.add('is-exploring');
    canvas.style.pointerEvents = 'auto';
    canvas.style.zIndex = '6';
    bar.hidden = false;
    toggleBtn.setAttribute('aria-pressed', 'true');
    toggleBtn.textContent = 'Back to the story';
    hotspots.show([], true);
    bar.querySelector('button')?.focus();
  }
  function exitExplore() {
    if (!exploring) return;
    exploring = false;
    controls.enabled = false;
    rig.blendFrom(camera.position, controls.target, 1.0);
    story.lenis.start();
    document.documentElement.classList.remove('is-exploring');
    canvas.style.pointerEvents = '';
    canvas.style.zIndex = '';
    bar.hidden = true;
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.textContent = 'Explore freely';
    hotspots.show(CHAPTERS[story.chapter].hotspots);
    toggleBtn.focus();
  }
  toggleBtn.addEventListener('click', () => (exploring ? exitExplore() : enterExplore()));
  document.querySelectorAll('[data-action="explore"]').forEach((b) => b.addEventListener('click', enterExplore));
  document.getElementById('explore-exit').addEventListener('click', exitExplore);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && exploring && !sidepanel.isOpen) exitExplore(); });
  bar.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.layer;
    layers[k] = !layers[k];
    b.setAttribute('aria-pressed', String(layers[k]));
    if (k === 'labels') labelsEl.classList.toggle('labels-off', !layers.labels);
  }));

  // ---- render loop ----
  const timer = new THREE.Timer();
  timer.connect(document);
  let t = 0;
  let lastP = -1;
  let still = 0;
  let frame = 0;
  let wasBlending = false;
  let frozen = false;
  let renderedOnce = false;
  function tick() {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    t += dt;
    frame++;
    const moving = exploring || override || Math.abs(fx.p - lastP) > 1e-6 || wasBlending;
    still = moving ? 0 : still + 1;
    lastP = fx.p;
    // When nothing moves, keep the ambient animation alive at ~20 fps to save power.
    if (still > 90 && frame % 3 !== 0) return;
    applyFx();
    let focus;
    if (exploring) {
      controls.update();
      const h = heightmap.heightAt(camera.position.x, camera.position.z) + 60;
      if (camera.position.y < h) camera.position.y = h;
      focus = controls.target;
    } else if (override) {
      const k = 1 - Math.exp(-dt * 2.4);
      overrideCur.pos.lerp(override.pos, k);
      overrideCur.look.lerp(override.look, k);
      const h = heightmap.heightAt(overrideCur.pos.x, overrideCur.pos.z) + CLEARANCE;
      if (overrideCur.pos.y < h) overrideCur.pos.y = h;
      camera.position.copy(overrideCur.pos);
      camera.lookAt(overrideCur.look);
      focus = overrideCur.look;
    } else {
      focus = rig.update(fx.p, dt);
    }
    wasBlending = false;
    // While the intro video still covers the screen the 3D frame is invisible: skip it.
    const covered = !exploring && !override && fx.p < 0.028;
    if (covered && renderedOnce) { altimeter.update(camera.position.y); return; }
    renderedOnce = true;
    updateNearFar(camera, heightmap);
    env.update(camera, focus, dt);
    clouds.update(t);
    snow.update(t, camera);
    routes.update(t);
    markers.update(t);
    renderer.render(scene, camera);
    hotspots.render(scene, camera, t);
    altimeter.update(camera.position.y);
  }

  // Compile shaders off the main thread where supported, then start.
  rig.update(0, 0);
  applyFx();
  // Warm up in small slices so no single task blocks the page: upload textures one at a
  // time, then compile shaders object by object (async where KHR_parallel_shader_compile exists).
  const yieldTask = () => new Promise((r) => setTimeout(r, 0));
  const textures = new Set([terrainUniforms.uCoreMap.value]);
  scene.traverse((o) => {
    for (const mat of [].concat(o.material || [])) {
      for (const k of ['map', 'normalMap', 'aoMap', 'emissiveMap', 'roughnessMap', 'metalnessMap']) if (mat[k]) textures.add(mat[k]);
    }
  });
  for (const tex of textures) { if (tex) renderer.initTexture(tex); await yieldTask(); }
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
  for (const child of [...scene.children]) {
    if (parallel) await renderer.compileAsync(child, camera, scene).catch(() => {});
    else renderer.compile(child, camera, scene);
    await yieldTask();
  }
  renderer.setAnimationLoop(tick);
  document.addEventListener('visibilitychange', () => {
    if (frozen) return;
    renderer.setAnimationLoop(document.hidden ? null : tick);
    timer.reset?.();
  });

  // ---- API for widgets, tests and the recording ----
  const api = {
    mode: 'webgl',
    camera,
    story,
    focusRoute(key) { if (key !== routeFocus) focusStart = t; routeFocus = key; },
    flyTo(pos, look) {
      if (!override) { overrideCur.pos.copy(camera.position); overrideCur.look.copy(rig.look); }
      override = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) };
    },
    flyToHotspot(id, dist = 3200) {
      const h = world.hotspots.find((x) => x.id === id);
      if (!h) return false;
      const dir = new THREE.Vector3(0.55, 0.45, 0.7).normalize();
      api.flyTo(h.position.clone().addScaledVector(dir, dist).toArray(), h.position.toArray());
      return true;
    },
    releaseCamera() {
      if (!override) return;
      rig.blendFrom(camera.position, overrideCur.look, 1.0);
      override = null;
      wasBlending = true;
    },
    setWeather(w) { weather = w; },
    hotspotIds: world.hotspots.map((h) => h.id),
    seek(p) {
      story.seek(p);
      rig.snap();
      lastP = -1;
      still = 0;
      tick();
    },
    // Stop the render loop (tests / frame-by-frame recording render once per seek).
    freeze(on = true) {
      frozen = on;
      renderer.setAnimationLoop(on ? null : tick);
    },
    state() {
      const ground = heightmap.heightAt(camera.position.x, camera.position.z);
      return {
        p: fx.p, chapter: story.chapter,
        camera: camera.position.toArray().map((v) => Math.round(v)),
        clearance: Math.round(camera.position.y - ground),
        altimeterText: document.getElementById('alt-primary').textContent,
      };
    },
    heightAt: heightmap.heightAt,
    renderer,
    debug: { scene, env, clouds, snow, routes, markers, world, terrainUniforms },
  };
  return api;
}
