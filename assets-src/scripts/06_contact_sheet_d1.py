"""Debrief 1 · step 6 — contact sheet of the object renders + Concordia comparison.

  /opt/k2venv/bin/python assets-src/scripts/06_contact_sheet_d1.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
R = ROOT / "assets-src/renders/d1"
OUT = ROOT / "assets-src/renders"

PANELS = [
    ("01_terrain", "1 · Terrain — Copernicus GLO-30, 150k tris, baked albedo + normal"),
    ("02_plinth", "2 · Plinth — skirt to 3,500 m, 500 m side contours"),
    ("03_contours", "3 · Contours every 500 m (5,000–8,500 m)"),
    ("04_routes", "4/5 · Abruzzi (amber) + Cesen (cyan) route tubes"),
    ("05_camps", "6 · Camps (wedge tents, 8× scale) near Base Camp / ABC"),
    ("06_summit_flag", "7 · Summit flag"),
    ("07_section_slab", "8 · Section slab through the summit (NW–SE)"),
]
CAMS = ["CAM_00_Space", "CAM_01_Concordia", "CAM_02_BaseCamp", "CAM_03_AbruzziSpur", "CAM_04_Bottleneck", "CAM_05_Summit"]


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def tile(img, label, w, h):
    t = Image.new("RGB", (w, h + 34), (12, 18, 28))
    t.paste(img.resize((w, h), Image.LANCZOS), (0, 34))
    ImageDraw.Draw(t).text((10, 8), label, fill=(242, 165, 65), font=font(17))
    return t


def sheet(items, cols, w, h, path, title):
    rows = (len(items) + cols - 1) // cols
    s = Image.new("RGB", (cols * (w + 12) + 12, rows * (h + 46) + 70), (6, 10, 18))
    ImageDraw.Draw(s).text((14, 18), title, fill=(220, 235, 250), font=font(26))
    for k, (img, label) in enumerate(items):
        r, c = divmod(k, cols)
        s.paste(tile(img, label, w, h), (12 + c * (w + 12), 64 + r * (h + 46)))
    s.save(path, quality=88)
    print("wrote", path)


def main():
    objs = [(Image.open(R / f"{n}.png").convert("RGB"), lab) for n, lab in PANELS if (R / f"{n}.png").exists()]
    sheet(objs, 2, 640, 360, OUT / "d1_objects_contact_sheet.jpg", "K2 — Debrief 1 · FreeCAD objects, rendered in Blender (Cycles, headless)")
    cams = [(Image.open(R / f"cam_{n}.png").convert("RGB"), n) for n in CAMS if (R / f"cam_{n}.png").exists()]
    sheet(cams, 3, 480, 270, OUT / "d1_camera_waypoints.jpg", "K2 — the six story camera waypoints (CAM_xx → LOOK_xx)")
    ref = ROOT / "assets-src/reference/K2_from_Concordia_-_3.jpg"
    ren = R / "08_concordia_view.png"
    if ref.exists() and ren.exists():
        a = Image.open(ren).convert("RGB")
        b = Image.open(ref).convert("RGB")
        h = 540
        a = a.resize((int(a.width * h / a.height), h), Image.LANCZOS)
        b = b.resize((int(b.width * h / b.height), h), Image.LANCZOS)
        s = Image.new("RGB", (a.width + b.width + 36, h + 110), (6, 10, 18))
        d = ImageDraw.Draw(s)
        d.text((14, 14), "Summit shape check — model vs. photo, both from Concordia", fill=(220, 235, 250), font=font(24))
        s.paste(a, (12, 56)); s.paste(b, (a.width + 24, 56))
        d.text((14, h + 66), "Model: Copernicus GLO-30, camera at Concordia 2 m above the glacier, 85 mm lens", fill=(242, 165, 65), font=font(16))
        d.text((a.width + 26, h + 66), "Photo: \"K2 from Concordia - 3\" by Sallahuddin shah, CC BY-SA 4.0 (Wikimedia Commons)", fill=(242, 165, 65), font=font(16))
        s.save(OUT / "d1_concordia_comparison.jpg", quality=88)
        print("wrote", OUT / "d1_concordia_comparison.jpg")


if __name__ == "__main__":
    main()
