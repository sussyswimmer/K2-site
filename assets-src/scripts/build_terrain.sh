#!/usr/bin/env bash
# Debrief 1 pipeline: DEM → grids/albedo → routes → FreeCAD → Blender → optimized GLBs.
# Tooling (see public/models/README.md): /opt/k2venv (rasterio, pyproj, numpy, scipy, pillow),
# /opt/mm/envs/fc (FreeCAD 1.1.3, conda-forge), apt blender 4.0 + python3-numpy, npm devDeps.
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=${K2_PY:-/opt/k2venv/bin/python}
FC=${K2_FREECAD:-/opt/mm/envs/fc/bin/freecadcmd}
export LANG=C.UTF-8 LC_ALL=C.UTF-8 PYTHONIOENCODING=utf-8 QT_QPA_PLATFORM=offscreen K2_ROOT="$PWD"

(cd assets-src/scripts && "$PY" 01_fetch_dem.py && "$PY" 02_dem_to_mesh.py && "$PY" 02b_routes.py)
"$FC" assets-src/scripts/03_freecad_build.py 2>&1 | tr '\r\t' '\n\n' | grep -E '^\[|Error|Traceback' || true
test -f assets-src/freecad/K2_Master.FCStd
blender -b -P assets-src/scripts/04_blender_scene.py 2>&1 | grep -E '^\[|Error|Traceback'
node assets-src/scripts/05_optimize.mjs
