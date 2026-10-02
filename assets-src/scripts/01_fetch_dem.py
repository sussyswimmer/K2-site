"""Debrief 1 · step 1 — fetch Copernicus GLO-30 and crop it to the K2 area.

Source: Copernicus DEM GLO-30 (public), tile N35/E076, from the AWS Open Data
registry (https://registry.opendata.aws/copernicus-dem). Vertical datum EGM2008,
horizontal WGS84. The tile is ~40 MB and is gitignored; the crop is committed.

Run with the k2 venv:  /opt/k2venv/bin/python assets-src/scripts/01_fetch_dem.py
"""
from pathlib import Path
import urllib.request

import numpy as np
import rasterio
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[2]
DEM_DIR = ROOT / "assets-src" / "dem"
RAW = DEM_DIR / "raw_N35_E076.tif"
OUT = DEM_DIR / "k2_dem.tif"
TILE_URL = (
    "https://copernicus-dem-30m.s3.amazonaws.com/"
    "Copernicus_DSM_COG_10_N35_00_E076_00_DEM/"
    "Copernicus_DSM_COG_10_N35_00_E076_00_DEM.tif"
)

# Debrief bbox was lat 35.75–36.00 / lon 76.38–76.68; extended south and west so
# Concordia, the Gasherbrums and the lower Baltoro are inside with margin.
BBOX = dict(west=76.28, south=35.65, east=76.74, north=36.00)

# Nominal summit (Debrief 1) — the DEM maximum near here becomes the model origin.
K2_NOMINAL = (35.8825, 76.5133)  # lat, lon
K2_SURVEY_HEIGHT = 8611.0


def main() -> None:
    DEM_DIR.mkdir(parents=True, exist_ok=True)
    if not RAW.exists():
        print(f"downloading {TILE_URL}")
        urllib.request.urlretrieve(TILE_URL, RAW)

    with rasterio.open(RAW) as src:
        win = from_bounds(BBOX["west"], BBOX["south"], BBOX["east"], BBOX["north"], transform=src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win)
        transform = src.window_transform(win)
        profile = src.profile.copy()
        profile.update(
            driver="GTiff", height=data.shape[0], width=data.shape[1],
            transform=transform, compress="deflate", predictor=3, tiled=True,
            blockxsize=256, blockysize=256,
        )

    with rasterio.open(OUT, "w", **profile) as dst:
        dst.write(data, 1)
        dst.update_tags(
            SOURCE="Copernicus DEM GLO-30, tile N35_00_E076_00",
            SOURCE_URL=TILE_URL,
            VERTICAL_DATUM="EGM2008",
            CREDIT=(
                "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus "
                "Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European "
                "Union and ESA; all rights reserved"
            ),
        )

    # Summit check: highest DEM cell within ~600 m of the nominal summit.
    rows, cols = np.indices(data.shape)
    lon = transform.c + (cols + 0.5) * transform.a
    lat = transform.f + (rows + 0.5) * transform.e
    d_m = np.hypot((lat - K2_NOMINAL[0]) * 110_950,
                   (lon - K2_NOMINAL[1]) * 111_320 * np.cos(np.radians(K2_NOMINAL[0])))
    near = np.where(d_m < 600, data, -np.inf)
    r, c = np.unravel_index(np.argmax(near), data.shape)
    print(f"crop: {data.shape[1]}x{data.shape[0]} px, {data.min():.0f}–{data.max():.0f} m → {OUT.relative_to(ROOT)}")
    print(f"DEM summit: {data[r, c]:.1f} m at lat {lat[r, c]:.5f}, lon {lon[r, c]:.5f} "
          f"({d_m[r, c]:.0f} m from nominal); survey height {K2_SURVEY_HEIGHT:.0f} m, "
          f"diff {data[r, c] - K2_SURVEY_HEIGHT:+.1f} m")


if __name__ == "__main__":
    main()
