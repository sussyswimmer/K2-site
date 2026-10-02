"""Debrief 1 · step 2 — DEM → metric height grids, OBJ/XYZ heightfields, clearance map, albedo.

Outputs
  assets-src/dem/grid_1025.npy, grid_513.npy        height grids (gitignored, regenerable)
  assets-src/dem/k2_heightfield_1024.obj / .xyz     1024² quads (gitignored, ~100 MB)
  assets-src/dem/k2_heightfield_512.obj / .xyz      512² quads (committed)
  assets-src/blender/tex/terrain_albedo.png         2048² base colour (no baked lighting)
  public/models/heightmap_256.bin + .json           max-pooled clearance map for the site
  assets-src/data/terrain_meta.json                 projection, extents, summit check

Env:  SUMMIT_MODE=dem (default) keeps the DEM as-is.
      SUMMIT_MODE=survey adds a smooth local bump (σ = 250 m) so the summit vertex
      reads the surveyed 8,611 m. Documented in public/models/README.md.
"""
from __future__ import annotations

import json
import os
from datetime import date

import numpy as np
import rasterio
from PIL import Image
from scipy import ndimage

import k2geo as G

SURVEY_HEIGHT = 8611.0
SUMMIT_MODE = os.environ.get("SUMMIT_MODE", "dem")
TEX = 2048
# K2 close-up tile (local Z-up metres): includes Base Camp, ABC, both routes, summit.
CORE = {"x0": -4000.0, "y1": 3000.0, "size": 9216.0}


def load_dem():
    with rasterio.open(G.DEM_DIR / "k2_dem.tif") as src:
        return src.read(1).astype(np.float64), src.transform


def dem_summit(dem, tf, near=(35.8825, 76.5133), radius=600):
    rows, cols = np.indices(dem.shape)
    lon = tf.c + (cols + 0.5) * tf.a
    lat = tf.f + (rows + 0.5) * tf.e
    d = np.hypot((lat - near[0]) * 110_950, (lon - near[1]) * 111_320 * np.cos(np.radians(near[0])))
    r, c = np.unravel_index(np.argmax(np.where(d < radius, dem, -np.inf)), dem.shape)
    return float(lat[r, c]), float(lon[r, c]), float(dem[r, c])


def sampler(dem, tf, to_geo, order=1):
    def sample(x, y):
        lon, lat = to_geo.transform(x, y)
        col = (np.asarray(lon) - tf.c) / tf.a - 0.5
        row = (np.asarray(lat) - tf.f) / tf.e - 0.5
        return ndimage.map_coordinates(dem, [row.ravel(), col.ravel()], order=order,
                                       mode="nearest").reshape(np.shape(x))
    return sample


def summit_bump(x, y, delta, sigma=250.0):
    return delta * np.exp(-(x ** 2 + y ** 2) / (2 * sigma ** 2))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def lic(vx, vy, noise, steps=36, step=1.0):
    """Line-integral convolution of `noise` along the unit field (vx, vy) in pixel units."""
    hgt, wid = noise.shape
    yy, xx = np.mgrid[0:hgt, 0:wid].astype(np.float32)
    acc = noise.copy()
    wsum = np.ones_like(noise)
    for sgn in (1.0, -1.0):
        px, py = xx.copy(), yy.copy()
        for k in range(steps):
            u = ndimage.map_coordinates(vx, [py, px], order=1, mode="nearest")
            v = ndimage.map_coordinates(vy, [py, px], order=1, mode="nearest")
            px += sgn * u * step
            py += sgn * v * step
            w = 1.0 - k / steps
            acc += w * ndimage.map_coordinates(noise, [py, px], order=1, mode="nearest")
            wsum += w
    return acc / wsum


def hex_rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255.0


