// Sky, sun, hemisphere light and altitude-dependent fog.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const tmpColor = new THREE.Color();
const LOW_SUN = new THREE.Color('#ffb066');
const HIGH_SUN = new THREE.Color('#fff4e6');
const HAZE_DAWN = new THREE.Color('#c7b5a8');
const HAZE_DAY = new THREE.Color('#9db7d1');
const HAZE_STORM = new THREE.Color('#5d6f86');
const HAZE_NIGHT = new THREE.Color('#1c2a3f');
const NIGHT_SKY = new THREE.Color('#5f7fb5');
const DAY_SKY = new THREE.Color('#bfe3ff');
const NIGHT_GROUND = new THREE.Color('#141c28');
const DAY_GROUND = new THREE.Color('#4a3a2e');

export function createEnvironment(scene, { shadows }) {
  const sky = new Sky();
  sky.scale.setScalar(90000);
  const su = sky.material.uniforms;
  su.turbidity.value = 3;
  su.rayleigh.value = 1.4;
  su.mieCoefficient.value = 0.0025;
  su.mieDirectionalG.value = 0.74;
  su.cloudCoverage.value = 0.18;
  su.cloudDensity.value = 0.25;
  su.cloudScale.value = 0.00045;
  su.cloudElevation.value = 0.45;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight('#bfe3ff', '#4a3a2e', 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff4e6', 3.2);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -4500; s.right = 4500; s.top = 4500; s.bottom = -4500;
    s.near = 500; s.far = 60000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 25;
  }
  scene.add(sun, sun.target);

  scene.fog = new THREE.FogExp2(HAZE_DAY.clone(), 2.5e-5);

  const sunDir = new THREE.Vector3();
  const state = { elevation: 4, azimuth: 105, haze: 1, storm: 0, time: 0, day: 1 };

  function setSun(elevationDeg, azimuthDeg) {
    state.elevation = elevationDeg;
    state.azimuth = azimuthDeg;
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    // azimuth clockwise from north; three.js north is -z
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    su.sunPosition.value.copy(sunDir);
    const warm = THREE.MathUtils.smoothstep(elevationDeg, 2, 32);
    const day = THREE.MathUtils.smoothstep(elevationDeg, -4, 5);
    state.day = day;
    sun.color.copy(LOW_SUN).lerp(HIGH_SUN, warm);
    sun.intensity = THREE.MathUtils.lerp(2.3, 3.4, warm) * day * (1 - 0.55 * state.storm);
    hemi.intensity = THREE.MathUtils.lerp(0.42, THREE.MathUtils.lerp(0.78, 0.9, warm), day);
    hemi.color.copy(NIGHT_SKY).lerp(DAY_SKY, day);
    hemi.groundColor.copy(NIGHT_GROUND).lerp(DAY_GROUND, day);
    su.turbidity.value = THREE.MathUtils.lerp(4.5, 2.5, warm) + 6 * state.storm;
    su.rayleigh.value = THREE.MathUtils.lerp(2.4, 1.2, warm);
  }

  // Called every frame with the camera; keeps the sky centred, sets fog by altitude.
  function update(camera, focus, dt) {
    state.time += dt;
    su.time.value = state.time;
    sky.position.copy(camera.position);
    // Fog thick in the valleys, almost gone at the summit.
    const alt = camera.position.y;
    const k = THREE.MathUtils.clamp((alt - 4500) / (8800 - 4500), 0, 1);
    const base = THREE.MathUtils.lerp(3.2e-5, 0.35e-5, Math.pow(k, 0.8));
    scene.fog.density = base * state.haze * (1 + 3 * state.storm);
    const warm = THREE.MathUtils.smoothstep(state.elevation, 2, 30);
    tmpColor.copy(HAZE_DAWN).lerp(HAZE_DAY, warm).lerp(HAZE_STORM, state.storm).lerp(HAZE_NIGHT, 1 - state.day);
    scene.fog.color.copy(tmpColor);
    // sun + shadow frustum follow the focus point
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 30000);
    sun.target.updateMatrixWorld();
  }

  setSun(state.elevation, state.azimuth);
  return { sky, sun, hemi, state, setSun, update, sunDir };
}
