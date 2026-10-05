#!/usr/bin/env python3
"""Make the banner image, with most of the hero's dark fade baked into the file.

    tools/hero-image.py photo.jpg

Writes site/img/lion-pride-hero.webp, 1400px wide. The banner has no
watermark, so the fade is in the pixels instead: a copy saved from the page
is the darkened one. The rest of the fade is the .hero::after gradient in
site/css/site.css; the two multiply to the full strength, so change them
together.

Needs Pillow: pip3 install pillow
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

DEST = Path(__file__).resolve().parent.parent / "site" / "img" / "lion-pride-hero.webp"
WIDTH = 1400
TINT = (20, 13, 9)
BAKED = 0.6                  # share of the fade that goes into the file; CSS carries the rest
# Full-strength fade, bottom to top: (position, opacity of the tint)
UP = ((0.0, 0.95), (0.38, 0.72), (0.70, 0.18), (1.0, 0.05))
LEFT, LEFT_END = 0.55, 0.60  # second fade, from the left edge to 60% across


def up_alpha(t):
    for (p0, a0), (p1, a1) in zip(UP, UP[1:]):
        if t <= p1:
            return a0 + (a1 - a0) * (t - p0) / (p1 - p0)
    return UP[-1][1]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("RGB")
    im.thumbnail((WIDTH, im.height), Image.LANCZOS)
    w, h = im.size

    # How much of the photo shows through at each pixel, as a greyscale mask.
    rows = [(1 - up_alpha(1 - y / (h - 1))) for y in range(h)]
    cols = [(1 - LEFT * max(0.0, 1 - (x / (w - 1)) / LEFT_END)) for x in range(w)]
    show = Image.new("L", (w, h))
    show.putdata([round(255 * (r * c) ** BAKED) for r in rows for c in cols])

    Image.composite(im, Image.new("RGB", (w, h), TINT), show).save(DEST, "WEBP", quality=82, method=6)
    print(f"wrote {DEST}  {w}x{h}")


if __name__ == "__main__":
    main()
