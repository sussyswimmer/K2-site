"""Debrief 1 · step 3 — FreeCAD master document (run headless with freecadcmd).

  QT_QPA_PLATFORM=offscreen /opt/mm/envs/fc/bin/freecadcmd assets-src/scripts/03_freecad_build.py

Builds assets-src/freecad/K2_Master.FCStd with the eight named objects from Debrief 1
and exports each to assets-src/freecad/exports/*.obj.

Units: FreeCAD's internal unit is the millimetre, but every number in this document is
a METRE (1 FreeCAD unit = 1 m) in the shared local frame: +X east, +Y north, +Z
elevation, origin = K2 DEM summit. The Terrain object keeps the 512² grid so the .FCStd
stays small; the 1024² grid is repaired with the same steps and exported alongside.
"""
import json
import math
import os
import time
from pathlib import Path

import FreeCAD as App
import Mesh
import MeshPart
import Part
import numpy as np

ROOT = Path(os.environ.get("K2_ROOT", "/home/user/K2-site"))
DEM = ROOT / "assets-src/dem"
OUT = ROOT / "assets-src/freecad"
EXP = OUT / "exports"
EXP.mkdir(parents=True, exist_ok=True)
META = json.loads((ROOT / "assets-src/data/terrain_meta.json").read_text())
WAY = json.loads((ROOT / "assets-src/data/route_waypoints.json").read_text())
V = App.Vector

GRID = META["grid"]
X0, Y0, SIZE = GRID["x0"], GRID["y0"], GRID["size"]
H513 = np.load(DEM / "grid_513.npy").astype(float)
H1025 = np.load(DEM / "grid_1025.npy").astype(float)
BASE_Z = math.floor((META["elev_min_m"] - 400) / 500.0) * 500.0  # plinth floor
ROUTE_RADIUS = 12.0   # m — reads as a 3–4 px line from the story cameras
ROUTE_LIFT = 25.0     # m above the DEM so the tube clears the decimated web terrain
MARKER_SCALE = 8.0    # tents & flag are drawn 8× real size so they read at km range


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def height(x, y):
    sp = GRID["spacing_hi"]
    n = H1025.shape[0]
    fi = min(max((x - X0) / sp, 0), n - 1.000001)
    fj = min(max((y - Y0) / sp, 0), n - 1.000001)
    i, j = int(fi), int(fj)
    tx, ty = fi - i, fj - j
    h = H1025
    return (h[j, i] * (1 - tx) * (1 - ty) + h[j, i + 1] * tx * (1 - ty)
            + h[j + 1, i] * (1 - tx) * ty + h[j + 1, i + 1] * tx * ty)


def repair(mesh, label):
    t = time.time()
    before = (mesh.CountPoints, mesh.CountFacets, mesh.hasNonManifolds())
    mesh.removeDuplicatedPoints()
    mesh.removeDuplicatedFacets()
    mesh.fixDegenerations(1e-6)
    mesh.fixIndices()
    mesh.removeNonManifolds()
    mesh.removeNonManifoldPoints()
    mesh.fillupHoles(20, 0)  # small holes only — never cap the open terrain border
    mesh.harmonizeNormals()
    if mesh.Facets[0].Normal.z < 0:
        mesh.flipNormals()
    log(f"{label}: points/facets/non-manifold {before} → "
        f"({mesh.CountPoints}, {mesh.CountFacets}, {mesh.hasNonManifolds()}) in {time.time() - t:.1f}s")
    return mesh


def simplify(pl, tol):
    """Ramer–Douglas–Peucker on a polyline of Vectors (keeps closed loops closed)."""
    if len(pl) < 3:
        return pl
    a, b = pl[0], pl[-1]
    ab = b - a
    L = ab.Length
    if L < 1e-9:  # closed loop: split at the farthest point
        k = max(range(len(pl)), key=lambda i: (pl[i] - a).Length)
        if k in (0, len(pl) - 1):
            return pl
        return simplify(pl[:k + 1], tol)[:-1] + simplify(pl[k:], tol)
    d = [((p - a).cross(ab)).Length / L for p in pl]
    k = max(range(1, len(pl) - 1), key=lambda i: d[i])
    if d[k] <= tol:
        return [a, b]
    return simplify(pl[:k + 1], tol)[:-1] + simplify(pl[k:], tol)


