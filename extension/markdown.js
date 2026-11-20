/**
 * Lightweight, XSS-safe Markdown parser & clean-text extractor for CRCA Forms & Documents.
 * Supports: multiline H1, H1-H4 with deterministic heading slugs, tables with <br>,
 * blockquotes, ordered/unordered/en-dash lists, bold, italic, hard line breaks, and [^id] footnotes.
 */

const BR_SENTINEL = "\u0000BR_TAG\u0000";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeWithSafeBr(str) {
  const withSentinel = String(str).replace(/<br\s*\/?>/gi, BR_SENTINEL);
  return escapeHtml(withSentinel).split(BR_SENTINEL).join("<br>");
}

export function slugify(text) {
  const cleaned = String(text)
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/['’]/g, "");
  const slug = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function formatFootnoteDisplay(id, seqIndex) {
  const qMatch = /^q(\d+)-(\d+)$/.exec(id);
  if (qMatch) return qMatch[2];
  if (/^\d+$/.test(id)) return id;
  if (id === "art4-note" || id === "q77-note" || id === "q80-note1" || id === "q119-note1" || id === "art36-1") {
    return "*";
  }
  if (id === "q80-note2" || id === "q119-note2" || id === "art36-2") {
    return "**";
  }
  if (id === "art36-3") {
    return "***";
  }
  return String(seqIndex);
}

function formatFootnoteListLabel(id, displayBadge) {
  const qMatch = /^q(\d+)-(\d+)$/.exec(id);
  if (qMatch) return `Q.${qMatch[1]} (${qMatch[2]})`;
  const qNoteMatch = /^q(\d+)-note(\d*)$/.exec(id);
  if (qNoteMatch) return `Q.${qNoteMatch[1]} (${displayBadge})`;
  if (id === "art4-note") return `Art. 4 (${displayBadge})`;
  if (id.startsWith("art36-")) return `Art. 36 (${displayBadge})`;
  return displayBadge;
}

function extractFootnotes(rawText) {
  const normalized = rawText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const defs = new Map();
  const bodyLines = [];

  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(lines[i]);
    if (m) {
      const id = m[1].trim();
      let text = m[2].trim();
      while (i + 1 < lines.length && /^(?:\s{2,}|\t)\S/.test(lines[i + 1])) {
        i += 1;
        text += " " + lines[i].trim();
      }
      defs.set(id, text);
    } else {
      bodyLines.push(lines[i]);
    }
  }

  // Remove trailing horizontal rule(s) left before the footnote block
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") {
    bodyLines.pop();
  }
  if (defs.size > 0 && bodyLines.length > 0 && /^---+$/.test(bodyLines[bodyLines.length - 1].trim())) {
    bodyLines.pop();
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") {
      bodyLines.pop();
    }
  }

  return { bodyText: bodyLines.join("\n"), defs };
}

function isBlockStarter(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^#{1,4}\s+/.test(t)) return true;
  if (/^---+$/.test(t)) return true;
  if (/^>\s?/.test(t)) return true;
  if (/^\|/.test(t)) return true;
  if (/^\d+\.\s+/.test(t)) return true;
  if (/^(?:[-*–—])\s+/.test(t)) return true;
  return false;
}

