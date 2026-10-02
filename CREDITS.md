# Credits & data sources

## Elevation data
- **Copernicus DEM GLO-30**, tile N35_00_E076_00, accessed 2026-10-02 from https://registry.opendata.aws/copernicus-dem
  - The terrain was **produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.**
  - Vertical datum EGM2008. The model and its textures are derived products: reprojected, resampled, decimated and classified.

## Positions
- Base Camp, Concordia, Gilkey Memorial, Broad Peak Base Camp and Abruzzi Camp 1 come from **© OpenStreetMap contributors**, available under the Open Database License (https://www.openstreetmap.org/copyright).
- The other camps and route lines are traced on the DEM and are approximate.

## Reference photographs
These are used only to check the model's summit shape and as style references for generated media. They are not deployed on the site.
- "K2 from Concordia - 3.jpg" by Sallahuddin shah, CC BY-SA 4.0 — https://commons.wikimedia.org/wiki/File:K2_from_Concordia_-_3.jpg
- "K2 View from Concordia.jpg" by Sallahuddin shah, CC BY-SA 4.0 — https://commons.wikimedia.org/wiki/File:K2_View_from_Concordia.jpg
- "Concordia to K2 Base Camp.jpg" by Molly Tolzmann, CC BY-SA 2.0 — https://commons.wikimedia.org/wiki/File:Concordia_to_K2_Base_Camp.jpg

## Facts and figures
Every fact, timeline event, route, comparison row and weather month in `public/data/` carries its own `source_url`. All sources were opened and checked on 2026-10-02, and the page's Sources section lists them all. Where good sources disagree, the text gives both figures. There is no K2 equivalent of the Himalayan Database, so K2's all-time summit and death totals are our estimates and are labelled that way. Some figures rely on expedition operators' pages (trek days, camp heights, expedition length and cost), and their source titles say so.

## Software
FreeCAD 1.1.3 (LGPL-2.0+), Blender 4.0 (GPL), three.js (MIT), GSAP (free since 2025), Lenis (MIT), gltf-transform (MIT), Draco (Apache-2.0), Fontsource (Fraunces and Inter, SIL OFL 1.1).

## Generated media
Higgsfield generations are listed in `public/media/CREDITS.md` (Debrief 2).

## Audio
The ambient wind, storm and UI sounds are synthesised live in the browser with the Web Audio API. There are no audio files to credit.
