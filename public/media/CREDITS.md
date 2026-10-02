# Media credits (Debrief 2)

All images, videos and 3D props in `public/media/` and `public/models/prop_*.glb` were generated with **Higgsfield** in the project *K2 Savage Mountain* (project id `202f5a1d-7848-45b5-8e9e-fdd8c3306a08`) on 2026-10-02. The original generations are in that project; `assets-src/scripts/process_media.mjs` converted them for the web.

## Models used

Model choices came from `models_explore`. The server reported the model that actually ran, which is listed below where it differs from the one requested.

| Use | Requested | Ran as |
|---|---|---|
| Scene images (2K) | `nano_banana_pro` (Google Nano Banana Pro) | `nano_banana_2` |
| Prop source images | `gpt_image_2_5` (OpenAI GPT Image 2.5) | `gpt_image_2_5` |
| Upscales (4K) | `upscale_image` (ByteDance) | `bytedance_image_upscale` |
| Videos (silent, 1080p) | `kling3_0` pro, sound off | `kling3_0` |
| 3D props | `tripo_h3_1_image_to_3d` (Tripo H3.1), 4,000-face limit, textured | `tripo_h3_1_image_to_3d` |

## Style key (appended to every scene prompt)

> Cinematic, high-altitude photography look. Cold palette: deep navy shadows, ice-blue snow, warm amber first light on the summit. Thin cirrus clouds, spindrift blowing off ridges, crisp thin air, no people's faces visible, no text, no logos, no watermarks. Shot as if on a medium-format camera with a long lens. Karakoram range, Pakistan.

## Files

| File | Model | Higgsfield job | Prompt |
|---|---|---|---|
| `hero_k2_dawn.webp` (+ `_1280`) | nano_banana_pro (K2 reference photos attached); upscaled to 4K (job `0e082354-44c6-444a-ae66-16acbb00ac2f`) | `4cee71ae-25d2-4527-a68d-8248b70cc787` | K2 seen from Concordia at dawn: the steep symmetrical summit pyramid catching amber alpenglow while the lower mountain is still in deep blue shadow; the broad Godwin-Austen Glacier in the foreground with dark medial moraine stripes leading the eye to the peak. |
| `chapter_baltoro.webp` (+ `_1280`) | nano_banana_pro | `2681d4ac-ab78-45e9-8803-d54baf773b6c` | The Baltoro Glacier trek: a vast river of ice with long parallel moraine stripes, a thin porters' trail tracing along the debris, sheer granite towers and spires rising on both sides in the distance, late afternoon light. |
| `chapter_basecamp.webp` (+ `_1280`) | nano_banana_pro (K2 reference photos attached) | `5d39ce7f-7824-4ffa-ba07-9339aeb1fe30` | K2 base camp at dusk: a cluster of small orange and yellow expedition dome tents on rocky glacier ice around 5,000 m, strings of prayer flags, K2 towering enormous above the camp with the last light on its summit. |
| `chapter_bottleneck.webp` (+ `_1280`) | nano_banana_pro | `05602bb2-1ada-4c5f-8cea-e85406c36245` | Night in a narrow, steep snow couloir at 8,200 m beneath a huge overhanging ice cliff (serac) glowing faintly blue; a line of tiny climber silhouettes with headlamps, seen from behind and far away, extreme exposure, stars above. |
| `chapter_summit.webp` (+ `_1280`) | nano_banana_pro; upscaled to 4K (job `6cf8de17-1c01-4841-989c-1f920d98f189`) | `77cafd1f-dd19-4be2-9686-d798a9feb7d2` | View from a corniced summit ridge at sunrise over an endless sea of jagged Karakoram peaks and low clouds, the horizon curving, the ridge snow lit amber, deep blue sky overhead. |
| `chapter_winter.webp` (+ `_1280`) | nano_banana_pro (K2 reference photos attached) | `08f39af8-c8c9-45d1-a8a3-876f8980994b` | K2 in brutal winter: a storm wrapping the mountain, a long jet-stream snow plume tearing off the summit pyramid, deep blue twilight, wind-scoured ice. |
| `mobile_hero.webp` (+ `_1280`) | nano_banana_pro (K2 reference photos attached) | `a409ad81-cf91-4869-ac6b-4a4f48455c33` | Portrait framing of K2 from the Godwin-Austen Glacier at dawn: the summit pyramid in amber alpenglow high in the frame, the glacier and moraine stripes leading up from the bottom. |
| `og_card.webp` / `og_card.jpg` | crop of `hero_k2_dawn` (1200×630) | — | — |
| `flythrough_intro.mp4` / `.webm` / `_poster.webp` | kling3_0 pro, silent, 10 s; start frame `chapter_baltoro`, end frame `hero_k2_dawn` (the debrief asked for the hero as start frame; using it as the *end* frame gives the requested rise-and-reveal) | `d4624842-a5df-4fc6-8bd2-39e7328037bc` | Slow cinematic aerial drone shot: the camera rises from low over the Baltoro Glacier, banks gently past the Concordia glacier junction and reveals K2 ahead, steady motion, no cuts. |
| `summit_wind_loop.mp4` / `.webm` / `_poster.webp` | kling3_0 pro, silent, 5 s; start + end frame `chapter_summit` (for a clean loop) | `91fae7a5-fdfe-45ac-95b2-6347a098c057` | Locked-off shot: spindrift snow blowing steadily off a summit ridge in strong wind, clouds drifting below, seamless looping motion, camera does not move. |
| `storm_loop.mp4` / `.webm` / `_poster.webp` | kling3_0 pro, silent, 5 s; start + end frame `chapter_winter` (for a clean loop) | `bbb9d555-58a1-4d31-ae81-cdf22c456c4f` | Locked-off shot: storm clouds wrapping and streaming around the summit pyramid, snow plume streaming, seamless looping motion, camera does not move. |
| `public/models/prop_tent.glb` | tripo_h3_1 from a gpt_image_2_5 source image (job `4c854d07-eb42-4ac5-8bc9-6214a7bcda04`) | `7e362c6b-8d2f-4111-a92c-5c144269d935` | Source image: A single orange expedition dome tent, three-quarter view, isolated on a plain light grey background, product photo, even soft light |
| `public/models/prop_oxygen_bottle.glb` | tripo_h3_1 from a gpt_image_2_5 source image (job `386ea961-5051-4785-aea9-ecc10cf7130b`) | `6768d3da-f654-4b25-9e1a-7dfd48bdfe2d` | Source image: A mountaineering oxygen cylinder with regulator and hose, orange cylinder, isolated on a plain light grey background, product photo |
| `public/models/prop_ice_axe.glb` | tripo_h3_1 from a gpt_image_2_5 source image (job `26a2e1a8-e676-4684-ac95-70bcaa074b9e`) | `bf20f16a-8efd-49a1-ba75-8a60a7d6187f` | Source image: A modern mountaineering ice axe, curved shaft, steel pick and adze, isolated on a plain light grey background, product photo |
| `public/models/prop_flag.glb` | tripo_h3_1 from a gpt_image_2_5 source image (job `a87f8d57-ffc9-4b74-9ba5-86dfd811c97a`) | `84dcd2b9-4232-4b58-8398-6ac9c1adce0e` | Source image: A small plain amber summit flag on a thin aluminium pole, isolated on a plain light grey background, product photo, no text or emblem |

