"""Generate index.json and search-index.json for CRCA Forms & Documents."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

PDF_MAP = {
    "Creeds and Confessions/02 - Reformed Confessions/01 - The Belgic Confession.md": "CRCA BelgicConfession.pdf",
    "Creeds and Confessions/02 - Reformed Confessions/02 - The Heidelberg Catechism.md": "CRCA HeidelbergCatechism.pdf",
    "Creeds and Confessions/02 - Reformed Confessions/03 - The Canons of Dort.md": "CRCA CanonsofDort.pdf",
}

DEFAULT_REPO = {
    "owner": "Aussie-App-Studio",
    "repo": "crca-forms-and-documents",
    "branch": "main",
}


def strip_numeric_prefix(name: str) -> str:
    return re.sub(r"^\d+\s*-\s*", "", name).strip()


def clean_doc_title(path: Path) -> str:
    return strip_numeric_prefix(path.stem)


def make_doc_id(rel_posix: str) -> str:
    no_ext = rel_posix[:-3] if rel_posix.lower().endswith(".md") else rel_posix
    slug = no_ext.lower().replace("'", "").replace("’", "")
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug


def slugify_heading(text: str) -> str:
    """Deterministic heading slugger matching extension/markdown.js."""
    cleaned = re.sub(r"\[\^[^\]]+\]", "", text)
    cleaned = cleaned.replace("**", "").replace("*", "")
    cleaned = cleaned.replace("'", "").replace("’", "")
    slug = re.sub(r"[^a-z0-9]+", "-", cleaned.lower()).strip("-")
    return slug or "section"


def extract_headings_and_stats(md_text: str) -> tuple[list[dict[str, Any]], int, int]:
    """Extract ## and ### headings (deduplicating slugs across h2..h4), body word count, and footnote count."""
    if "\n---\n" in md_text:
        body, fn_sec = md_text.rsplit("\n---\n", 1)
    elif "\r\n---\r\n" in md_text:
        body, fn_sec = md_text.rsplit("\r\n---\r\n", 1)
    else:
        body, fn_sec = md_text, ""

    # Count footnote definitions anywhere (in case a file doesn't use --- separator)
    fn_defs = re.findall(r"^\[\^[^\]]+\]:", md_text, re.M)
    footnote_count = len(fn_defs)

    # Remove inline footnote definitions if there wasn't a --- divider
    body_clean = re.sub(r"^\[\^[^\]]+\]:.*$", "", body, flags=re.M)
    body_no_markers = re.sub(r"\[\^[^\]]+\]", "", body_clean)
    word_count = len(re.findall(r"\b\w+\b", body_no_markers))

    headings: list[dict[str, Any]] = []
    seen_slugs: dict[str, int] = {}

    for line in body.splitlines():
        m = re.match(r"^(#{2,4})\s+(.+?)\s*$", line)
        if not m:
            continue
        level = len(m.group(1))
        raw_text = m.group(2)
        display_text = re.sub(r"\[\^[^\]]+\]", "", raw_text).replace("**", "").replace("*", "").strip()
        base = slugify_heading(raw_text)
        count = seen_slugs.get(base, 0) + 1
        seen_slugs[base] = count
        slug = base if count == 1 else f"{base}-{count}"
        if level in (2, 3):
            headings.append({"level": level, "text": display_text, "slug": slug})

    return headings, word_count, footnote_count


