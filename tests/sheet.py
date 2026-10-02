import sys, glob
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
fs = sorted(glob.glob(f"{d}/f*.png"))
W, H = 480, 270
s = Image.new("RGB", (W * 3, H * ((len(fs) + 2) // 3)))
for i, f in enumerate(fs):
    im = Image.open(f).convert("RGB").resize((W, H))
    ImageDraw.Draw(im).text((8, 8), f.split("/")[-1], fill=(255, 200, 80))
    s.paste(im, ((i % 3) * W, (i // 3) * H))
s.save(out, quality=82)
