#!/usr/bin/env python3
"""Build a small local crosswalk to the 32 Learn Japanese AZ lesson pages.

The source image URLs are research references only. The app generates and ships
its own mnemonic illustrations; it does not hotlink or copy the source images.
"""

from __future__ import annotations

import json
import re
from html import unescape
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LESSONS = DATA / "lessons.json"
DEST = DATA / "kanji-reference-map.json"
BASE = "https://learnjapaneseaz.com/kanji-look-and-learn-lesson-{}.html"


def paragraphs(html: str) -> list[str]:
    return re.findall(r"<p\b[^>]*>(.*?)</p\s*>", html, re.IGNORECASE | re.DOTALL)


def plain_text(markup: str) -> str:
    value = unescape(re.sub(r"<[^>]+>", " ", markup))
    return re.sub(r"\s+", " ", value).strip()


def read_source_pages() -> dict[str, dict[str, object]]:
    entries: dict[str, dict[str, object]] = {}
    heading_pattern = re.compile(
        r"^\s*\d+\s*[,.:]\s*([\u3400-\u9fff々〆ヶヵー])\s*[:：]\s*(.*?)\s*$"
    )

    for lesson_number in range(1, 33):
        url = BASE.format(lesson_number)
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=25) as response:
            html = response.read().decode("utf-8", "replace")
        blocks = paragraphs(html)

        for index, block in enumerate(blocks):
            match = heading_pattern.match(plain_text(block))
            if not match:
                continue
            character, meaning = match.groups()
            image_url = None
            for candidate in blocks[index + 1 : index + 3]:
                if heading_pattern.match(plain_text(candidate)):
                    break
                image_match = re.search(r"<img\b[^>]*\bsrc=[\"']([^\"']+)", candidate, re.IGNORECASE)
                if image_match:
                    image_url = unescape(image_match.group(1))
                    break
            entries[character] = {
                "lesson": lesson_number,
                "meaningEn": meaning,
                "pageUrl": url,
                "illustrationUrl": image_url,
            }
    return entries


def main() -> None:
    lessons = json.loads(LESSONS.read_text(encoding="utf-8"))
    cores = [core for lesson in lessons for core in lesson["core"]]
    entries = read_source_pages()
    characters: dict[str, dict[str, object]] = {}

    for core in cores:
        source = entries.get(core["kanji"])
        item: dict[str, object] = {
            "coreId": core["id"],
            "lesson": core["lesson"],
            "character": core["kanji"],
            "meaningVi": core["meaning"],
            "mnemonicVi": core.get("mnemonic", ""),
            "hintImage": f"./assets/kanji/{core['id']}.webp",
            "source": source,
        }
        if core["kanji"] == "太" and source and source.get("meaningEn", "").lower() == "think":
            item["sourceWarning"] = "Learn Japanese AZ lists 太 as 'think' on Lesson 15; that label appears mismatched. Use the local N4 meaning for this card."
        characters[core["id"]] = item

    output = {
        "source": {
            "name": "Learn Japanese AZ — Kanji Look And Learn",
            "indexUrl": "https://learnjapaneseaz.com/kanji-look-and-learn-n5-n4.html",
            "lessonPagesChecked": 32,
            "uniqueCharactersFound": len(entries),
            "note": "Use page meanings and diagrams as learning references. Shipped illustrations are newly generated, text-free mnemonic candidates, not copies of source images.",
        },
        "characters": characters,
    }
    DEST.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    matched = sum(bool(item["source"] and item["source"].get("illustrationUrl")) for item in characters.values())
    missing = [item["character"] for item in characters.values() if not item["source"]]
    print(f"Wrote {DEST.relative_to(ROOT)}: {len(characters)} Kanji Core; {matched} illustrated source matches; no source entry: {', '.join(missing)}")


if __name__ == "__main__":
    main()
