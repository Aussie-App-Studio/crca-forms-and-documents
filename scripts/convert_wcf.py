"""Convert Westminster Confession of Faith JSON (from Confession Hover) to Markdown."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WCF_JSON_PATH = Path(r"C:\AndroidProjects\Confession Hover\extension\data\wcf.json")
OUT_PATH = (
    REPO_ROOT
    / "Creeds and Confessions"
    / "02 - Reformed Confessions"
    / "04 - The Westminster Confession of Faith.md"
)

SYNOD_1957_NOTE = (
    "Synod (1957) accepts the Westminster Confession as the Fourth Formula of Unity "
    "of the Reformed Churches of Australia, with the understanding that: on the points "
    "where the Westminster Confession goes further than the Belgic Confession, the office "
    "bearers and church members are bound only to the latter; regarding the duty of "
    "magistrates in relation to the church and vice versa, the Reformed Churches of "
    "Australia hold the view as expressed in Article 36 of the Belgic Confession."
)


def convert_wcf(json_path: Path = WCF_JSON_PATH) -> tuple[str, list[int]]:
    if not json_path.exists():
        raise FileNotFoundError(f"Source WCF JSON missing: {json_path}")

    data = json.loads(json_path.read_text(encoding="utf-8"))
    entries = data["entries"]
    bounds = data["bounds"]["chapters"]

    blocks: list[str] = [
        "# The Westminster Confession of Faith",
        "## Note on CRCA Adoption",
        f"> {SYNOD_1957_NOTE}",
    ]

    for ch_idx, sec_count in enumerate(bounds, start=1):
        first_key = f"{ch_idx}.1"
        ch_title = entries[first_key]["title"].strip()
        blocks.append(f"## Chapter {ch_idx}: {ch_title}")

        for sec_idx in range(1, sec_count + 1):
            key = f"{ch_idx}.{sec_idx}"
            entry = entries[key]
            text = re.sub(r"\s+", " ", entry["text"]).strip()
            blocks.append(f"**{sec_idx}.** {text}")

    return "\n\n".join(blocks) + "\n", bounds


def verify_wcf(md_path: Path = OUT_PATH, expected_bounds: list[int] | None = None) -> int:
    errors: list[str] = []
    if not md_path.exists():
        print(f"ERROR: Missing {md_path}", file=sys.stderr)
        return 1

    raw = md_path.read_text(encoding="utf-8")
    chapters = [int(m) for m in re.findall(r"^## Chapter (\d+):", raw, re.M)]
    if chapters != list(range(1, 34)):
        errors.append(f"Expected 33 chapters (1..33), got {chapters}")

    sections = re.findall(r"^\*\*(\d+)\.\*\*\s+(.+)$", raw, re.M)
    expected_total = sum(expected_bounds) if expected_bounds else 172
    if len(sections) != expected_total:
        errors.append(f"Expected {expected_total} sections, got {len(sections)}")

    for num, body in sections:
        if not body.strip():
            errors.append(f"Empty text in section {num}")

    # Verify per-chapter section counts
    if expected_bounds:
        cur_ch = 0
        counts: dict[int, int] = {}
        for line in raw.splitlines():
            m_ch = re.match(r"^## Chapter (\d+):", line)
            if m_ch:
                cur_ch = int(m_ch.group(1))
                counts[cur_ch] = 0
            elif re.match(r"^\*\*\d+\.\*\*\s+", line) and cur_ch > 0:
                counts[cur_ch] += 1
        actual_bounds = [counts.get(i, 0) for i in range(1, 34)]
        if actual_bounds != expected_bounds:
            errors.append(f"Chapter section counts mismatch: {actual_bounds} != {expected_bounds}")

    if errors:
        for e in errors:
            print("ERROR:", e, file=sys.stderr)
        return 1

    print(
        f"Westminster Confession verified: {len(chapters)} chapters, {len(sections)} sections -> {md_path.relative_to(REPO_ROOT)}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert wcf.json to Markdown.")
    parser.add_argument("--verify", action="store_true", help="Verify chapter and section counts.")
    args = parser.parse_args()

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    md, bounds = convert_wcf()
    OUT_PATH.write_text(md, encoding="utf-8")
    print(f"Generated {OUT_PATH.relative_to(REPO_ROOT)} ({OUT_PATH.stat().st_size:,} bytes)")

    if args.verify:
        return verify_wcf(OUT_PATH, bounds)
    return 0


if __name__ == "__main__":
    sys.exit(main())
