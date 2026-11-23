#!/usr/bin/env python3
"""Generate PWA icons from the Zeus portrait (assets/zeus_manga.png).

Outputs (into public/, copied to dist/ root by Vite):
  icon-512.png              512x512  purpose: any
  icon-maskable-512.png     512x512  purpose: maskable (content in 80% safe zone)
  icon-192.png              192x192  purpose: any (+ favicon)
  apple-touch-icon.png      180x180  iOS home screen
"""
import os
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
im = Image.open(os.path.join(root, 'assets/zeus_manga.png')).convert('RGB')
w, h = im.size  # 768 x 1024

# Square crop centred on head + torso (the focal point of the art)
s = 640
cx, cy = w // 2, 390
left, top = cx - s // 2, cy - s // 2
art = im.crop((left, top, left + s, top + s))

BG = (10, 10, 20)  # theme #0a0a14 — blends with the art's storm background

def make(size, inset=0.0):
    icon = Image.new('RGB', (size, size), BG)
    content = int(size * (1 - inset))
    off = (size - content) // 2
    icon.paste(art.resize((content, content), Image.LANCZOS), (off, off))
    return icon

out = os.path.join(root, 'public')
os.makedirs(out, exist_ok=True)
make(512).save(os.path.join(out, 'icon-512.png'))
make(512, 0.20).save(os.path.join(out, 'icon-maskable-512.png'))
make(192).save(os.path.join(out, 'icon-192.png'))
make(180).save(os.path.join(out, 'apple-touch-icon.png'))
print('icons written to public/')
