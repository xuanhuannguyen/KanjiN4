# Kanji Core image candidates

The visual standard uses three horizontal stages on a warm white background. Before generating, identify the Kanji's main component shapes, left-to-right or top-to-bottom order, stroke directions, angles, and interior bars. The real scene must make those relationships visible through the physical edges and placement of its objects; the center pictogram repeats that same geometry with fewer details. Reject an image if its Kanji mapping only works after reading an explanation.

1. A simple 2D real-world scene whose physical shapes directly echo the Kanji's visible layout and angles.
2. A simplified pictogram with the same component order, direction, angle, and number of inner bars.
3. The exact Kanji added deterministically with the local CJK font. ImageGen does not render this glyph.

All two hundred production triptychs cover Lessons 1–20. Their folders keep the generated text-free source and composed PNG preview. Production WebP assets are in `../kanji/` and referenced through `media.hintImage` in `data/lessons.json`. The previous production assets are preserved in `production-v1/`.

The layout/style reference is Hikari N5's `大` image (`docs/learning/raw/kanji/N5/lesson-08/kanji-core/images/kanji-ookii.webp`): one real pose visibly maps to the glyph, a reduced pictogram repeats the same geometry, and the exact glyph closes the sequence. The artwork is newly generated; no reference illustration is copied.
