"""Generates the PWA icons in web/icons from assets/oscLogo.png.
Usage: python pwa/tools/gen-icons.py   (needs Pillow)"""
from pathlib import Path
from PIL import Image, ImageChops

root = Path(__file__).resolve().parent.parent
logo = Image.open(root / 'assets' / 'oscLogo.png').convert('RGBA')
black = Image.new('RGBA', logo.size, (0, 0, 0, 255))
flat = Image.alpha_composite(black, logo).convert('RGB')

bg = flat.getpixel((0, 0))  # the logo's "black" is not pure black; match it so no box shows
print('logo background', '#%02x%02x%02x' % bg)

# crop to the artwork so the sizing below is relative to the visible logo, not the margins
bbox = ImageChops.difference(flat, Image.new('RGB', flat.size, bg)).convert('L').point(lambda v: 255 if v > 40 else 0).getbbox()
art = flat.crop(bbox)


def icon(size, width_fraction):
    canvas = Image.new('RGB', (size, size), bg)
    scale = size * width_fraction / art.width
    resized = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


out = root / 'web' / 'icons'
out.mkdir(parents=True, exist_ok=True)
icon(192, 0.78).save(out / 'icon-192.png', optimize=True)
icon(512, 0.78).save(out / 'icon-512.png', optimize=True)
# maskable: keep everything inside the central 60 % (Android masks up to a 40 % radius circle)
icon(512, 0.56).save(out / 'icon-maskable-512.png', optimize=True)
icon(180, 0.78).save(out / 'apple-touch-icon.png', optimize=True)
icon(64, 0.9).save(out / 'favicon-64.png', optimize=True)
print('icons written to', out)
