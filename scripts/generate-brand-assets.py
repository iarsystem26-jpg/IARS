"""Prepare supplied IARS artwork without redrawing it. Requires Pillow."""
import argparse
from pathlib import Path
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('icon', type=Path)
parser.add_argument('wordmark', type=Path)
args = parser.parse_args()
output = Path(__file__).resolve().parents[1] / 'public'

def artwork(path):
    image = Image.open(path).convert('RGBA')
    if image.getchannel('A').getextrema()[0] < 255:
        return image
    # Trim only the surrounding near-white margin; retain the supplied artwork.
    difference = ImageChops.difference(image.convert('RGB'), Image.new('RGB', image.size, 'white'))
    box = difference.convert('L').point(lambda value: 255 if value > 25 else 0).getbbox()
    return image.crop(box) if box else image

icon = artwork(args.icon)
wordmark = artwork(args.wordmark)
wordmark.thumbnail((1200, 600), Image.Resampling.LANCZOS)
wordmark.save(output / 'iars-wordmark.png', optimize=True)
def square(size, inset, path):
    opaque = 'maskable' in path or 'apple-touch' in path or path.endswith('.jpeg')
    canvas = Image.new('RGBA', (size, size), 'white' if opaque else (0, 0, 0, 0))
    image = icon.copy()
    image.thumbnail((int(size * inset), int(size * inset)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(image, ((size-image.width)//2, (size-image.height)//2))
    (canvas.convert('RGB') if path.endswith('.jpeg') else canvas).save(output / path, optimize=True)
square(512, .9, 'iars-icon.png')
for size, inset, filename in [(192,.9,'pwa-192.png'), (512,.9,'pwa-512.png'), (512,.56,'pwa-maskable-512.png'), (180,.9,'apple-touch-icon.png')]:
    square(size, inset, f'icons/{filename}')
# Compatibility paths also contain IARS artwork, so old links cannot display the former seal.
square(512, .9, 'academic-seal-transparent.png')
square(512, .9, 'academic-seal.jpeg')
