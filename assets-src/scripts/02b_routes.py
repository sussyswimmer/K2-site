"""Debrief 1 · step 2b — route polylines, camps, hotspots and camera waypoints.

Writes assets-src/data/route_waypoints.json (local Z-up metres + lat/lon), consumed by
the FreeCAD build (route tubes, camps), the Blender scene (CAM_/LOOK_ empties) and the
site (hotspots, routes.json).

Sources for positions
  - OpenStreetMap nodes (© OpenStreetMap contributors, ODbL): K2 Base Camp, Gilkey
    Memorial, Broad Peak Base Camp, Concordia, Abruzzi Camp 1 (and C2/C3, see notes).
  - Everything else is traced on the Copernicus DEM: steepest-ascent paths settle on
    ridge crests, which is where the Abruzzi Spur and the Cesen (SSE) spur run.
    Camps placed this way are flagged "approx" — camp sites move from season to season.
"""
from __future__ import annotations

import json

import numpy as np
from scipy import ndimage

import k2geo as G

T = G.Terrain()
S = G.Terrain(ndimage.gaussian_filter(T.h.astype(float), 1.0))  # lightly smoothed for gradients
meta = G.load_meta()
_, TO_LOCAL, TO_GEO = G.transformers(*meta["summit_latlon"])

OSM = {  # lat, lon
    "base_camp": (35.83454, 76.50927),
    "gilkey_memorial": (35.83102, 76.50347),
    "broad_peak_bc": (35.80439, 76.51713),
    "concordia": (35.74162, 76.51189),
    "abruzzi_c1": (35.86600, 76.53609),
    "abruzzi_c2": (35.86849, 76.53295),
    "abruzzi_c3": (35.87241, 76.53164),
}
PEAKS = {  # approximate published coordinates; snapped to the DEM maximum nearby
    "broad_peak": ("Broad Peak", 8051, (35.8106, 76.5681)),
    "gasherbrum_i": ("Gasherbrum I", 8080, (35.7244, 76.6964)),
    "gasherbrum_ii": ("Gasherbrum II", 8035, (35.7575, 76.6533)),
    "gasherbrum_iv": ("Gasherbrum IV", 7932, (35.7597, 76.6158)),
}


def local(lat, lon):
    x, y = TO_LOCAL.transform(lon, lat)
    return float(x), float(y)


def geo(x, y):
    lon, lat = TO_GEO.transform(x, y)
    return round(float(lat), 6), round(float(lon), 6)


def z(x, y):
    return float(T.height(x, y))


def grad(x, y, e=20.0):
    return ((S.height(x + e, y) - S.height(x - e, y)) / (2 * e),
            (S.height(x, y + e) - S.height(x, y - e)) / (2 * e))


def trace(x, y, sgn=1, step=12.0, n=2000, stop=None):
    """Steepest ascent (sgn=1) / descent (sgn=-1); stops at a local extremum."""
    pts = [(x, y)]
    for _ in range(n):
        gx, gy = grad(x, y)
        g = np.hypot(gx, gy)
        if g < 0.02:
            break
        x, y = x + sgn * step * gx / g, y + sgn * step * gy / g
        pts.append((x, y))
        if stop and stop(x, y):
            break
        if len(pts) > 6 and np.hypot(x - pts[-6][0], y - pts[-6][1]) < step:
            break  # oscillating around a top
    return np.array(pts)


def ridge_follow(a, b, step=20.0, search=90.0):
    """Walk from a to b, snapping each step to the highest point across the walking line."""
    a, b = np.array(a, float), np.array(b, float)
    pts, p = [a], a.copy()
    for _ in range(5000):
        dist = np.hypot(*(b - p))
        if dist <= step:
            break
        d = (b - p) / dist
        q = p + d * step
        perp = np.array([-d[1], d[0]])
        reach = min(search, 0.25 * dist)  # converge on b instead of side-slipping forever
        offs = np.linspace(-reach, reach, 19)
        cand = q[None, :] + offs[:, None] * perp[None, :]
        q = cand[np.argmax(S.height(cand[:, 0], cand[:, 1]))]
        pts.append(q)
        p = q
    pts.append(b)
    return np.array(pts)