def valley_flow(h, spacing, factor=4, min_cells=150, look=6, sigma_m=450.0):
    """Down-valley unit vectors (pixel space) from D8 flow accumulation on a coarse grid.

    Glacier stripes (medial moraines) follow the valley axis, not the local fall line,
    so directions are taken from the main drainage channels and spread sideways.
    """
    hs = ndimage.gaussian_filter(h, 150 / spacing)[::factor, ::factor]
    n0, n1 = hs.shape
    pad = np.pad(hs, 1, constant_values=np.inf)
    offs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    drops = np.stack([(hs - pad[1 + dy:1 + dy + n0, 1 + dx:1 + dx + n1]) / np.hypot(dy, dx)
                      for dy, dx in offs])
    best = np.argmax(drops, axis=0)
    has = np.max(drops, axis=0) > 0
    rr, cc = np.indices(hs.shape)
    dyv = np.array([o[0] for o in offs])[best]
    dxv = np.array([o[1] for o in offs])[best]
    recv = np.where(has, (rr + dyv) * n1 + (cc + dxv), -1).ravel()
    acc = np.ones(n0 * n1)
    for p in np.argsort(-hs.ravel(), kind="stable"):
        r = recv[p]
        if r >= 0:
            acc[r] += acc[p]
    # direction = vector to the receiver `look` steps downstream (smooths D8 zig-zag)
    tgt = np.arange(n0 * n1)
    for _ in range(look):
        nxt = recv[tgt]
        tgt = np.where(nxt >= 0, nxt, tgt)
    ty, tx = np.divmod(tgt, n1)
    vx = (tx - cc.ravel()).astype(float)
    vy = (ty - rr.ravel()).astype(float)
    mag = np.hypot(vx, vy) + 1e-9
    chan = (acc >= min_cells) & (mag > 0.5)
    w = np.where(chan, np.log(acc), 0.0).reshape(hs.shape)
    ux = np.where(chan, vx / mag, 0).reshape(hs.shape) * w
    uy = np.where(chan, vy / mag, 0).reshape(hs.shape) * w
    sig = sigma_m / (spacing * factor)
    gx, gy, gw = (ndimage.gaussian_filter(a, sig) for a in (ux, uy, w))
    # fall back to the nearest channel where the smoothed field is weak
    _, (ir, ic) = ndimage.distance_transform_edt(~chan.reshape(hs.shape), return_indices=True)
    nx, ny = (vx / mag).reshape(hs.shape)[ir, ic], (vy / mag).reshape(hs.shape)[ir, ic]
    strong = gw > 1e-3
    fx = np.where(strong, gx / np.maximum(gw, 1e-9), nx)
    fy = np.where(strong, gy / np.maximum(gw, 1e-9), ny)
    fx, fy = (ndimage.zoom(a, factor, order=1)[:h.shape[0], :h.shape[1]] for a in (fx, fy))
    m = np.hypot(fx, fy) + 1e-6
    return (fx / m).astype(np.float32), (fy / m).astype(np.float32)


