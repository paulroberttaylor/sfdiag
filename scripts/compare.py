#!/usr/bin/env python3
"""Stack an official diagram above an sfdiag rendering for visual comparison.

usage: python3 scripts/compare.py <official.png> <ours.png> <out.png> [width]
"""
import sys
from PIL import Image, ImageDraw

def main():
    a, b, out = sys.argv[1:4]
    w = int(sys.argv[4]) if len(sys.argv) > 4 else 1600
    imgs = []
    for p in (a, b):
        im = Image.open(p).convert('RGB')
        imgs.append(im.resize((w, round(im.height * w / im.width)), Image.LANCZOS))
    gap = 36
    sheet = Image.new('RGB', (w, imgs[0].height + imgs[1].height + gap * 2), 'white')
    d = ImageDraw.Draw(sheet)
    d.text((8, 10), 'OFFICIAL', fill=(160, 100, 0))
    sheet.paste(imgs[0], (0, gap))
    d.text((8, gap + imgs[0].height + 10), 'SFDIAG', fill=(3, 45, 96))
    sheet.paste(imgs[1], (0, gap * 2 + imgs[0].height))
    sheet.save(out)

if __name__ == '__main__':
    main()