function isTableSeparator(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  const cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|");
  return cells.length > 0 && cells.every((c) => /^\s*:?-{3,}:?\s*$/.test(c));
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseMarkdown(mdText) {
  const { bodyText, defs } = extractFootnotes(mdText || "");
  const lines = bodyText.split("\n");

  const refOrder = [];
  const refBadgeMap = new Map();

  function registerFootnoteRef(id) {
    if (!refBadgeMap.has(id)) {
      const seq = refOrder.length + 1;
      const badge = formatFootnoteDisplay(id, seq);
      refBadgeMap.set(id, badge);
      refOrder.push(id);
    }
    return refBadgeMap.get(id);
  }

  function renderInline(raw) {
    // 1. Protect safe <br> tags, escape HTML, then format **bold**, *italic*, and [^id]
    let safe = escapeWithSafeBr(raw);

    // Replace footnote refs [^id] with temporary placeholders so italic/bold passes don't touch them
    const fnTokens = [];
    safe = safe.replace(/\[\^([^\]]+)\]/g, (_, idRaw) => {
      const id = idRaw.trim();
      const badge = registerFootnoteRef(id);
      const token = `\u0000FN_${fnTokens.length}\u0000`;
      fnTokens.push(
        `<button type="button" class="fn-ref" data-fn-id="${escapeHtml(id)}" aria-label="Footnote ${escapeHtml(badge)}">${escapeHtml(badge)}</button>`
      );
      return token;
    });

    // Bold **...**
    safe = safe.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    // Italic *...*
    safe = safe.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");

    // Restore footnote buttons
    safe = safe.replace(/\u0000FN_(\d+)\u0000/g, (_, idx) => fnTokens[Number(idx)]);
    return safe;
  }

  const htmlParts = [];
  const headings = [];
  const seenSlugs = new Map();
  let docTitle = "";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      htmlParts.push("<hr>");
      i += 1;
      continue;
    }

    // Headings # .. #### (supports multiline H1 in existing CRCA files)
    const hMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (hMatch) {
      const level = hMatch[1].length;
      let rawHeading = hMatch[2].trim();
      if (level === 1) {
        while (
          i + 1 < lines.length &&
          lines[i + 1].trim() &&
          !isBlockStarter(lines[i + 1])
        ) {
          i += 1;
          rawHeading += " " + lines[i].trim();
        }
        if (!docTitle) {
          docTitle = rawHeading.replace(/\[\^[^\]]+\]/g, "").trim();
        }
      }

      if (level >= 2 && level <= 4) {
        const base = slugify(rawHeading);
        const count = (seenSlugs.get(base) || 0) + 1;
        seenSlugs.set(base, count);
        const slug = count === 1 ? base : `${base}-${count}`;
        if (level <= 3) {
          headings.push({
            level,
            text: rawHeading.replace(/\[\^[^\]]+\]/g, "").replace(/\*\*/g, "").replace(/\*/g, "").trim(),
            slug,
          });
        }
        htmlParts.push(`<h${level} id="${escapeHtml(slug)}">${renderInline(rawHeading)}</h${level}>`);
      } else {
        htmlParts.push(`<h1>${renderInline(rawHeading)}</h1>`);
      }
      i += 1;
      continue;
    }

    // GFM Pipe Table
    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableRow(trimmed);
      i += 2; // Skip header and separator
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        bodyRows.push(splitTableRow(lines[i]));
        i += 1;
      }
      const ths = headerCells.map((c) => `<th>${renderInline(c)}</th>`).join("");
      const trs = bodyRows
        .map((row) => {
          const tds = headerCells
            .map((_, idx) => `<td>${renderInline(row[idx] ?? "")}</td>`)
            .join("");
          return `<tr>${tds}</tr>`;
        })
        .join("");
      htmlParts.push(`<div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`);
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      // Split quoteLines into paragraphs by empty lines
      const qParas = [];
      let cur = [];
      for (const ql of quoteLines) {
        if (!ql.trim()) {
          if (cur.length) {
            qParas.push(`<p>${renderInline(cur.join(" "))}</p>`);
            cur = [];
          }
        } else {
          cur.push(ql.trim());
        }
      }
      if (cur.length) {
        qParas.push(`<p>${renderInline(cur.join(" "))}</p>`);
      }
      htmlParts.push(`<blockquote>${qParas.join("")}</blockquote>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const firstM = /^(\d+)\.\s+/.exec(trimmed);
      const startNum = Number(firstM[1]);
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push(`<li>${renderInline(itemText)}</li>`);
        i += 1;
      }
      const startAttr = startNum !== 1 ? ` start="${startNum}"` : "";
      htmlParts.push(`<ol${startAttr}>${items.join("")}</ol>`);
      continue;
    }

    // Unordered list (- , * , or en-dash – )
    if (/^(?:[-*–—])\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^(?:[-*–—])\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^(?:[-*–—])\s+/, "");
        items.push(`<li>${renderInline(itemText)}</li>`);
        i += 1;
      }
      htmlParts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Paragraph (handles two trailing spaces as <br>)
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !isBlockStarter(lines[i])) {
      paraLines.push(lines[i]);
      i += 1;
    }
    let paraHtml = "";
    for (let k = 0; k < paraLines.length; k += 1) {
      const rawLine = paraLines[k];
      const hasHardBreak = / {2,}$/.test(rawLine);
      const rendered = renderInline(rawLine.trim());
      if (k === 0) {
        paraHtml = rendered;
      } else if (/ {2,}$/.test(paraLines[k - 1])) {
        paraHtml += `<br>${rendered}`;
      } else {
        paraHtml += ` ${rendered}`;
      }
      if (hasHardBreak && k === paraLines.length - 1) {
        // Ignore trailing spaces on last line of paragraph
      }
    }
    htmlParts.push(`<p>${paraHtml}</p>`);
  }

  // Ensure any definitions not yet ordered (shouldn't happen) are still included cleanly
  for (const id of defs.keys()) {
    registerFootnoteRef(id);
  }

  const footnotes = refOrder
    .filter((id) => defs.has(id))
    .map((id) => {
      const badge = refBadgeMap.get(id);
      return {
        id,
        badge,
        listLabel: formatFootnoteListLabel(id, badge),
        text: defs.get(id),
      };
    });

  return {
    title: docTitle,
    html: htmlParts.join("\n"),
    footnotes,
    headings,
  };
}

export function getCleanText(mdText, { includeFootnotes = false } = {}) {
  const { bodyText, defs } = extractFootnotes(mdText || "");
  const lines = bodyText.split("\n");
  const refOrder = [];
  const refBadgeMap = new Map();

  function trackRef(id) {
    if (!refBadgeMap.has(id)) {
      const seq = refOrder.length + 1;
      refBadgeMap.set(id, formatFootnoteDisplay(id, seq));
      refOrder.push(id);
    }
    return refBadgeMap.get(id);
  }

  function cleanInline(s) {
    let txt = String(s).replace(/<br\s*\/?>/gi, "\n");
    if (includeFootnotes) {
      txt = txt.replace(/\[\^([^\]]+)\]/g, (_, idRaw) => {
        const badge = trackRef(idRaw.trim());
        return `[${badge}]`;
      });
    } else {
      txt = txt.replace(/\[\^([^\]]+)\]/g, "");
    }
    txt = txt.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
    txt = txt.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1$2");
    return txt;
  }

  const out = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      out.push("--------------------");
      i += 1;
      continue;
    }

    const hMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (hMatch) {
      const level = hMatch[1].length;
      let heading = hMatch[2].trim();
      if (level === 1) {
        while (i + 1 < lines.length && lines[i + 1].trim() && !isBlockStarter(lines[i + 1])) {
          i += 1;
          heading += " " + lines[i].trim();
        }
      }
      out.push(cleanInline(heading));
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(trimmed).map((h) => cleanInline(h).trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i]).map((c) => cleanInline(c).trim()));
        i += 1;
      }
      const colBlocks = headers.map((hdr, colIdx) => {
        const colLines = [hdr];
        for (const r of rows) {
          if (r[colIdx]) colLines.push(r[colIdx]);
        }
        return colLines.join("\n\n");
      });
      out.push(colBlocks.join("\n\n---\n\n"));
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const qLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        qLines.push(cleanInline(lines[i].trim().replace(/^>\s?/, "")));
        i += 1;
      }
      out.push(qLines.join("\n"));
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(cleanInline(lines[i].trim()));
        i += 1;
      }
      out.push(items.join("\n"));
      continue;
    }

    if (/^(?:[-*–—])\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^(?:[-*–—])\s+/.test(lines[i].trim())) {
        const item = lines[i].trim().replace(/^(?:[-*–—])\s+/, "- ");
        items.push(cleanInline(item));
        i += 1;
      }
      out.push(items.join("\n"));
      continue;
    }

    const pLines = [];
    while (i < lines.length && lines[i].trim() && !isBlockStarter(lines[i])) {
      pLines.push(lines[i]);
      i += 1;
    }
    let pOut = "";
    for (let k = 0; k < pLines.length; k += 1) {
      const rendered = cleanInline(pLines[k].trim());
      if (k === 0) {
        pOut = rendered;
      } else if (/ {2,}$/.test(pLines[k - 1])) {
        pOut += "\n" + rendered;
      } else {
        pOut += " " + rendered;
      }
    }
    out.push(pOut);
  }

  let result = out.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();

  if (includeFootnotes && defs.size > 0) {
    for (const id of defs.keys()) {
      trackRef(id);
    }
    const fnOut = refOrder
      .filter((id) => defs.has(id))
      .map((id) => `[${formatFootnoteListLabel(id, refBadgeMap.get(id))}] ${defs.get(id)}`);
    if (fnOut.length > 0) {
      result += "\n\n---\n\n" + fnOut.join("\n");
    }
  }

  return result;
}