def albedo(h, spacing, rng, flow=None):
    """Height + slope terrain classification → sRGB base colour (no lighting baked in).

    All scales are in metres so the global texture (18 m/texel) and the K2 close-up
    tile (4.5 m/texel) share one look. Rules (Debrief 1, adjusted for K2's ice faces):
      rock on steep slopes — the snow/rock cut-off rises from ~40° at 5,500 m to ~55° at
      7,500 m, because K2's upper faces hold ice flutings; snow above ~5,500 m on gentler
      ground; glacier floors grey-white with moraine stripes, debris-covered downstream.
    """
    px = lambda m: m / spacing  # metres → pixels
    gy, gx = np.gradient(h, spacing)  # rows run north→south here; slope magnitude unaffected
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    big = ndimage.gaussian_filter(h, px(600))
    relief = h - big  # negative in valley floors

    def fbm(scale_m, octaves=4):
        out = np.zeros_like(h, dtype=np.float32)
        amp, tot = 1.0, 0.0
        for o in range(octaves):
            n = rng.standard_normal(h.shape).astype(np.float32)
            n = ndimage.gaussian_filter(n, max(px(scale_m) / (2 ** o), 0.6))
            n /= n.std() + 1e-6
            out += amp * n
            tot += amp
            amp *= 0.5
        return out / tot

    n_big, n_mid, n_fine = fbm(1150), fbm(145), fbm(30, 3)

    # --- masks -----------------------------------------------------------------
    glacier = (smoothstep(15, 8, slope)
               * smoothstep(110, 15, relief + 20 * n_mid)
               * smoothstep(5900, 5600, h))
    # snow/rock slope cut-off rises with altitude (ice flutings on the high faces)
    cut = 40 + 15 * smoothstep(5500, 7500, h)
    snow = (smoothstep(5250, 5700, h + 100 * n_big)
            * smoothstep(cut + 2, cut - 5, slope + 3 * n_mid + 1.5 * n_fine))
    # rock bands: roughly horizontal strata exposed on steep high faces
    strata = np.sin(h / 85.0 + 2.2 * n_mid) * 0.5 + 0.5
    bands = smoothstep(0.72, 0.92, strata) * smoothstep(cut - 10, cut, slope)
    snow = snow * (1 - 0.75 * bands)
    firn = smoothstep(5000, 5450, h + 60 * n_big)  # upper glaciers: accumulation zone, snow-covered

    # Moraine stripes: LIC of noise along the down-valley direction.
    vx, vy = flow if flow is not None else valley_flow(h, spacing)
    seed = ndimage.gaussian_filter(rng.standard_normal(h.shape).astype(np.float32), px(25))
    seed = (seed - seed.mean()) / seed.std()
    streak = lic(vx, vy, seed, steps=48, step=px(18))
    streak = (streak - streak.mean()) / (streak.std() + 1e-6)
    moraine = smoothstep(0.45, 1.25, streak)
    debris = smoothstep(5000, 4450, h + 70 * n_big)  # Baltoro debris cover thickens downstream

    # Rock: gully streaks down the fall line.
    hs = ndimage.gaussian_filter(h, px(36))
    sy, sx = np.gradient(hs)
    mg = np.hypot(sx, sy) + 1e-6
    rseed = ndimage.gaussian_filter(rng.standard_normal(h.shape).astype(np.float32), px(14))
    gully = lic((-sx / mg).astype(np.float32), (-sy / mg).astype(np.float32), rseed, steps=14, step=px(18))
    gully = (gully - gully.mean()) / (gully.std() + 1e-6)

    # --- colours (sRGB) --------------------------------------------------------
    rock_d, rock_l = hex_rgb("#2b2522"), hex_rgb("#5a4e46")
    scree = hex_rgb("#6f6359")
    snow_c, snow_b = hex_rgb("#f2f5f8"), hex_rgb("#cfd9e5")
    ice, ice_dirty = hex_rgb("#cdd2d6"), hex_rgb("#aaa79f")
    debris_c, moraine_c = hex_rgb("#665d55"), hex_rgb("#403a34")

    t_rock = np.clip(0.5 + 0.15 * gully + 0.12 * n_mid + 0.08 * n_big + 0.08 * n_fine, 0, 1)[..., None]
    col = rock_d * (1 - t_rock) + rock_l * t_rock
    sc = smoothstep(33, 22, slope)[..., None]
    col = col * (1 - sc) + (scree * (0.92 + 0.08 * np.clip(n_mid, -1, 1))[..., None]) * sc

    t_ice = np.clip(0.45 + 0.25 * n_mid + 0.1 * n_fine, 0, 1)[..., None]
    gl = ice * (1 - t_ice) + ice_dirty * t_ice
    gl = gl * (1 - debris[..., None]) + debris_c * debris[..., None]
    m = (moraine * (0.45 + 0.55 * debris) * (1 - firn))[..., None]
    gl = gl * (1 - m) + moraine_c * m
    gl = gl * (1 - firn[..., None]) + snow_c * firn[..., None]

    t_snow = np.clip(smoothstep(18, 50, slope) * 0.8 + 0.12 * n_mid + 0.08 * n_fine, 0, 1)[..., None]
    sn = snow_c * (1 - t_snow) + snow_b * t_snow

    g = glacier[..., None]
    col = col * (1 - g) + gl * g
    s = (snow * (1 - glacier * (1 - firn)))[..., None]
    col = col * (1 - s) + sn * s
    return np.clip(col, 0, 1), dict(glacier=glacier, snow=snow, slope=slope)


