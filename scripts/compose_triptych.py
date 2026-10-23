#!/usr/bin/env python3
"""Compose a text-free image candidate with a deterministic Kanji glyph stage."""
from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

CANVAS = (1672, 941)
CJK_FONT = "/usr/share/fonts/google-noto-sans-cjk-vf-fonts/NotoSansCJK-VF.ttc"
TEXT_FONT = "/usr/share/fonts/google-noto/NotoSans-Regular.ttf"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("kanji")
    parser.add_argument("caption")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    src = Image.open(args.source).convert("RGB")
    corners = [src.getpixel((0, 0)), src.getpixel((src.width - 1, 0)), src.getpixel((0, src.height - 1)), src.getpixel((src.width - 1, src.height - 1))]
    bg = tuple(sum(color[channel] for color in corners) // len(corners) for channel in range(3))
    # Match the canvas white to this generated image's own paper tone so the
    # cropped illustration blends into the final triptych without a hard patch.
    canvas = Image.new("RGB", CANVAS, bg)
    difference = ImageChops.difference(src, Image.new("RGB", src.size, bg)).convert("L")
    bounds = difference.point(lambda value: 255 if value > 18 else 0).getbbox()
    if bounds:
        left, top, right, bottom = bounds
        pad_x, pad_y = round(src.width * 0.025), round(src.height * 0.045)
        src = src.crop((max(0, left - pad_x), max(0, top - pad_y), min(src.width, right + pad_x), min(src.height, bottom + pad_y)))
    max_w, max_h = 1315, 700
    scale = min(max_w / src.width, max_h / src.height)
    scaled = src.resize((round(src.width * scale), round(src.height * scale)), Image.Resampling.LANCZOS)
    canvas.paste(scaled, (22, 400 - scaled.height // 2))

    # The generated image reserves its rightmost third. Put the exact character there.
    font = ImageFont.truetype(CJK_FONT, 266)
    try:
        font.set_variation_by_name("Black")
    except (AttributeError, OSError):
        pass
    draw = ImageDraw.Draw(canvas)
    bounds = draw.textbbox((0, 0), args.kanji, font=font)
    w, h = bounds[2] - bounds[0], bounds[3] - bounds[1]
    x, y = round(0.848 * CANVAS[0] - w / 2), round(400 - h / 2 - bounds[1])
    draw.text((x, y), args.kanji, font=font, fill=(22, 22, 22))

    caption_font = ImageFont.truetype(TEXT_FONT, 31)
    cb = draw.textbbox((0, 0), args.caption, font=caption_font)
    draw.text(((CANVAS[0] - (cb[2] - cb[0])) / 2, 817), args.caption, font=caption_font, fill=(47, 47, 47))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, quality=94)


if __name__ == "__main__":
    main()
