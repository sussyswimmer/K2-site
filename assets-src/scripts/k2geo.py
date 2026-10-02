"""Shared geometry helpers for the K2 terrain pipeline (k2 venv: numpy, pyproj, rasterio).

Coordinate system used everywhere in assets-src (FreeCAD + Blender, Z-up):
  1 unit = 1 metre, +X = east, +Y = true north, +Z = elevation (EGM2008 ≈ sea level),
  horizontal origin = the DEM summit of K2.
glTF / three.js (Y-up) is the same frame rotated: x = X, y = Z (elevation), z = -Y (south).

Projection: local transverse Mercator centred on the DEM summit, so grid north = true
north (UTM 43N grid north is ~0.9° off here). Scale error < 0.002 % over the model.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
DEM_DIR = ROOT / "assets-src" / "dem"
DATA_DIR = ROOT / "assets-src" / "data"
META_PATH = DATA_DIR / "terrain_meta.json"

VERTICAL_EXAGGERATION = 1.0

# Grid: vertices every 36 m (1025 x 1025 → 1024 x 1024 quads); the 513 grid takes
# every second vertex (72 m). X0/Y0 are multiples of 72 so the summit (0, 0) is a
# vertex of both grids.
SPACING_HI = 36.0
N_HI = 1025
X0, Y0 = -18_000.0, -24_480.0
SIZE = SPACING_HI * (N_HI - 1)  # 36,864 m
X1, Y1 = X0 + SIZE, Y0 + SIZE


def load_meta() -> dict:
    return json.loads(META_PATH.read_text())


def transformers(lat0: float, lon0: float):
    proj = f"+proj=tmerc +lat_0={lat0} +lon_0={lon0} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
    to_local = Transformer.from_crs("EPSG:4326", proj, always_xy=True)
    to_geo = Transformer.from_crs(proj, "EPSG:4326", always_xy=True)
    return proj, to_local, to_geo


class Terrain:
    """Bilinear sampler over the saved 1025² height grid (local metres)."""

    def __init__(self, grid: np.ndarray | None = None):
        if grid is None:
            grid = np.load(DEM_DIR / "grid_1025.npy")
        self.h = grid  # h[j, i], j = north index (0 = Y0, south edge), i = east index

    def height(self, x, y):
        x = np.asarray(x, dtype=float)
        y = np.asarray(y, dtype=float)
        fi = np.clip((x - X0) / SPACING_HI, 0, N_HI - 1.000001)
        fj = np.clip((y - Y0) / SPACING_HI, 0, N_HI - 1.000001)
        i0 = np.floor(fi).astype(int)
        j0 = np.floor(fj).astype(int)
        tx, ty = fi - i0, fj - j0
        h = self.h
        return (h[j0, i0] * (1 - tx) * (1 - ty) + h[j0, i0 + 1] * tx * (1 - ty)
                + h[j0 + 1, i0] * (1 - tx) * ty + h[j0 + 1, i0 + 1] * tx * ty)


def write_obj(path: Path, verts: np.ndarray, faces: np.ndarray, uvs: np.ndarray | None = None,
              header: str = "") -> None:
    """Fast OBJ writer. faces are 0-based int triangles; UV index == vertex index."""
    with open(path, "w") as f:
        if header:
            f.write("".join(f"# {line}\n" for line in header.splitlines()))
        np.savetxt(f, verts, fmt="v %.3f %.3f %.3f")
        if uvs is not None:
            np.savetxt(f, uvs, fmt="vt %.6f %.6f")
            fi = faces + 1
            np.savetxt(f, np.repeat(fi, 2, axis=1), fmt="f %d/%d %d/%d %d/%d")
        else:
            np.savetxt(f, faces + 1, fmt="f %d %d %d")


def grid_mesh(h: np.ndarray, spacing: float):
    """Triangulate a height grid h[j, i] (j north, i east) into verts/faces/uvs (Z-up)."""
    n = h.shape[0]
    ii, jj = np.meshgrid(np.arange(n), np.arange(n))
    x = X0 + ii * spacing
    y = Y0 + jj * spacing
    verts = np.column_stack([x.ravel(), y.ravel(), (h * VERTICAL_EXAGGERATION).ravel()])
    uvs = np.column_stack([((x - X0) / SIZE).ravel(), ((y - Y0) / SIZE).ravel()])
    idx = np.arange(n * n).reshape(n, n)
    a = idx[:-1, :-1].ravel()
    b = idx[:-1, 1:].ravel()
    c = idx[1:, 1:].ravel()
    d = idx[1:, :-1].ravel()
    # CCW seen from +Z (east = +i, north = +j)
    faces = np.concatenate([np.column_stack([a, b, c]), np.column_stack([a, c, d])])
    return verts, faces, uvs