def write_lines_obj(path, polylines, header, mesh=None):
    """OBJ with optional triangles + 'l' polylines (Mesh.write can't export polylines)."""
    with open(path, "w") as f:
        f.write(f"# {header}\n# units: metres; +X east, +Y north, +Z up\n")
        off = 0
        if mesh is not None:
            for p in mesh.Points:
                f.write(f"v {p.x:.3f} {p.y:.3f} {p.z:.3f}\n")
            for fc in mesh.Topology[1]:
                f.write(f"f {fc[0] + 1} {fc[1] + 1} {fc[2] + 1}\n")
            off = mesh.CountPoints
        for pl in polylines:
            for p in pl:
                f.write(f"v {p.x:.3f} {p.y:.3f} {p.z:.3f}\n")
            f.write("l " + " ".join(str(off + k + 1) for k in range(len(pl))) + "\n")
            off += len(pl)


def shape_to_obj(shape, path, lin=2.0, ang=0.35):
    m = MeshPart.meshFromShape(Shape=shape, LinearDeflection=lin, AngularDeflection=ang, Relative=False)
    m.write(str(path))
    return m


def add_mesh(doc, name, mesh, label=None):
    o = doc.addObject("Mesh::Feature", name)
    o.Mesh = mesh
    o.Label = label or name
    return o


def add_part(doc, name, shape, label=None):
    o = doc.addObject("Part::Feature", name)
    o.Shape = shape
    o.Label = label or name
    return o