## Reference photos (shape references only, not shipped on the site)

- [K2 from Concordia - 3.jpg](https://commons.wikimedia.org/wiki/File:K2_from_Concordia_-_3.jpg) by Sallahuddin shah, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0), retrieved 2026-10-02. Higgsfield media id: `3e33eca8-5f38-44f0-94dc-da8f11eb2dac`.
- [K2 View from Concordia.jpg](https://commons.wikimedia.org/wiki/File:K2_View_from_Concordia.jpg) by Sallahuddin shah, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0), retrieved 2026-10-02. Higgsfield media id: `b63354bf-cef6-49d7-a7bf-e4583c5f9b03`.
- [Concordia to K2 Base Camp.jpg](https://commons.wikimedia.org/wiki/File:Concordia_to_K2_Base_Camp.jpg) by Molly Tolzmann, CC BY-SA 2.0 (https://creativecommons.org/licenses/by-sa/2.0), retrieved 2026-10-02. Higgsfield media id: `f4ff3207-938e-4242-a29d-1c4b31a23db9`.

## Audio

No audio files. Higgsfield has no sound-effects model, so the ambient wind, the storm and the UI tick are synthesised live in the browser (`src/ui/audio.js`) from filtered noise. Sound is off by default.

## Credits spent

| Item | Credits |
|---|---|
| 7 scene images (nano_banana_pro 2K × 2) | 14 |
| 4 prop source images (gpt_image_2_5 × 0.25) | 1 |
| 2 upscales (× 2) | 4 |
| 3 videos (10 s × 17.5 + 2 × 5 s × 8.75) | 35 |
| 4 3D props (Tripo H3.1 × 9) | 36 |
| **Total** | **90** (balance 672.53 → 582.53; approved cap 130) |
