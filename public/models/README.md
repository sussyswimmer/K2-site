# K2 models — scale, units, origin

All models are built from **real elevation data**: Copernicus DEM GLO-30, tile N35/E076. The pipeline runs Python (numpy/rasterio) → FreeCAD 1.1 (headless) → Blender 4.0 (headless) → gltf-transform. Rebuild everything with `npm run build:terrain`; the scripts are in `assets-src/scripts/`.

## Frame (what the site sees)

| | |
|---|---|
| Units | **1 unit = 1 metre** (true scale, no normalisation) |
| Axes (glTF / three.js, Y-up) | **+x = east, +y = elevation above sea level, +z = south** |
| Origin | x = z = 0 at the **K2 summit as it appears in the DEM** (35.88083° N, 76.51250° E) |
| Elevation | y is the true orthometric height (EGM2008 geoid ≈ mean sea level), so `camera.position.y` is the real altitude for the altitude meter |
| Vertical exaggeration | `VERTICAL_EXAGGERATION = 1.0` (`assets-src/scripts/k2geo.py`) |
| Projection | Local transverse Mercator centred on the summit (`+proj=tmerc +lat_0=35.88083 +lon_0=76.5125 +k=1 +datum=WGS84`). It's metric like UTM 43N (EPSG:32643), but grid north equals true north; UTM grid north is about 0.9° off here. |
| Extent | x −18,000 → 18,864 m, z −12,384 → 24,480 m (36.9 km square): K2, Godwin-Austen Glacier, Concordia, Broad Peak, Gasherbrum I/II/IV, lower Baltoro |

FreeCAD and Blender sources use the same frame Z-up: X east, Y north, Z elevation. The glTF exporter rotates it to Y-up. FreeCAD's internal unit is nominally the millimetre, but every value in `K2_Master.FCStd` is a metre.

## Summit height

At its highest cell the DEM reads **8,570.6 m**. The surveyed height is **8,611 m**, a gap of −40 m. That's typical for a 30 m radar surface model on a sharp, radar-shadowed summit. The models ship with the **DEM as-is** (`SUMMIT_MODE=dem`). Setting `SUMMIT_MODE=survey` instead adds a smooth local bump (σ = 250 m) so the summit vertex reads 8,611 m. That bump is a cosmetic correction, not data. The site displays 8,611 m as the official height.

## Files

| File | Contents |
|---|---|
| `k2_terrain.glb` | Terrain: 1024² grid decimated to 150k tris; 2048 albedo, normal and AO (WebP); Draco. Also holds the camera rail empties `CAM_00_Space … CAM_05_Summit`, each with a child `LOOK_00 … LOOK_05`, and the hotspot anchors `HS_*` (custom props `k2_id`, `k2_name`, `k2_kind` as glTF extras). |
| `k2_terrain_lo.glb` | Low-end variant: 512² grid decimated to 60k tris, 1024 textures, same empties |
| `route_abruzzi.glb` / `route_cesen.glb` | Route tubes (radius 12 m, lifted 25 m above the DEM), emissive amber `#F2A541` / cyan `#5CE1E6` |
| `camps.glb` | Wedge tents and summit flag at **8× real size**, so they read from the story cameras |
| `contours.glb` | 500 m contour lines, 5,000–8,500 m (glTF LINES) |
| `plinth.glb` | "Museum slice" skirt down to 3,500 m, with 500 m contour lines on the four sides |
| `section_slab.glb` | 40 m-thick vertical section through the summit along the SE ridge (azimuth 127.7°) |
| `heightmap_256.bin/.json` | 257² uint16 max-pooled heights for cheap camera clearance (never below the real surface) |
| `cameras.json` | Backup of the six camera/look positions in the Y-up frame |

## Positions

Route, camp and hotspot positions are in `assets-src/data/route_waypoints.json`, which gives each point's local coordinates, lat/lon, DEM elevation, cited elevation and source.

- **From OpenStreetMap (© OpenStreetMap contributors, ODbL):** Base Camp, Concordia, Gilkey Memorial, Broad Peak BC, Abruzzi Camp 1.
- **Traced on the DEM, labelled approx.:** everything else. Paths that climb by steepest ascent settle onto ridge crests, which is where the Abruzzi Spur and the Cesen spur run. Camps are placed where the traced crest reaches their cited elevations.