def texture_grid(x0, y1, size, n):
    sp = size / n
    tx = x0 + (np.arange(n) + 0.5) * sp
    ty = y1 - (np.arange(n) + 0.5) * sp  # image row 0 = north (v = 1)
    return np.meshgrid(tx, ty), sp


def main() -> None:
    G.DEM_DIR.mkdir(parents=True, exist_ok=True)
    G.DATA_DIR.mkdir(parents=True, exist_ok=True)
    (G.ROOT / "assets-src/blender/tex").mkdir(parents=True, exist_ok=True)
    (G.ROOT / "public/models").mkdir(parents=True, exist_ok=True)

    dem, tf = load_dem()
    lat0, lon0, z_dem = dem_summit(dem, tf)
    proj, to_local, to_geo = G.transformers(lat0, lon0)
    sample = sampler(dem, tf, to_geo, order=1)
    delta = SURVEY_HEIGHT - z_dem if SUMMIT_MODE == "survey" else 0.0
    print(f"summit (DEM) {z_dem:.1f} m at {lat0:.5f}, {lon0:.5f}; mode={SUMMIT_MODE}, bump {delta:+.1f} m")

    # --- 1025 / 513 grids ------------------------------------------------------
    ax = G.X0 + np.arange(G.N_HI) * G.SPACING_HI
    ay = G.Y0 + np.arange(G.N_HI) * G.SPACING_HI
    xx, yy = np.meshgrid(ax, ay)
    h = sample(xx, yy) + summit_bump(xx, yy, delta)
    h = h.astype(np.float32)
    np.save(G.DEM_DIR / "grid_1025.npy", h)
    h513 = h[::2, ::2].copy()
    np.save(G.DEM_DIR / "grid_513.npy", h513)
    i0 = int(round(-G.X0 / G.SPACING_HI))
    j0 = int(round(-G.Y0 / G.SPACING_HI))
    print(f"grid 1025²: {h.min():.0f}–{h.max():.0f} m; summit vertex ({i0},{j0}) = {h[j0, i0]:.1f} m")

    hdr = (f"K2 heightfield — Copernicus GLO-30 (EGM2008), local tmerc centred on DEM summit\n"
           f"{proj}\nunits: metres, X east, Y north, Z up; VERTICAL_EXAGGERATION={G.VERTICAL_EXAGGERATION}\n"
           f"summit mode: {SUMMIT_MODE}")
    for n_quads, grid, sp in ((1024, h, G.SPACING_HI), (512, h513, G.SPACING_HI * 2)):
        v, f, uv = G.grid_mesh(grid, sp)
        G.write_obj(G.DEM_DIR / f"k2_heightfield_{n_quads}.obj", v, f, uv, header=hdr)
        np.savetxt(G.DEM_DIR / f"k2_heightfield_{n_quads}.xyz", v, fmt="%.2f %.2f %.2f")
        print(f"wrote k2_heightfield_{n_quads}.obj ({len(v):,} verts, {len(f):,} tris)")

    # --- clearance heightmap for the browser (three.js frame) -------------------
    # 257² nodes every 144 m; each node = max over ±1 cell so bilinear interpolation
    # never dips below the true surface. Rows run north→south (three.js +z = south).
    step = 4
    hmax = ndimage.maximum_filter(h, size=2 * step + 1, mode="nearest")[::step, ::step]
    hm = np.ceil(hmax[::-1, :]).astype(np.uint16)  # flip so row 0 = north edge
    hm.tofile(G.ROOT / "public/models/heightmap_256.bin")
    (G.ROOT / "public/models/heightmap_256.json").write_text(json.dumps({
        "format": "uint16 little-endian, metres (ceil of max-pooled DEM)",
        "n": int(hm.shape[0]), "cell": G.SPACING_HI * step,
        "x0": G.X0, "z0": -G.Y1,
        "layout": "data[r * n + c]; x = x0 + c * cell (east); z = z0 + r * cell (south, three.js)",
        "purpose": "camera clearance only — conservative (never below the real surface)",
    }, indent=2))

    # --- albedo 2048² (whole model) -----------------------------------------------
    hi_sampler = sampler(dem, tf, to_geo, order=3)
    (txx, tyy), tsp = texture_grid(G.X0, G.Y1, G.SIZE, TEX)
    ht = (hi_sampler(txx, tyy) + summit_bump(txx, tyy, delta)).astype(np.float32)
    ht = ndimage.gaussian_filter(ht, 0.7)
    flow = valley_flow(ht, tsp)
    col, masks = albedo(ht, tsp, np.random.default_rng(2611), flow)
    img = Image.fromarray((col * 255 + 0.5).astype(np.uint8))
    img.save(G.ROOT / "assets-src/blender/tex/terrain_albedo.png", optimize=True)
    img.resize((768, 768), Image.LANCZOS).save(G.ROOT / "assets-src/renders/albedo_preview.png")
    print(f"albedo: glacier {masks['glacier'].mean():.1%}, snow {masks['snow'].mean():.1%}")

    # --- K2 close-up tile: 2048² over 9,216 m (4.5 m/texel) --------------------------
    # The story cameras get within 1–3 km of the summit; the site blends this tile
    # over the global albedo inside CORE (feathered edge). Flow vectors come from the
    # global texture so the moraine stripes line up across the seam.
    cx0, cy1, csize = CORE["x0"], CORE["y1"], CORE["size"]
    (cxx, cyy), csp = texture_grid(cx0, cy1, csize, TEX)
    hc = (hi_sampler(cxx, cyy) + summit_bump(cxx, cyy, delta)).astype(np.float32)
    hc = ndimage.gaussian_filter(hc, 1.2)
    gfx, gfy = flow
    ci = (cxx - G.X0) / tsp - 0.5
    cj = (G.Y1 - cyy) / tsp - 0.5
    cflow = tuple(ndimage.map_coordinates(a, [cj, ci], order=1, mode="nearest").astype(np.float32) for a in (gfx, gfy))
    ccol, _ = albedo(hc, csp, np.random.default_rng(8611), cflow)
    cimg = Image.fromarray((ccol * 255 + 0.5).astype(np.uint8))
    cimg.save(G.ROOT / "assets-src/blender/tex/k2_core_albedo.png", optimize=True)
    cimg.save(G.ROOT / "public/models/k2_core_albedo.webp", quality=82, method=6)
    cimg.resize((768, 768), Image.LANCZOS).save(G.ROOT / "assets-src/renders/albedo_core_preview.png")
    (G.ROOT / "public/models/k2_core.json").write_text(json.dumps({
        "texture": "k2_core_albedo.webp",
        "texel_m": csp,
        "frame": "three.js Y-up metres (x east, z south)",
        "x0": cx0, "x1": cx0 + csize, "z0": -cy1, "z1": -cy1 + csize,
        "uv": "u = (x - x0) / (x1 - x0); v = 1 - (z - z0) / (z1 - z0)  (flipY = false: row 0 = north = z0)",
        "feather_m": 600,
    }, indent=2))
    print(f"core albedo: {csize:.0f} m square at {csp:.1f} m/texel")

    meta = {
        "generated": date.today().isoformat(),
        "source": "Copernicus DEM GLO-30, tile N35_00_E076_00 (AWS Open Data)",
        "vertical_datum": "EGM2008",
        "projection": proj,
        "summit_latlon": [lat0, lon0],
        "summit_dem_m": round(z_dem, 1),
        "summit_survey_m": SURVEY_HEIGHT,
        "summit_mode": SUMMIT_MODE,
        "summit_bump_m": round(delta, 1),
        "vertical_exaggeration": G.VERTICAL_EXAGGERATION,
        "grid": {"x0": G.X0, "y0": G.Y0, "size": G.SIZE, "n_hi": G.N_HI, "spacing_hi": G.SPACING_HI,
                 "n_lo": 513, "spacing_lo": G.SPACING_HI * 2},
        "elev_min_m": float(h.min()), "elev_max_m": float(h.max()),
        "texture": {"size": TEX, "texel_m": tsp},
    }
    G.META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"meta → {G.META_PATH.relative_to(G.ROOT)}")


if __name__ == "__main__":
    main()
