// Route tubes: an emissive core + an additive fresnel "glow" shell. Both are revealed
// bottom-up by elevation (uReveal), so the route appears to climb as you scroll, and
// a soft pulse travels up the line.
import * as THREE from 'three';

const vert = /* glsl */ `
uniform float uInflate;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  vec3 p = position + normal * uInflate;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uReveal;
uniform float uIntensity;
uniform float uTime;
uniform float uGlow;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  float edge = uReveal - vWorld.y;
  if (edge < 0.0) discard;
  float head = smoothstep(0.0, 140.0, edge);            // soft leading edge
  float pulse = 0.5 + 0.5 * sin(vWorld.y * 0.018 - uTime * 2.2);
  float f = abs(dot(normalize(vNormalW), normalize(vView)));
  float a;
  vec3 c;
  if (uGlow > 0.5) {
    a = pow(1.0 - f, 1.6) * 0.75 * uIntensity;
    c = uColor * (1.2 + 0.6 * pulse);
  } else {
    a = uIntensity;
    c = mix(uColor, vec3(1.0), 0.35 * pulse) * (1.4 + 0.4 * (1.0 - f));
  }
  gl_FragColor = vec4(c, a * mix(1.0, head, 0.85));
}`;

function routeMaterial(color, glow) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uReveal: { value: 0 },
      uIntensity: { value: 1 },
      uTime: { value: 0 },
      uGlow: { value: glow ? 1 : 0 },
      uInflate: { value: glow ? 16 : 0 },
    },
    transparent: true,
    depthWrite: !glow,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false,
  });
}

export function createRoutes(sources) {
  const group = new THREE.Group();
  group.name = 'Routes';
  const routes = {};
  for (const [key, color] of [['abruzzi', '#F2A541'], ['cesen', '#5CE1E6']]) {
    const g = new THREE.Group();
    g.name = `Route_${key}`;
    let geom = null;
    sources[key].traverse((o) => { if (o.isMesh && !geom) geom = o.geometry; });
    const core = new THREE.Mesh(geom, routeMaterial(color, false));
    const glow = new THREE.Mesh(geom, routeMaterial(color, true));
    core.renderOrder = 2;
    glow.renderOrder = 3;
    core.frustumCulled = glow.frustumCulled = false;
    g.add(core, glow);
    group.add(g);
    routes[key] = { group: g, core, glow, reveal: 0, intensity: 1 };
  }

  function set(key, { reveal, intensity } = {}) {
    const r = routes[key];
    if (reveal !== undefined) r.reveal = reveal;
    if (intensity !== undefined) r.intensity = intensity;
    for (const m of [r.core.material, r.glow.material]) {
      m.uniforms.uReveal.value = r.reveal;
      m.uniforms.uIntensity.value = r.intensity;
    }
    r.group.visible = r.reveal > 4800 && r.intensity > 0.01;
  }

  function update(t) {
    for (const r of Object.values(routes)) {
      r.core.material.uniforms.uTime.value = t;
      r.glow.material.uniforms.uTime.value = t;
    }
  }

  set('abruzzi', { reveal: 0 });
  set('cesen', { reveal: 0 });
  return { group, routes, set, update };
}
