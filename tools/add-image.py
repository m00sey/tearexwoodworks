#!/usr/bin/env python3
"""Make watermarked gallery images for the site.

New photo (JPEG or PNG) -> site/img/<name>-700.webp and <name>-1400.webp:

    tools/add-image.py photo.jpg walnut-owl

Stamp WebP files that are already in site/img, in place:

    tools/add-image.py --stamp site/img/foo-700.webp site/img/foo-1400.webp

Stamped files carry a copyright tag in their metadata, and a file that has
the tag is never stamped again, so re-running is safe.

Needs Pillow: pip3 install pillow
"""
import argparse
import datetime
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

TEXT = "© TEA REX WOODWORKS"
OWNER = "Tea Rex Woodworks, LLC"
SIZES = (700, 1400)          # longest edge, px
QUALITY = 80
OPACITY = 0.62               # of the white lettering
IMG_DIR = Path(__file__).resolve().parent.parent / "site" / "img"
EXIF_COPYRIGHT = 0x8298

# First one found wins. The last resort is Pillow's built-in font.
FONTS = (
    ("/System/Library/Fonts/Supplemental/Futura.ttc", 0),
    ("/System/Library/Fonts/Helvetica.ttc", 1),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 0),
    ("C:/Windows/Fonts/arialbd.ttf", 0),
)


def load_font(size):
    for path, index in FONTS:
        try:
            return ImageFont.truetype(path, size, index=index)
        except OSError:
            continue
    return ImageFont.load_default(size)


def is_stamped(im):
    return bool(im.getexif().get(EXIF_COPYRIGHT))


def stamp(im):
    """Return a copy of im with the watermark in the bottom-right corner."""
    im = im.convert("RGB")
    w, h = im.size
    # Sized off the width, but kept readable on tall narrow pieces.
    size = max(round(w * 0.02), round(max(w, h) * 0.016), 10)
    tracking = size * 0.12

    def measure(font):
        return sum(font.getlength(c) for c in TEXT) + tracking * (len(TEXT) - 1)

    font = load_font(size)
    while measure(font) > w * 0.9 and size > 6:
        size -= 1
        font = load_font(size)
        tracking = size * 0.12

    margin = round(size * 1.1)
    x = w - margin - measure(font)
    y = h - margin - size

    def draw_text(layer, fill):
        d = ImageDraw.Draw(layer)
        cx = x
        for c in TEXT:
            d.text((cx, y), c, font=font, fill=fill)
            cx += font.getlength(c) + tracking

    # Soft dark halo so the mark reads on pale wood as well as dark.
    shadow = Image.new("L", im.size, 0)
    draw_text(shadow, 150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(size * 0.18, 1.5)))
    im.paste((0, 0, 0), mask=shadow)

    text = Image.new("L", im.size, 0)
    draw_text(text, round(255 * OPACITY))
    im.paste((255, 255, 255), mask=text)
    return im


def save(im, dest):
    exif = Image.Exif()
    exif[EXIF_COPYRIGHT] = f"© {datetime.date.today().year} {OWNER}"
    im.save(dest, "WEBP", quality=QUALITY, method=6, exif=exif)


def add(photo, name):
    src = ImageOps.exif_transpose(Image.open(photo))
    outputs = []
    for edge in SIZES:
        dest = IMG_DIR / f"{name}-{edge}.webp"
        if dest.exists():
            sys.exit(f"{dest} already exists. Pick another name (images are cached by filename).")
        im = src.copy()
        im.thumbnail((edge, edge), Image.LANCZOS)
        outputs.append((dest, stamp(im)))
    for dest, im in outputs:
        save(im, dest)
        print(f"wrote {dest}  {im.width}x{im.height}")

    small = outputs[0][1]
    print("\nPaste into the gallery in site/index.html and fill in the blanks:\n")
    print(f"""        <figure class="piece" data-kind="wildlife">
          <button type="button" data-full="img/{name}-{SIZES[1]}.webp"><img src="img/{name}-{SIZES[0]}.webp" alt="DESCRIBE THE PIECE" width="{small.width}" height="{small.height}" loading="lazy"></button>
          <figcaption><strong>TITLE</strong><span>TAG</span></figcaption>
        </figure>""")


def stamp_existing(paths):
    for path in paths:
        im = Image.open(path)
        if is_stamped(im):
            print(f"skip   {path} (already watermarked)")
            continue
        save(stamp(im), path)
        print(f"stamp  {path}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--stamp", action="store_true", help="watermark existing WebP files in place")
    p.add_argument("args", nargs="+", metavar="photo name | files")
    a = p.parse_args()
    if a.stamp:
        stamp_existing(a.args)
    elif len(a.args) == 2:
        add(*a.args)
    else:
        p.error("expected: photo name")


if __name__ == "__main__":
    main()
