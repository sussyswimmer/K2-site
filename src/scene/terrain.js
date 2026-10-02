// Loads the Debrief 1 GLBs and patches the terrain material:
//   - blends the 4.5 m/texel K2 close-up albedo over the global texture
//   - draws 500 m contour lines in the shader (no z-fighting, revealed by a uniform)
//   - adds close-range detail noise so the 18 m/texel texture doesn't look soft
//   - "snow boost" uniform used by the weather simulator for winter
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/addons/loaders/DRACOLoader.js';
import { asset, normId } from '../core/data.js';

export const terrainUniforms = {
  uCoreMap: { value: null },
  uCoreRect: { value: new THREE.Vector4(-4000, -3000, 9216, 600) }, // x0, z0, size, feather
  uContour: { value: 0 },
  uContourColor: { value: new THREE.Color('#cfe9ff') },
  uDetail: { value: 1 },
  uSnowBoost: { value: 0 },
  uBump: { value: 1 },
};

function patchTerrainMaterial(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, terrainUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vK2World;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvK2World = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vK2World;
uniform sampler2D uCoreMap;
uniform vec4 uCoreRect;
uniform float uContour;
uniform vec3 uContourColor;
uniform float uDetail;
uniform float uSnowBoost;
uniform float uBump;
float k2hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float k2noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(k2hash(i), k2hash(i + vec2(1, 0)), u.x), mix(k2hash(i + vec2(0, 1)), k2hash(i + vec2(1, 1)), u.x), u.y);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 cuv = (vK2World.xz - uCoreRect.xy) / uCoreRect.z;
  vec2 edge = min(cuv, 1.0 - cuv) * uCoreRect.z;
  float coreMask = clamp(min(edge.x, edge.y) / uCoreRect.w, 0.0, 1.0);
  if (coreMask > 0.0) {
    vec3 core = texture2D(uCoreMap, vec2(cuv.x, 1.0 - cuv.y)).rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, core, coreMask);
  }
  float dist = length(vK2World - cameraPosition);
  float dn = k2noise(vK2World.xz / 26.0) * 0.6 + k2noise(vK2World.xz / 7.5 + 17.0) * 0.4;
  diffuseColor.rgb *= 1.0 + (dn - 0.5) * 0.22 * uDetail * smoothstep(7000.0, 900.0, dist);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // Close-range bump: the DEM is 30 m data, so near the camera add procedural relief
  // (reads as ice flutings / rock texture) via screen-space derivatives.
  float bdist = length(vK2World - cameraPosition);
  float bf = uBump * smoothstep(3800.0, 350.0, bdist);
  if (bf > 0.001) {
    vec2 q = vK2World.xz;
    float hb = k2noise(q / 13.0) * 0.6 + k2noise(q / 4.1 + 9.0) * 0.3 + k2noise(q / 1.6 + 3.0) * 0.1;
    vec2 dHdxy = vec2(dFdx(hb), dFdy(hb)) * 2.2 * bf;
    vec3 vSigmaX = dFdx(-vViewPosition);
    vec3 vSigmaY = dFdy(-vViewPosition);
    vec3 R1 = cross(vSigmaY, normal);
    vec3 R2 = cross(normal, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDirection;
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    normal = normalize(abs(fDet) * normal - vGrad);
  }
}
if (uSnowBoost > 0.001) {
  vec3 k2wn = inverseTransformDirection(normal, viewMatrix);
  float k2s = uSnowBoost * smoothstep(0.45, 0.75, k2wn.y) * smoothstep(4200.0, 5000.0, vK2World.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), clamp(k2s, 0.0, 1.0));
}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
if (uContour > 0.001) {
  float k2h = vK2World.y / 500.0;
  float k2w = max(fwidth(k2h), 1e-4);
  float k2l = 1.0 - smoothstep(0.0, 1.1 * k2w, abs(fract(k2h + 0.5) - 0.5));
  k2l *= step(4750.0, vK2World.y);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uContourColor, k2l * uContour * 0.6);
}`);
  };
  material.customProgramCacheKey = () => 'k2-terrain-v2';
}

export async function loadWorld({ manager, lowEnd, renderer }) {
  const draco = new DRACOLoader(manager).setDecoderPath(DRACO_GLTF_CONFIG); // bundled + hashed by Vite
  const gltf = new GLTFLoader(manager).setDRACOLoader(draco);
  const tex = new THREE.TextureLoader(manager);
  const load = (name) => gltf.loadAsync(asset(`models/${name}`));

  const coreJSON = fetch(asset('models/k2_core.json')).then((r) => r.json());
  const [terrain, abruzzi, cesen, plinth, slab, tent, flag, core] = await Promise.all([
    load(lowEnd ? 'k2_terrain_lo.glb' : 'k2_terrain.glb'),
    load('route_abruzzi.glb'),
    load('route_cesen.glb'),
    load('plinth.glb'),
    load('section_slab.glb'),
    load('prop_tent.glb'),
    load('prop_flag.glb'),
    coreJSON.then((c) => tex.loadAsync(asset(`models/${c.texture}`)).then((t) => ({ t, c }))),
  ]);
  draco.dispose();

  // --- K2 close-up texture ---
  core.t.colorSpace = THREE.SRGBColorSpace;
  core.t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  terrainUniforms.uCoreMap.value = core.t;
  terrainUniforms.uCoreRect.value.set(core.c.x0, core.c.z0, core.c.x1 - core.c.x0, core.c.feather_m);

  // --- terrain mesh + empties ---
  const root = terrain.scene;
  root.updateMatrixWorld(true);
  let terrainMesh = null;
  const cams = {};
  const hotspots = [];
  root.traverse((o) => {
    if (o.isMesh && !terrainMesh) terrainMesh = o;
    const cm = o.name.match(/^(CAM|LOOK)_(\d\d)/);
    if (cm) cams[`${cm[1]}_${cm[2]}`] = o.getWorldPosition(new THREE.Vector3());
    if (o.name.startsWith('HS_')) {
      const x = o.userData || {};
      hotspots.push({
        id: normId(x.k2_id || o.name.slice(3)),
        name: x.k2_name || o.name.slice(3),
        kind: x.k2_kind || 'place',
        elev: x.k2_elev_cited_m || null,
        position: o.getWorldPosition(new THREE.Vector3()),
      });
    }
  });
  const m = terrainMesh.material;
  [m.map, m.normalMap, m.aoMap].forEach((t) => { if (t) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
  m.roughness = 0.95;
  m.metalness = 0;
  m.aoMapIntensity = 0.85;
  patchTerrainMaterial(m);
  terrainMesh.receiveShadow = !lowEnd;
  terrainMesh.castShadow = !lowEnd;
  terrainMesh.name = 'Terrain';

  // --- plinth ("museum slice") and cross-section: start hidden, faded in by the story/explore ---
  const plinthRoot = plinth.scene;
  plinthRoot.traverse((o) => {
    if (o.material) {
      o.material = o.isLine || o.isLineSegments
        ? new THREE.LineBasicMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.6, fog: false })
        : new THREE.MeshStandardMaterial({ color: '#0f1a28', roughness: 0.95, transparent: true, opacity: 1 });
    }
  });
  const slabRoot = slab.scene;
  slabRoot.traverse((o) => {
    if (o.isMesh) {
      o.material = new THREE.MeshStandardMaterial({ color: '#243a57', emissive: '#0d2440', roughness: 0.8, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    }
  });
  slabRoot.visible = false;

  return {
    terrainRoot: root,
    terrainMesh,
    cams,
    hotspots,
    routes: { abruzzi: abruzzi.scene, cesen: cesen.scene },
    plinth: plinthRoot,
    slab: slabRoot,
    props: { tent: tent.scene, flag: flag.scene },
  };
}
