// Cloud layers (noise-textured planes between 6,000 and 7,000 m) and wrap-around snow.
import * as THREE from 'three';

const WHITE = new THREE.Color('#ffffff');
const HSL = {};

const cloudVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const cloudFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uCoverage;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uOctaves;
varying vec3 vWorld;
float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { if (float(k) >= uOctaves) break; s += a * n(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
  vec2 p = vWorld.xz / 5200.0 + vec2(uTime * 0.006, uTime * 0.0025);
  float d = fbm(p + 0.6 * fbm(p * 0.7 - uTime * 0.003));
  float a = smoothstep(uCoverage, uCoverage + 0.28, d);
  float r = length(vWorld.xz - uCenter) / uRadius;
  a *= 1.0 - smoothstep(0.55, 1.0, r);                        // soft disc, no plane edges
  float dCam = abs(cameraPosition.y - vWorld.y);
  a *= smoothstep(60.0, 420.0, dCam);                         // fade when flying through
  a *= smoothstep(0.02, 0.18, abs(normalize(cameraPosition - vWorld).y)); // fade at grazing angles
  vec3 c = mix(uShade, uLit, smoothstep(0.35, 0.85, d));
  gl_FragColor = vec4(c, a * uOpacity);
}`;

export function createClouds({ lowEnd }) {
  const group = new THREE.Group();
  group.name = 'Clouds';
  const layers = [];
  for (const [y, cov, op] of [[6150, 0.6, 0.5], [6650, 0.66, 0.38], [7000, 0.7, 0.28]]) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      uniforms: {
        uTime: { value: 0 }, uOpacity: { value: op }, uCoverage: { value: cov },
        uLit: { value: new THREE.Color('#f4f1ec') }, uShade: { value: new THREE.Color('#8697ad') },
        uCenter: { value: new THREE.Vector2(0, 6000) }, uRadius: { value: 26000 },
        uOctaves: { value: lowEnd ? 3 : 5 },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(52000, 52000).rotateX(-Math.PI / 2), mat);
    mesh.position.set(0, y, 6000);
    mesh.renderOrder = 5;
    mesh.userData.baseOpacity = op;
    group.add(mesh);
    layers.push(mesh);
    if (lowEnd && layers.length === 2) break;
  }
  let amount = 1;
  return {
    group,
    setAmount(v, sunColor) {
      amount = v;
      for (const l of layers) {
        l.material.uniforms.uOpacity.value = l.userData.baseOpacity * v;
        if (sunColor) {
          l.material.uniforms.uLit.value.copy(sunColor).lerp(WHITE, 0.45 * sunColor.getHSL(HSL).l);
          l.material.uniforms.uShade.value.copy(l.material.uniforms.uLit.value).multiplyScalar(0.58);
        }
      }
      group.visible = v > 0.01;
    },
    update(t) { if (amount > 0.01) for (const l of layers) l.material.uniforms.uTime.value = t; },
  };
}

const snowVert = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec2 uWind;
uniform float uSize;
uniform float uPixelRatio;
varying float vFade;
void main() {
  vec3 p = aSeed * uBox;
  float speed = 9.0 + aSeed.x * 7.0;
  p.y -= uTime * speed;
  p.xz += uWind * uTime * (0.7 + aSeed.z * 0.6);
  p.x += sin(uTime * 0.9 + aSeed.y * 40.0) * 3.0;
  p = mod(p - uCam, uBox) - uBox * 0.5 + uCam;     // wrap around the camera
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vFade = smoothstep(4.0, 16.0, d) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, d));
  gl_PointSize = uSize * uPixelRatio * (0.6 + aSeed.y) * (220.0 / max(d, 1.0));
}`;
const snowFrag = /* glsl */ `
uniform float uIntensity;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(c));
  gl_FragColor = vec4(vec3(0.93, 0.96, 1.0), a * vFade * uIntensity);
}`;

export function createSnow({ count, pixelRatio }) {
  const geom = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geom.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: snowVert,
    fragmentShader: snowFrag,
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(260, 200, 260) },
      uWind: { value: new THREE.Vector2(14, -4) }, uSize: { value: 2.2 }, uPixelRatio: { value: pixelRatio }, uIntensity: { value: 0 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  points.visible = false;
  return {
    points,
    setIntensity(v, wind = 14) {
      mat.uniforms.uIntensity.value = v;
      mat.uniforms.uWind.value.set(wind, -wind * 0.3);
      points.visible = v > 0.01;
    },
    update(t, camera) {
      if (!points.visible) return;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCam.value.copy(camera.position);
    },
  };
}