def clean_search_text(md_text: str) -> str:
    """Produce clean plain text for client-side full-text search."""
    text = md_text.replace("\r\n", "\n")
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = re.sub(r"\[\^[^\]]+\]:\s*", "", text)
    text = re.sub(r"\[\^[^\]]+\]", "", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.M)
    text = re.sub(r"^---+$", " ", text, flags=re.M)
    text = re.sub(r"^\|[\s\-:|]+\|$", " ", text, flags=re.M)
    text = text.replace("|", " ").replace("**", "").replace("*", "")
    text = re.sub(r"^>\s*", "", text, flags=re.M)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def build_doc_entry(
    file_path: Path,
    category_id: str,
    category_title: str,
    group_title: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    rel_posix = file_path.relative_to(REPO_ROOT).as_posix()
    md_text = file_path.read_text(encoding="utf-8")
    title = clean_doc_title(file_path)
    doc_id = make_doc_id(rel_posix)
    pdf_path = PDF_MAP.get(rel_posix)
    if pdf_path is not None and not (REPO_ROOT / pdf_path).exists():
        raise FileNotFoundError(f"Mapped PDF missing: {pdf_path}")

    headings, word_count, footnote_count = extract_headings_and_stats(md_text)

    index_item = {
        "id": doc_id,
        "title": title,
        "path": rel_posix,
        "pdfPath": pdf_path,
        "wordCount": word_count,
        "footnoteCount": footnote_count,
        "headings": headings,
    }
    search_item = {
        "id": doc_id,
        "title": title,
        "categoryId": category_id,
        "categoryTitle": category_title,
        "groupTitle": group_title,
        "path": rel_posix,
        "text": clean_search_text(md_text),
    }
    return index_item, search_item


def collect_categories() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    categories: list[dict[str, Any]] = []
    search_docs: list[dict[str, Any]] = []

    # 1. Creeds & Confessions
    cc_id = "creeds-and-confessions"
    cc_title = "Creeds & Confessions"
    cc_groups: list[dict[str, Any]] = []

    creeds_dir = REPO_ROOT / "Creeds and Confessions" / "01 - Ecumenical Creeds"
    creed_items = []
    for f in sorted(creeds_dir.glob("*.md")):
        item, s_item = build_doc_entry(f, cc_id, cc_title, "Ecumenical Creeds")
        creed_items.append(item)
        search_docs.append(s_item)
    cc_groups.append({"id": "ecumenical-creeds", "title": "Ecumenical Creeds", "items": creed_items})

    conf_dir = REPO_ROOT / "Creeds and Confessions" / "02 - Reformed Confessions"
    conf_items = []
    for f in sorted(conf_dir.glob("*.md")):
        item, s_item = build_doc_entry(f, cc_id, cc_title, "Reformed Confessions")
        conf_items.append(item)
        search_docs.append(s_item)
    cc_groups.append({"id": "reformed-confessions", "title": "Reformed Confessions", "items": conf_items})

    sub_file = REPO_ROOT / "01 - Form of Subscription.md"
    if sub_file.exists():
        item, s_item = build_doc_entry(sub_file, cc_id, cc_title, "Form of Subscription")
        cc_groups.append({"id": "form-of-subscription", "title": "Form of Subscription", "items": [item]})
        search_docs.append(s_item)

    categories.append({"id": cc_id, "title": cc_title, "groups": cc_groups})

    # 2. The Liturgical Forms (preserving 01..07 order)
    lf_id = "liturgical-forms"
    lf_title = "The Liturgical Forms"
    lf_dir = REPO_ROOT / "The Liturgical Forms"
    lf_groups: list[dict[str, Any]] = []

    for entry in sorted(lf_dir.iterdir(), key=lambda p: p.name):
        if entry.is_dir():
            g_title = strip_numeric_prefix(entry.name)
            g_id = make_doc_id(f"{lf_id}/{g_title}")
            g_items = []
            for f in sorted(entry.glob("*.md")):
                item, s_item = build_doc_entry(f, lf_id, lf_title, g_title)
                g_items.append(item)
                search_docs.append(s_item)
            if g_items:
                lf_groups.append({"id": g_id, "title": g_title, "items": g_items})
        elif entry.is_file() and entry.suffix.lower() == ".md":
            g_title = clean_doc_title(entry)
            g_id = make_doc_id(f"{lf_id}/{g_title}")
            item, s_item = build_doc_entry(entry, lf_id, lf_title, g_title)
            lf_groups.append({"id": g_id, "title": g_title, "items": [item]})
            search_docs.append(s_item)

    categories.append({"id": lf_id, "title": lf_title, "groups": lf_groups})

    # 3. Other Resources
    or_id = "other-resources"
    or_title = "Other Resources"
    or_dir = REPO_ROOT / "Other Resources"
    or_groups: list[dict[str, Any]] = []

    top_or_items = []
    for f in sorted(or_dir.glob("*.md")):
        item, s_item = build_doc_entry(f, or_id, or_title, "General Worship Resources")
        top_or_items.append(item)
        search_docs.append(s_item)
    if top_or_items:
        or_groups.append(
            {"id": "general-worship-resources", "title": "General Worship Resources", "items": top_or_items}
        )

    for sub in sorted((p for p in or_dir.iterdir() if p.is_dir()), key=lambda p: p.name):
        g_title = strip_numeric_prefix(sub.name)
        g_id = make_doc_id(f"{or_id}/{g_title}")
        g_items = []
        for f in sorted(sub.glob("*.md")):
            item, s_item = build_doc_entry(f, or_id, or_title, g_title)
            g_items.append(item)
            search_docs.append(s_item)
        if g_items:
            or_groups.append({"id": g_id, "title": g_title, "items": g_items})

    categories.append({"id": or_id, "title": or_title, "groups": or_groups})
    return categories, search_docs


def main() -> int:
    categories, search_docs = collect_categories()
    doc_count = sum(len(g["items"]) for c in categories for g in c["groups"])

    if doc_count != 38:
        print(f"ERROR: Expected 38 documents, found {doc_count}", file=sys.stderr)
        return 1

    # Verify every referenced path exists on disk
    for c in categories:
        for g in c["groups"]:
            for item in g["items"]:
                if not (REPO_ROOT / item["path"]).exists():
                    print(f"ERROR: Missing path {item['path']}", file=sys.stderr)
                    return 1
                if item["pdfPath"] and not (REPO_ROOT / item["pdfPath"]).exists():
                    print(f"ERROR: Missing pdfPath {item['pdfPath']}", file=sys.stderr)
                    return 1

    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    index_payload = {
        "version": 1,
        "generatedAt": now_iso,
        "repoDefault": DEFAULT_REPO,
        "documentCount": doc_count,
        "categories": categories,
    }
    search_payload = {
        "version": 1,
        "generatedAt": now_iso,
        "documents": search_docs,
    }

    index_path = REPO_ROOT / "index.json"
    search_path = REPO_ROOT / "search-index.json"
    index_path.write_text(json.dumps(index_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    search_path.write_text(json.dumps(search_payload, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Generated {index_path.name}: {doc_count} documents ({index_path.stat().st_size:,} bytes)")
    print(f"Generated {search_path.name}: {len(search_docs)} documents ({search_path.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
