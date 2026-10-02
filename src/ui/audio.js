// Ambient sound synthesised with the Web Audio API — no audio files.
//   wind:  looping brown noise → low-pass, slow LFO "gusts"
//   storm: band-passed noise with heavier, irregular gusts (Bottleneck / winter)
//   tick:  a short filtered click for UI buttons
// Off by default; the sound toggle creates the AudioContext on the first user gesture.
let ctx = null;
let master, windGain, stormGain;
let enabled = false;
let mix = { wind: 1, storm: 0 };

function brownNoise(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    // crossfade the ends so the loop is seamless
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = d[i] * t + d[len - fade + i] * (1 - t);
    }
  }
  return buf;
}

function lfo(freq, depth, target) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = freq;
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  return o;
}

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  const noise = brownNoise(6);

  // wind
  const w = ctx.createBufferSource(); w.buffer = noise; w.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
  windGain = ctx.createGain(); windGain.gain.value = 0.35;
  w.connect(wf).connect(windGain).connect(master);
  lfo(0.07, 160, wf.frequency);
  lfo(0.11, 0.12, windGain.gain);
  w.start();

  // storm
  const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = 1.35;
  const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 700; sf.Q.value = 0.8;
  const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2400; shelf.gain.value = 5;
  stormGain = ctx.createGain(); stormGain.gain.value = 0;
  s.connect(sf).connect(shelf).connect(stormGain).connect(master);
  lfo(0.23, 380, sf.frequency);
  lfo(0.31, 0.18, stormGain.gain);
  s.start();
  applyMix();
}

function applyMix() {
  if (!ctx) return;
  const t = ctx.currentTime;
  windGain.gain.setTargetAtTime(0.32 * mix.wind, t, 1.2);
  stormGain.gain.setTargetAtTime(0.5 * mix.storm, t, 1.2);
}

export function setAmbience(wind, storm) {
  mix = { wind, storm };
  applyMix();
}

export function tick() {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.setValueAtTime(1900, t);
  o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
  f.type = 'highpass'; f.frequency.value = 500;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(f).connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.08);
}

export function initSound(button) {
  const label = () => button.setAttribute('aria-label', enabled ? 'Sound on. Turn ambient sound off' : 'Sound off. Turn ambient sound on');
  button.addEventListener('click', async () => {
    enabled = !enabled;
    if (enabled && !ctx) build();
    if (ctx?.state === 'suspended') await ctx.resume();
    master?.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.4);
    button.setAttribute('aria-pressed', String(enabled));
    label();
    tick();
  });
  // soft click on every button/chip press while sound is on
  document.addEventListener('click', (e) => {
    if (e.target.closest('button, .btn, .chip') && e.target.closest('#sound-toggle') === null) tick();
  });
  label();
}
