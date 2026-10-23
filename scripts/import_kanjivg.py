#!/usr/bin/env python3
"""Import the pinned KanjiVG SVGs used by the N4 Kanji Core lessons."""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LESSONS_PATH = ROOT / "data" / "lessons.json"
ASSET_DIR = ROOT / "assets" / "kanji-strokes"
PATH_ID = re.compile(rb'<path\b[^>]*\bid=["\']kvg:[^"\']+-s(\d+)["\']')


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/import_kanjivg.py /path/to/kanjivg-20250816-main.zip")
        return 2

    archive_path = Path(sys.argv[1])
    if not archive_path.is_file():
        print(f"KanjiVG archive not found: {archive_path}")
        return 2

    lessons = json.loads(LESSONS_PATH.read_text(encoding="utf-8"))
    cores = [core for lesson in lessons for core in lesson["core"]]
    characters = sorted({core["kanji"] for core in cores})
    assets: dict[str, tuple[str, bytes, int]] = {}
    missing: list[str] = []

    with zipfile.ZipFile(archive_path) as archive:
        archive_names = set(archive.namelist())
        for character in characters:
            filename = f"{ord(character):05x}.svg"
            archive_name = f"kanji/{filename}"
            if archive_name not in archive_names:
                missing.append(character)
                continue

            svg = archive.read(archive_name)
            indexes = [int(value) for value in PATH_ID.findall(svg)]
            if not indexes or indexes != list(range(1, len(indexes) + 1)):
                raise ValueError(f"Invalid or non-contiguous KanjiVG strokes for {character}: {indexes}")
            assets[character] = (filename, svg, len(indexes))

    if missing:
        print("Missing KanjiVG data for: " + " ".join(missing))
        return 1

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    for filename, svg, _stroke_count in assets.values():
        (ASSET_DIR / filename).write_bytes(svg)

    for core in cores:
        filename, _svg, stroke_count = assets[core["kanji"]]
        core["strokeCount"] = stroke_count
        core.setdefault("media", {})["strokeSvg"] = f"./assets/kanji-strokes/{filename}"

    LESSONS_PATH.write_text(
        json.dumps(lessons, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Imported {len(assets)} SVGs for {len(cores)} Kanji Core records.")
    print(f"Unique stroke counts: {len({count for _, _, count in assets.values()})}")
    print(f"Assets: {ASSET_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