def resample(path, spacing=15.0):
    seg = np.hypot(*np.diff(path, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.arange(0, s[-1], spacing).tolist() + [s[-1]]
    xy = np.column_stack([np.interp(t, s, path[:, 0]), np.interp(t, s, path[:, 1])])
    return ndimage.gaussian_filter1d(xy, 1.2, axis=0, mode="nearest")


def at_elev(path, target):
    zs = S.height(path[:, 0], path[:, 1])
    i = int(np.argmax(zs >= target))
    return tuple(path[i])


def peak_near(lat, lon, radius=900.0):
    x, y = local(lat, lon)
    gx = np.linspace(x - radius, x + radius, 61)
    gy = np.linspace(y - radius, y + radius, 61)
    xx, yy = np.meshgrid(gx, gy)
    hh = T.height(xx, yy)
    k = np.unravel_index(np.argmax(hh), hh.shape)
    return float(xx[k]), float(yy[k])


def point(pid, name, x, y, elev_cited=None, source="", note="", kind="camp"):
    lat, lon = geo(x, y)
    return {"id": pid, "name": name, "kind": kind, "x": round(x, 1), "y": round(y, 1),
            "z_dem": round(z(x, y), 1), "elev_cited_m": elev_cited, "lat": lat, "lon": lon,
            "source": source, "note": note}


def main() -> None:
    P = {k: local(*v) for k, v in OSM.items()}
    summit = (0.0, 0.0)

    # --- Abruzzi Spur (SE ridge) ---------------------------------------------
    up_from_c1 = trace(*P["abruzzi_c1"], 1)  # settles onto the spur crest and runs to the top
    down_from_c1 = trace(*P["abruzzi_c1"], -1, stop=lambda x, y: z(x, y) < 5260)
    abc = tuple(down_from_c1[-1])
    abruzzi_xy = np.vstack([
        np.linspace(P["base_camp"], abc, 40),     # walk up the Godwin-Austen Glacier
        down_from_c1[::-1],                         # ABC → C1 up the foot of the spur
        up_from_c1[1:],                             # C1 → summit along the crest
        [summit],
    ])
    abruzzi_xy = resample(abruzzi_xy, 15.0)
    abruzzi_xy[-1] = summit
    upper = abruzzi_xy[len(abruzzi_xy) // 3:]
    c2 = at_elev(upper, 6700)
    c3 = at_elev(upper, 7200)
    c4 = at_elev(upper, 7900)
    bottleneck = at_elev(upper, 8200)

    abruzzi_camps = [
        point("base-camp", "K2 Base Camp", *P["base_camp"], 5000, "OpenStreetMap", kind="camp"),
        point("abc", "Advanced Base Camp", *abc, 5300, "traced on DEM (foot of the Abruzzi Spur)", "approx."),
        point("camp-1", "Camp 1", *P["abruzzi_c1"], 6050, "OpenStreetMap", "approx."),
        point("camp-2", "Camp 2", *c2, 6700, "placed on traced crest at cited elevation",
              f"approx.; the OSM node for C2 sits at {z(*P['abruzzi_c2']):.0f} m on the DEM — sources and seasons differ"),
        point("camp-3", "Camp 3", *c3, 7200, "placed on traced crest at cited elevation",
              f"approx.; the OSM node for C3 sits at {z(*P['abruzzi_c3']):.0f} m on the DEM"),
        point("camp-4", "Camp 4 (the Shoulder)", *c4, 7900, "traced on DEM (the Shoulder)", "approx.; cited 7,600–8,000 m"),
        point("bottleneck", "The Bottleneck", *bottleneck, 8200, "traced on DEM", "approx.; couloir beneath the summit serac", kind="feature"),
        point("summit", "K2 summit", *summit, 8611, "Copernicus DEM maximum", f"DEM reads {meta['summit_dem_m']} m", kind="summit"),
    ]

    # --- Cesen route (South-South-East spur) ----------------------------------
    foot = local(35.8456, 76.5193)  # glacier foot of the SSE spur, NE of Base Camp
    spur = trace(*foot, 1)          # settles on the spur's lower top (~6,240 m)
    crest = ridge_follow(tuple(spur[-1]), c4, step=20, search=30)
    # Above ~7,050 m the route leaves the spur and slants up the snow slopes to the Shoulder.
    k = int(np.argmax(S.height(crest[:, 0], crest[:, 1]) >= 7050))
    to_shoulder = np.vstack([crest[:k], np.linspace(crest[k], c4, 60)])
    cesen_xy = np.vstack([np.linspace(P["base_camp"], foot, 25), spur[1:], to_shoulder[1:]])
    cesen_xy = resample(cesen_xy, 15.0)
    cesen_xy = np.vstack([cesen_xy, abruzzi_xy[np.argmin(np.hypot(*(abruzzi_xy - np.array(c4)).T)) + 1:]])
    cupper = cesen_xy[len(cesen_xy) // 5:]
    cesen_camps = [
        point("cesen-c1", "Cesen Camp 1", *at_elev(cupper, 5950), 5950, "traced on DEM", "approx."),
        point("cesen-c2", "Cesen Camp 2", *at_elev(cupper, 6400), 6400, "traced on DEM", "approx."),
        point("cesen-c3", "Cesen Camp 3", *at_elev(cupper, 7000), 7000, "traced on DEM", "approx."),
        point("cesen-join", "Joins the Abruzzi at the Shoulder", *c4, 7900, "traced on DEM", "approx.", kind="feature"),
    ]

    def poly(xy, lift):
        return [[round(float(x), 1), round(float(y), 1), round(z(x, y) + lift, 1)] for x, y in xy]

    # --- hotspots + peaks ----------------------------------------------------------
    peaks = []
    for pid, (name, elev, ll) in PEAKS.items():
        x, y = peak_near(*ll)
        peaks.append(point(pid, name, x, y, elev, "published coordinates snapped to DEM maximum", kind="peak"))
    places = [
        point("concordia", "Concordia", *P["concordia"], 4600, "OpenStreetMap", "glacier junction", kind="place"),
        point("gilkey-memorial", "Gilkey Memorial", *P["gilkey_memorial"], None, "OpenStreetMap", kind="place"),
        point("broad-peak-bc", "Broad Peak Base Camp", *P["broad_peak_bc"], None, "OpenStreetMap", kind="place"),
    ]

    # --- camera waypoints (Z-up local metres) ------------------------------------------
    cams = [
        ("CAM_00_Space", (-30000, -36000, 23000), (-2000, -9000, 6000)),
        ("CAM_01_Concordia", (-3200, -17600, 5450), (200, -1500, 7200)),
        ("CAM_02_BaseCamp", (-900, -6600, 5300), (300, -800, 7700)),
        ("CAM_03_AbruzziSpur", (4200, -3300, 6800), (1500, -900, 6900)),
        ("CAM_04_Bottleneck", (1700, -1300, 8150), (420, -40, 8240)),
        ("CAM_05_Summit", (-1600, -2600, 9150), (0, 0, 8450)),
    ]
    cameras = []
    for name, cam, look in cams:
        clearance = cam[2] - float(T.height(cam[0], cam[1]))
        cameras.append({"name": name, "look_name": "LOOK_" + name[4:6], "pos": list(cam), "look": list(look),
                        "clearance_m": round(clearance, 0)})
        flag = "OK" if clearance >= 150 else "TOO LOW"
        print(f"{name:20s} clearance {clearance:7.0f} m  {flag}")

    out = {
        "frame": "local Z-up metres: +X east, +Y north, +Z elevation (EGM2008); origin = DEM summit",
        "routes": {
            "abruzzi": {"name": "Abruzzi Spur (SE ridge)", "color": "#F2A541",
                        "polyline": poly(abruzzi_xy, 0.0), "camps": abruzzi_camps},
            "cesen": {"name": "Cesen route (SSE spur)", "color": "#5CE1E6",
                      "polyline": poly(cesen_xy, 0.0), "camps": cesen_camps},
        },
        "places": places,
        "peaks": peaks,
        "cameras": cameras,
        "credits": "Positions: OpenStreetMap contributors (ODbL) where noted; others traced on Copernicus GLO-30.",
    }
    path = G.DATA_DIR / "route_waypoints.json"
    path.write_text(json.dumps(out, indent=1))
    for c in abruzzi_camps + cesen_camps + places + peaks:
        print(f"{c['id']:16s} ({c['x']:8.0f},{c['y']:8.0f}) DEM {c['z_dem']:6.0f}  cited {c['elev_cited_m']}")
    print(f"abruzzi {len(abruzzi_xy)} pts, cesen {len(cesen_xy)} pts → {path.relative_to(G.ROOT)}")


if __name__ == "__main__":
    main()
