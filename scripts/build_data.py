#!/usr/bin/env python3
"""Convert the supplied 20-lesson Markdown into browser-ready JSON."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "kanji_n4_tong_hop_20_bai.md"
DEST = ROOT / "data" / "lessons.json"
REFERENCE_MAP = ROOT / "data" / "kanji-reference-map.json"
STROKE_ASSETS = ROOT / "assets" / "kanji-strokes"
STROKE_PATH_ID = re.compile(rb'<path\b[^>]*\bid=["\']kvg:[^"\']+-s(\d+)["\']')

FIRST_LESSON_MNEMONICS = {
    "住": "Người 亻 có một mái nhà để làm chủ 主 — đó là nơi mình sống.",
    "所": "Một cánh cửa 戸 mở ra một nơi chốn để ta bước vào.",
    "京": "Hãy hình dung những mái nhà xếp quanh tháp lớn của kinh đô.",
    "都": "Nơi tập trung người dân và phố xá — một đô thị, thủ đô.",
    "府": "Tòa nhà rộng của chính quyền phủ, nơi giấy tờ được lưu giữ.",
    "県": "Một vùng đất được chia ranh giới để quản lý: tỉnh.",
    "市": "Những quầy hàng tụ họp trên phố thành một khu chợ, một thành phố.",
    "区": "Một đường ranh chia đô thị thành từng khu vực nhỏ.",
    "町": "Một con phố có nhà cửa hai bên — thị trấn hoặc khu phố.",
    "村": "Những mái nhà nhỏ quây quanh một cộng đồng làng quê.",
}


def clean(value: str) -> str:
    value = re.sub(r"\*\*(.*?)\*\*", r"\1", value)
    value = re.sub(r"`([^`]*)`", r"\1", value)
    return re.sub(r"\s+", " ", value).strip()


def rows(section: str, header_prefix: str) -> list[list[str]]:
    lines = section.splitlines()
    start = next((i for i, line in enumerate(lines) if line.lstrip().startswith("|") and header_prefix in line), None)
    if start is None:
        return []
    result = []
    for line in lines[start + 1 :]:
        line = line.strip()
        if not line.startswith("|"):
            if result:
                break
            continue
        cells = [clean(cell) for cell in line.strip("|").split("|")]
        if cells and all(re.fullmatch(r"[-: ]+", cell or "-") for cell in cells):
            continue
        result.append(cells)
    return result


def section_between(text: str, start: str, end: str | None) -> str:
    start_at = text.find(start)
    if start_at < 0:
        return ""
    end_at = text.find(end, start_at + len(start)) if end else -1
    return text[start_at : end_at if end_at >= 0 else len(text)]


def split_readings(value: str) -> list[dict[str, object]]:
    if not value or value.strip() in {"—", "-"}:
        return []
    readings = [part.strip().replace("(", "").replace(")", "") for part in re.split(r"[、，,／/・]", value) if part.strip()]
    return [{"text": reading, "isPrimary": index == 0} for index, reading in enumerate(readings)]


def split_meanings(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"[;；]", value) if part.strip()]


def add_hikari_fields(lessons: list[dict]) -> None:
    """Add Hikari-shaped canonical records while retaining UI aliases."""
    cores = [core for lesson in lessons for core in lesson["core"]]
    cores_by_char = {core["kanji"]: core for core in cores}

    for lesson in lessons:
        lesson["key"] = f"lesson-n4-{lesson['number']:02d}"
        lesson["levelKey"] = "level-n4"
        lesson["titleVi"] = lesson["title"]
        lesson["titleEn"] = ""
        lesson["order"] = lesson["number"]
        for core in lesson["core"]:
            core["key"] = f"kanji-n4-{core['id']}"
            core["character"] = core["kanji"]
            core["meaningVi"] = split_meanings(core["meaning"])
            core["meaningEn"] = [core["referenceMeaning"]] if core.get("referenceMeaning") else []
            stroke_filename = f"{ord(core['kanji']):05x}.svg"
            stroke_path = STROKE_ASSETS / stroke_filename
            stroke_indexes = [int(value) for value in STROKE_PATH_ID.findall(stroke_path.read_bytes())] if stroke_path.is_file() else []
            stroke_count = len(stroke_indexes) if stroke_indexes == list(range(1, len(stroke_indexes) + 1)) and stroke_indexes else None
            core["strokeCount"] = stroke_count
            core["radicalKey"] = None
            core["mnemonicEn"] = ""
            # Component claims stay empty until IDS and component meanings are verified.
            core["mnemonicType"] = "shape"
            core["readings"] = {"on": split_readings(core.get("on", "")), "kun": split_readings(core.get("kun", ""))}
            core["components"] = []
            core["formalDecomposition"] = None
            core["componentConfidence"] = None
            core["componentSources"] = []
            core["mnemonicMeaningSources"] = []
            core["media"] = {
                "strokeSvg": f"./assets/kanji-strokes/{stroke_filename}" if stroke_count else None,
                "hintImage": core.get("hintImage"),
            }
            core["status"] = "draft"

    for lesson in lessons:
        for vocab in lesson["vocab"]:
            vocab["key"] = f"vocab-n4-{vocab['id']}"
            vocab["meaningsVi"] = split_meanings(vocab["meaning"])
            vocab["meaningsEn"] = []
            vocab["partOfSpeech"] = None
            links = []
            occurrence_count: dict[str, int] = {}
            for character_index, character in enumerate(vocab["word"]):
                core = cores_by_char.get(character)
                if not core:
                    continue
                occurrence_count[character] = occurrence_count.get(character, 0) + 1
                links.append({
                    "kanjiKey": core["key"],
                    "occurrenceOrder": occurrence_count[character],
                    "characterIndex": character_index,
                })
            vocab["kanjiLinks"] = links
            vocab["readingParts"] = []
            vocab["pitchAccent"] = None
            vocab["examples"] = []
            vocab["media"] = {"audio": None}
            vocab["status"] = "draft"
            vocab["revision"] = 1

def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    blocks = re.split(r"(?=^## Kanji N4\s+–\s+Bài\s+\d+)", source, flags=re.MULTILINE)
    lessons: list[dict] = []

    for block in blocks:
        heading = re.search(r"^## Kanji N4\s+–\s+Bài\s+(\d+):\s*(.+)$", block, re.MULTILINE)
        if not heading:
            continue
        lesson_number = int(heading.group(1))
        title = clean(heading.group(2))
        core_section = section_between(block, "### 1. Kanji Core", "### 2.")
        mnemonic_section = section_between(block, "### 2. Mẹo ghi nhớ", "### 3.")
        vocab_heading = re.search(r"^###\s+\d+\.\s+Kanji Vocab", block, re.MULTILINE)
        if vocab_heading:
            vocab_end = re.search(r"^###\s+\d+\.", block[vocab_heading.end() :], re.MULTILINE)
            vocab_section = block[vocab_heading.start() : vocab_heading.end() + vocab_end.start()] if vocab_end else block[vocab_heading.start() :]
        else:
            vocab_section = ""

        core_rows = rows(core_section, "Kanji | Âm Hán")
        mnemonic_rows = rows(mnemonic_section, "| Kanji |")
        mnemonic_by_char = {row[0]: row[1] for row in mnemonic_rows if len(row) >= 2}
        core: list[dict] = []
        for index, row in enumerate(core_rows, 1):
            if len(row) < 6:
                continue
            character = row[1]
            core.append(
                {
                    "id": f"lesson-{lesson_number:02d}-core-{index:02d}",
                    "kanji": character,
                    "hanViet": row[2],
                    "meaning": row[3],
                    "on": row[4],
                    "kun": row[5],
                    "mnemonic": mnemonic_by_char.get(character, "") or FIRST_LESSON_MNEMONICS.get(character, ""),
                    "lesson": lesson_number,
                    "vocabIds": [],
                }
            )

        vocab_rows = rows(vocab_section, "Từ vựng | Cách đọc")
        vocab: list[dict] = []
        for index, row in enumerate(vocab_rows, 1):
            if len(row) < 4:
                continue
            vocab.append(
                {
                    "id": f"lesson-{lesson_number:02d}-vocab-{index:03d}",
                    "word": row[1],
                    "reading": row[2],
                    "meaning": row[3],
                    "lesson": lesson_number,
                    "coreIds": [],
                }
            )

        lessons.append(
            {
                "id": f"lesson-{lesson_number:02d}",
                "number": lesson_number,
                "title": title,
                "core": core,
                "vocab": vocab,
            }
        )

    all_core = [item for lesson in lessons for item in lesson["core"]]
    cores_for_char: dict[str, list[dict]] = {}
    for core in all_core:
        cores_for_char.setdefault(core["kanji"], []).append(core)

    for lesson in lessons:
        for vocab in lesson["vocab"]:
            linked = []
            seen = set()
            for character in vocab["word"]:
                matches = cores_for_char.get(character, [])
                core = next((item for item in matches if item["lesson"] == lesson["number"]), matches[0] if matches else None)
                if core and core["id"] not in seen:
                    seen.add(core["id"])
                    linked.append(core["id"])
                    core["vocabIds"].append(vocab["id"])
            vocab["coreIds"] = linked

    if REFERENCE_MAP.exists():
        reference_data = json.loads(REFERENCE_MAP.read_text(encoding="utf-8"))
        references = reference_data.get("characters", {})
        for core in all_core:
            reference = references.get(core["id"], {})
            source = reference.get("source") or {}
            candidate_image = reference.get("hintImage", f"./assets/kanji/{core['id']}.webp")
            image_path = ROOT / candidate_image.removeprefix("./") if candidate_image else None
            core["hintImage"] = candidate_image if image_path and image_path.is_file() else None
            core["referenceUrl"] = source.get("pageUrl")
            core["referenceMeaning"] = source.get("meaningEn")
            core["sourceWarning"] = reference.get("sourceWarning")

    add_hikari_fields(lessons)

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(lessons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    vocab_count = sum(len(lesson["vocab"]) for lesson in lessons)
    core_count = sum(len(lesson["core"]) for lesson in lessons)
    linked_words = sum(bool(vocab["coreIds"]) for lesson in lessons for vocab in lesson["vocab"])
    print(f"Wrote {DEST.relative_to(ROOT)}: {len(lessons)} lessons, {core_count} kanji, {vocab_count} vocabulary entries, {linked_words} linked entries")


if __name__ == "__main__":
    main()
