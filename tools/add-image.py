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

OWNER = "Tea Rex Woodworks, LLC"
SIZES = (700, 1400)          # longest edge, px
QUALITY = 80
LOGO_OPACITY = 0.32          # of the white logo laid across the photo
LOGO_FILL = 0.92             # logo size, as a share of the photo's short edge
TEXT_OPACITY = 0.6           # of the copyright line through the middle
IMG_DIR = Path(__file__).resolve().parent.parent / "site" / "img"
LOGO = IMG_DIR / "logo-white.png"
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


def logo_mask(diameter):
    """The logo as a greyscale mask, scaled to fit a square of the given size."""
    logo = Image.open(LOGO).convert("RGBA")
    logo.thumbnail((diameter, diameter), Image.LANCZOS)
    return logo.getchannel("A")


def stamp(im):
    """Return a copy of im with the logo across it and the copyright line in the middle."""
    im = im.convert("RGB")
    w, h = im.size
    short, long = min(w, h), max(w, h)

    # One logo per roughly-square stretch, so a tall or wide piece is
    # covered end to end and no crop of it comes out clean.
    count = max(1, round(long / short))
    diameter = round(min(short, long / count) * LOGO_FILL)
    logo = logo_mask(diameter)
    logos = Image.new("L", im.size, 0)
    for i in range(count):
        along = round(long * (i + 0.5) / count)
        cx, cy = (along, h // 2) if w >= h else (w // 2, along)
        logos.paste(logo, (cx - logo.width // 2, cy - logo.height // 2))

    text = f"© {datetime.date.today().year} {OWNER.upper()}"
    size = max(round(short * 0.042), 9)

    def measure(font, tracking):
        return sum(font.getlength(c) for c in text) + tracking * (len(text) - 1)

    font, tracking = load_font(size), size * 0.12
    while measure(font, tracking) > w * 0.92 and size > 6:
        size -= 1
        font, tracking = load_font(size), size * 0.12

    line = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(line)
    x = (w - measure(font, tracking)) / 2
    for c in text:
        d.text((x, h / 2), c, font=font, fill=255, anchor="lm")
        x += font.getlength(c) + tracking

    # Soft dark halo under each layer so the mark reads on pale wood as well as dark.
    for mask, opacity, halo in ((logos, LOGO_OPACITY, 0.5), (line, TEXT_OPACITY, 0.6)):
        blur = max(size * 0.15, 1.5)
        shadow = mask.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: round(v * halo))
        im.paste((0, 0, 0), mask=shadow)
        im.paste((255, 255, 255), mask=mask.point(lambda v: round(v * opacity)))
    return im


def save(im, dest):
    exif = Image.Exif()
    exif[EXIF_COPYRIGHT] = f"Copyright {datetime.date.today().year} {OWNER}"  # EXIF text is ASCII
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