def main():
    doc = App.newDocument("K2_Master")

    # 1 · Terrain --------------------------------------------------------------
    t512 = repair(Mesh.Mesh(str(DEM / "k2_heightfield_512.obj")), "Terrain 512")
    add_mesh(doc, "Terrain", t512, "Terrain (Copernicus GLO-30, 512 grid)")
    t512.write(str(EXP / "terrain.obj"))
    t1024 = repair(Mesh.Mesh(str(DEM / "k2_heightfield_1024.obj")), "Terrain 1024")
    t1024.write(str(EXP / "terrain_1024.obj"))
    del t1024

    # 2 · Plinth: skirt walls + floor, with 500 m contour lines on the four sides ------
    n = H513.shape[0]
    sp = GRID["spacing_lo"]
    xs = X0 + np.arange(n) * sp
    ys = Y0 + np.arange(n) * sp
    sides = {  # boundary profiles walked counter-clockwise seen from above
        "south": [(xs[i], Y0, H513[0, i]) for i in range(n)],
        "east": [(X0 + SIZE, ys[j], H513[j, -1]) for j in range(n)],
        "north": [(xs[i], Y0 + SIZE, H513[-1, i]) for i in range(n - 1, -1, -1)],
        "west": [(X0, ys[j], H513[j, 0]) for j in range(n - 1, -1, -1)],
    }
    tris = []
    for prof in sides.values():
        for (xa, ya, za), (xb, yb, zb) in zip(prof[:-1], prof[1:]):
            a, b = V(xa, ya, za), V(xb, yb, zb)
            a0, b0 = V(xa, ya, BASE_Z), V(xb, yb, BASE_Z)
            tris += [[a0, b0, b], [a0, b, a]]  # outward-facing for a CCW walk
    c = [V(X0, Y0, BASE_Z), V(X0 + SIZE, Y0, BASE_Z), V(X0 + SIZE, Y0 + SIZE, BASE_Z), V(X0, Y0 + SIZE, BASE_Z)]
    tris += [[c[0], c[2], c[1]], [c[0], c[3], c[2]]]  # floor faces down
    plinth = Mesh.Mesh(tris)
    plinth.removeDuplicatedPoints()
    add_mesh(doc, "Plinth", plinth, f"Plinth (floor at {BASE_Z:.0f} m)")

    side_lines = []
    out_n = {"south": (0, -1), "east": (1, 0), "north": (0, 1), "west": (-1, 0)}
    for side, prof in sides.items():
        ox, oy = out_n[side][0] * 1.0, out_n[side][1] * 1.0  # 1 m proud of the wall
        for lev in np.arange(BASE_Z + 500, META["elev_max_m"], 500):
            run = []
            for (xa, ya, za) in prof:
                if za > lev + 1:
                    run.append(V(xa + ox, ya + oy, lev))
                elif len(run) > 1:
                    side_lines.append(run)
                    run = []
                else:
                    run = []
            if len(run) > 1:
                side_lines.append(run)
    add_part(doc, "Plinth_SideContours",
             Part.makeCompound([Part.makePolygon(pl) for pl in side_lines]), "Plinth side contours (500 m)")
    write_lines_obj(EXP / "plinth.obj", side_lines, "Plinth (skirt + floor) with 500 m side contours", plinth)
    log(f"Plinth: {plinth.CountFacets} facets, {len(side_lines)} side contour runs, floor {BASE_Z:.0f} m")

    # 3 · Contours every 500 m, 5,000–8,500 m --------------------------------------
    levels = list(range(5000, 8501, 500))
    secs = t512.crossSections([(V(0, 0, lev), V(0, 0, 1)) for lev in levels], 1e-3, True)
    contour_lines, wires = [], []
    raw_pts = 0
    for lev, polys in zip(levels, secs):
        for pl in polys:
            if len(pl) > 2:
                raw_pts += len(pl)
                pl = simplify(list(pl), 6.0)  # 6 m tolerance — invisible at story-camera range
                if len(pl) > 2:
                    contour_lines.append(pl)
                    wires.append(Part.makePolygon(pl))
    add_part(doc, "Contours", Part.makeCompound(wires), "Contours 5,000–8,500 m (500 m)")
    write_lines_obj(EXP / "contours.obj", contour_lines, "Contours every 500 m, 5000-8500 m (from Terrain 512)")
    log(f"Contours: {len(contour_lines)} polylines over {len(levels)} levels, "
        f"{raw_pts:,} → {sum(len(p) for p in contour_lines):,} points after RDP")

    # 4/5 · Route tubes --------------------------------------------------------------
    # One long sweep fails on the zig-zags of a crest-traced path, so the spine is swept
    # in ~0.9 km chunks (B-spline approximation, 5 m tolerance) joined by spheres.
    for key, name in (("abruzzi", "Route_Abruzzi"), ("cesen", "Route_Cesen")):
        pl = np.array(WAY["routes"][key]["polyline"])[::3]  # ~45 m spacing
        pts = [V(x, y, height(x, y) + ROUTE_LIFT) for x, y, _ in pl]
        t = time.time()
        parts, swept, fallback = [], 0, 0
        chunk = 20
        starts = list(range(0, len(pts) - 1, chunk - 1))
        for a in starts:
            seg = pts[a:a + chunk]
            if len(seg) < 2:
                continue
            try:
                if len(seg) < 4:
                    raise RuntimeError("short")
                cv = Part.BSplineCurve()
                cv.approximate(Points=seg, DegMin=3, DegMax=3, Tolerance=5.0)
                spine = Part.Wire(cv.toShape())
                e = spine.Edges[0]
                ring = Part.Wire(Part.makeCircle(ROUTE_RADIUS, e.valueAt(e.FirstParameter), e.tangentAt(e.FirstParameter)))
                sh = spine.makePipeShell([ring], False, True)
                if not sh.isValid():
                    raise RuntimeError("invalid")
                parts.append(sh)
                swept += 1
            except Exception:
                fallback += 1
                for q0, q1 in zip(seg[:-1], seg[1:]):
                    if (q1 - q0).Length > 0.1:
                        parts.append(Part.makeCylinder(ROUTE_RADIUS, (q1 - q0).Length, q0, q1 - q0).Faces[0])
            if a > 0:
                parts.append(Part.makeSphere(ROUTE_RADIUS, seg[0]))
        tube = Part.makeCompound(parts)
        o = add_part(doc, name, tube, WAY["routes"][key]["name"])
        shape_to_obj(o.Shape, EXP / f"route_{key}.obj", lin=2.5, ang=0.6)
        log(f"{name}: {len(pts)} spine pts, {swept} swept chunks, {fallback} cylinder fallbacks, {time.time() - t:.1f}s")

    # 6 · Camps: wedge tents (marker scale) ----------------------------------------------
    W, L, H = 3.0 * MARKER_SCALE, 4.0 * MARKER_SCALE, 1.8 * MARKER_SCALE
    tents = []
    camp_ids = []
    for key in ("abruzzi", "cesen"):
        for cpt in WAY["routes"][key]["camps"]:
            if cpt["kind"] != "camp":
                continue
            x, y = cpt["x"], cpt["y"]
            zc = height(x, y) - 0.5
            prof = Part.makePolygon([V(-W / 2, -L / 2, 0), V(W / 2, -L / 2, 0), V(0, -L / 2, H), V(-W / 2, -L / 2, 0)])
            tent = Part.Face(prof).extrude(V(0, L, 0))
            tent.translate(V(x, y, zc))
            tents.append(tent)
            camp_ids.append(cpt["id"])
    add_part(doc, "Camps", Part.makeCompound(tents), f"Camps ({', '.join(camp_ids)})")
    shape_to_obj(Part.makeCompound(tents), EXP / "camps.obj", lin=0.5)
    log(f"Camps: {len(tents)} tents")

    # 7 · Summit flag ------------------------------------------------------------------------
    zs = height(0, 0)
    pole_h = 3.0 * MARKER_SCALE
    pole = Part.makeCylinder(0.05 * MARKER_SCALE, pole_h, V(0, 0, zs - 0.5))
    cloth = Part.makeBox(1.6 * MARKER_SCALE, 0.04 * MARKER_SCALE, 1.0 * MARKER_SCALE,
                         V(0.05 * MARKER_SCALE, 0, zs - 0.5 + pole_h - 1.0 * MARKER_SCALE))
    flag = pole.fuse(cloth)
    add_part(doc, "Summit_Flag", flag, "Summit flag (marker scale)")
    shape_to_obj(flag, EXP / "summit_flag.obj", lin=0.2)

    # 8 · Cross-section slab through the summit along the SE ridge -----------------------
    c1 = next(c for c in WAY["routes"]["abruzzi"]["camps"] if c["id"] == "camp-1")
    d = np.array([c1["x"], c1["y"]]) / math.hypot(c1["x"], c1["y"])  # summit → SE ridge
    half = 7000.0
    ts = np.arange(-half, half + 1, 36.0)
    prof = [V(t * d[0], t * d[1], height(t * d[0], t * d[1])) for t in ts]
    poly = prof + [V(half * d[0], half * d[1], BASE_Z), V(-half * d[0], -half * d[1], BASE_Z), prof[0]]
    face = Part.Face(Part.makePolygon(poly))
    thick = 40.0
    nrm = V(-d[1], d[0], 0)
    slab = face.extrude(nrm * thick)
    slab.translate(nrm * (-thick / 2))
    o = add_part(doc, "Section_Slab", slab, "Section through summit along SE ridge (NW–SE)")
    o.addProperty("App::PropertyString", "Azimuth", "K2").Azimuth = f"{math.degrees(math.atan2(d[0], d[1])):.1f}° (toward SE)"
    shape_to_obj(slab, EXP / "section_slab.obj", lin=1.0)
    log(f"Section slab: {len(ts)} profile samples, azimuth {o.Azimuth}")

    doc.recompute()
    fc = OUT / "K2_Master.FCStd"
    doc.saveAs(str(fc))
    log(f"saved {fc} ({fc.stat().st_size / 1e6:.1f} MB); objects: {[o.Name for o in doc.Objects]}")
    (OUT / "build_summary.json").write_text(json.dumps({
        "objects": [{"name": o.Name, "label": o.Label, "type": o.TypeId} for o in doc.Objects],
        "plinth_floor_m": BASE_Z, "route_radius_m": ROUTE_RADIUS, "route_lift_m": ROUTE_LIFT,
        "marker_scale": MARKER_SCALE, "units": "1 FreeCAD unit = 1 metre",
    }, indent=2))


main()
