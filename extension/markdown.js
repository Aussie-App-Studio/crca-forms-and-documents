/**
 * Lightweight, XSS-safe Markdown parser & clean-text extractor for CRCA Forms & Documents.
 * Supports: multiline H1, H1-H4 with deterministic heading slugs, implicit headings for
 * liturgical forms & Scripture readings, Heidelberg Catechism Q&A blocks, selectable
 * EITHER/OR tables, service prep token rendering, and [^id] footnotes.
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
    .replace(/\u0000PREP_\d+\u0000/g, "")
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
  const normalized = String(rawText || "").replace(/\r\n/g, "\n");
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

const NUMBERED_READING_RE = /^\d+\.\s+(?:[1-3]\s+)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\s+\d+/i;

const BAPTISM_CUE_RE = /^(?:Why do we baptise.*\?|(?:Question to Parents|Question to the congregation[^:]*|Baptism|Baptismal prayer|Address to Parents|Prayer of thanksgiving):)$/i;

/**
 * Detect implicit section headings in Liturgical Forms and Scripture Reading documents.
 * Kept in sync with scripts/build_index.py.
 */
export function detectImplicitHeading(trimmed, {
  hasExplicitH2 = false,
  isLiturgicalForm = false,
  isReadingsDoc = false,
  nextLineIsBlank = false,
} = {}) {
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("|")) return null;

  // Case A: Numbered Scripture readings in Other Resources (e.g. "1. Psalm 130:1-4")
  if (isReadingsDoc && nextLineIsBlank && NUMBERED_READING_RE.test(trimmed)) {
    return {
      htmlLevel: 4,
      tocLevel: hasExplicitH2 ? null : 2,
      rawText: trimmed,
      kind: "reading",
    };
  }

  // Case B & C: Liturgical forms without explicit ## headings
  if (isLiturgicalForm && !hasExplicitH2 && nextLineIsBlank) {
    // Exclude Aaronic blessing lines and trailing punctuation / colon cues
    if (!/^(?:THE LORD|AND)\s+/.test(trimmed) && !/[.:;,]$/.test(trimmed)) {
      const stripped = trimmed
        .replace(/^\d+\.\s+/, "")
        .replace(/\[\^[^\]]+\]/g, "")
        .replace(/\(optional\)/gi, "")
        .trim();
      if (
        stripped.length >= 3 &&
        stripped.length <= 85 &&
        /[A-Z]{3}/.test(stripped) &&
        !/[a-z]/.test(stripped)
      ) {
        return {
          htmlLevel: 2,
          tocLevel: 2,
          rawText: trimmed,
          kind: "implicit",
        };
      }
    }

    if (BAPTISM_CUE_RE.test(trimmed)) {
      return {
        htmlLevel: 3,
        tocLevel: 2,
        rawText: trimmed,
        kind: "implicit",
      };
    }
  }

  return null;
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

function isChoiceTableHeaders(headers) {
  if (headers.length !== 2) return false;
  const h0 = headers[0].replace(/<br\s*\/?>/gi, " ").trim();
  const h1 = headers[1].replace(/<br\s*\/?>/gi, " ").trim();
  return /^EITHER\b/i.test(h0) && /^OR\b/i.test(h1);
}

function isPureChoiceKicker(headers) {
  return headers.every((h) => /^(?:EITHER|OR)\s*:?$/i.test(h.replace(/<br\s*\/?>/gi, " ").trim()));
}

function isQaQuestionStart(trimmedLine) {
  return /^\*\*Q\.\s*\d+\.\s*/.test(trimmedLine);
}

const NOT_ADOPTED_STATUS_RE = /^(?:The following (?:motion|motions|recommendation|recommendations)\b|As a result, the following|Synod (?:[“"']laid on the table[”"']|rejected|decided (?:not )?to take (?:no|any) action|decided the following recommendations were no longer required))/i;

function isNotAdoptedBlockquote(quoteLines) {
  const plain = quoteLines.join(" ").replace(/\*\*/g, "").replace(/\*/g, "").trim();
  return NOT_ADOPTED_STATUS_RE.test(plain);
}

function renderBlockquoteHtml(quoteLines, renderInlineFn, attrs = "") {
  const qParas = [];
  let cur = [];
  for (const ql of quoteLines) {
    if (!ql.trim()) {
      if (cur.length) {
        qParas.push(`<p>${renderInlineFn(cur.join(" "))}</p>`);
        cur = [];
      }
    } else {
      cur.push(ql.trim());
    }
  }
  if (cur.length) qParas.push(`<p>${renderInlineFn(cur.join(" "))}</p>`);
  return `<blockquote${attrs}>${qParas.join("")}</blockquote>`;
}

function parseListLine(line) {
  const indentMatch = /^([ \t]*)/.exec(line);
  const indent = indentMatch ? indentMatch[1].replace(/\t/g, "  ").length : 0;
  const trimmed = line.slice(indentMatch ? indentMatch[0].length : 0);
  const olMatch = /^(\d+)\.\s+(.*)$/.exec(trimmed);
  if (olMatch) {
    return { type: "ol", indent, startNum: Number(olMatch[1]), text: olMatch[2], rawMarker: `${olMatch[1]}. ` };
  }
  const ulMatch = /^(?:[-*–—])\s+(.*)$/.exec(trimmed);
  if (ulMatch) {
    return { type: "ul", indent, startNum: 1, text: ulMatch[1], rawMarker: "- " };
  }
  return null;
}

function parseListBlock(lines, startIdx, renderInlineFn, shouldStopAt = null) {
  const first = parseListLine(lines[startIdx]);
  if (!first) return { html: "", nextIdx: startIdx };

  const baseIndent = first.indent;
  const listType = first.type;
  const startNum = first.startNum;
  const items = [];
  let idx = startIdx;

  while (idx < lines.length) {
    if (shouldStopAt && shouldStopAt(idx)) break;
    const item = parseListLine(lines[idx]);
    if (!item || item.indent < baseIndent || (item.indent === baseIndent && item.type !== listType)) {
      break;
    }

    let itemHtml = renderInlineFn(item.text);
    idx += 1;

    while (idx < lines.length && !(shouldStopAt && shouldStopAt(idx))) {
      const next = parseListLine(lines[idx]);
      if (next && next.indent > baseIndent) {
        const nested = parseListBlock(lines, idx, renderInlineFn, shouldStopAt);
        itemHtml += nested.html;
        idx = nested.nextIdx;
      } else {
        break;
      }
    }

    items.push(`<li>${itemHtml}</li>`);
  }

  const startAttr = listType === "ol" && startNum !== 1 ? ` start="${startNum}"` : "";
  const tag = listType === "ol" ? "ol" : "ul";
  return { html: `<${tag}${startAttr}>${items.join("")}</${tag}>`, nextIdx: idx };
}

function buildSectionActionsHtml(slug, title) {
  return `<span class="section-actions no-print"><button type="button" class="mini-copy-btn" data-copy-section="${escapeHtml(slug)}" data-copy-format="clean" title="Copy ${escapeHtml(title)}">Copy</button><button type="button" class="mini-copy-btn" data-copy-section="${escapeHtml(slug)}" data-copy-format="slides" title="Copy ${escapeHtml(title)} for slides">Slides</button></span>`;
}

export function parseMarkdown(mdText, options = {}) {
  const {
    prepTokens = [],
    tableChoices = null,
    isLiturgicalForm = false,
    isReadingsDoc = false,
    isWestminster = false,
  } = options;

  const { bodyText, defs } = extractFootnotes(mdText || "");
  const lines = bodyText.split("\n");
  const hasExplicitH2 = lines.some((l) => /^#{2,4}\s+/.test(l.trim()));

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
    const prepPlaceholders = [];
    const withPrepTokens = String(raw).replace(/\u0000PREP_(\d+)\u0000/g, (_, idxStr) => {
      const tok = prepTokens[Number(idxStr)];
      const pIdx = prepPlaceholders.length;
      if (tok) {
        const cls = tok.filled ? "form-filled" : "form-blank";
        const extra = tok.filled ? "" : ` role="button" tabindex="0" title="Click to fill ${escapeHtml(tok.text)}"`;
        prepPlaceholders.push(`<span class="${cls}" data-field="${escapeHtml(tok.fieldKey)}"${extra}>${escapeHtml(tok.text)}</span>`);
      } else {
        prepPlaceholders.push("");
      }
      return `\u0000PTOK_${pIdx}\u0000`;
    });

    let safe = escapeWithSafeBr(withPrepTokens);

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

    safe = safe.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");

    safe = safe.replace(/\u0000FN_(\d+)\u0000/g, (_, idx) => fnTokens[Number(idx)]);
    safe = safe.replace(/\u0000PTOK_(\d+)\u0000/g, (_, idx) => prepPlaceholders[Number(idx)]);
    return safe;
  }

  const htmlParts = [];
  const headings = [];
  const seenSlugs = new Map();
  let docTitle = "";
  let choiceTableIdx = 0;
  let currentWcfChapter = null;

  function allocateSlug(rawText) {
    const base = slugify(rawText);
    const count = (seenSlugs.get(base) || 0) + 1;
    seenSlugs.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  }

  function cleanHeadingDisplay(rawText) {
    return rawText
      .replace(/\u0000PREP_\d+\u0000/g, "")
      .replace(/\[\^[^\]]+\]/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .trim();
  }

  function checkImplicitAt(idx) {
    const t = lines[idx]?.trim() || "";
    const nextLineIsBlank = idx + 1 >= lines.length || lines[idx + 1].trim() === "";
    return detectImplicitHeading(t, {
      hasExplicitH2,
      isLiturgicalForm,
      isReadingsDoc,
      nextLineIsBlank,
    });
  }

  function parseParagraphAt(startIdx) {
    let idx = startIdx;
    const paraLines = [];
    while (idx < lines.length && lines[idx].trim() && !isBlockStarter(lines[idx])) {
      if (idx !== startIdx && checkImplicitAt(idx)) break;
      paraLines.push(lines[idx]);
      idx += 1;
    }
    let paraHtml = "";
    for (let k = 0; k < paraLines.length; k += 1) {
      const rawLine = paraLines[k];
      const rendered = renderInline(rawLine.trim());
      if (k === 0) paraHtml = rendered;
      else if (/ {2,}$/.test(paraLines[k - 1])) paraHtml += `<br>${rendered}`;
      else paraHtml += ` ${rendered}`;
    }
    return { html: `<p>${paraHtml}</p>`, nextIdx: idx };
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      htmlParts.push("<hr>");
      i += 1;
      continue;
    }

    // Explicit Headings # .. ####
    const hMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (hMatch) {
      const level = hMatch[1].length;
      let rawHeading = hMatch[2].trim();
      if (level === 1) {
        currentWcfChapter = null;
        while (i + 1 < lines.length && lines[i + 1].trim() && !isBlockStarter(lines[i + 1])) {
          i += 1;
          rawHeading += " " + lines[i].trim();
        }
        if (!docTitle) {
          docTitle = rawHeading.replace(/\[\^[^\]]+\]/g, "").trim();
        }
        htmlParts.push(`<h1>${renderInline(rawHeading)}</h1>`);
      } else {
        if (isWestminster && level === 2) {
          const chM = /^Chapter\s+(\d+)\b/i.exec(rawHeading);
          currentWcfChapter = chM ? Number(chM[1]) : null;
        }
        const slug = allocateSlug(rawHeading);
        const displayText = cleanHeadingDisplay(rawHeading);
        if (level <= 3) {
          headings.push({ level, text: displayText, slug });
        }
        const actions = level <= 3 ? buildSectionActionsHtml(slug, displayText) : "";
        htmlParts.push(`<h${level} id="${escapeHtml(slug)}" class="section-heading">${renderInline(rawHeading)}${actions}</h${level}>`);
      }
      i += 1;
      continue;
    }

    // Implicit Headings (Numbered Readings & ALL-CAPS / Cue Liturgical Headers)
    const imp = checkImplicitAt(i);
    if (imp) {
      const slug = allocateSlug(imp.rawText);
      const displayText = cleanHeadingDisplay(imp.rawText);
      if (imp.tocLevel !== null) {
        headings.push({ level: imp.tocLevel, text: displayText, slug });
      }
      const cls = imp.kind === "reading" ? "reading-heading section-heading" : "implicit-heading section-heading";
      const actions = buildSectionActionsHtml(slug, displayText);
      htmlParts.push(`<h${imp.htmlLevel} id="${escapeHtml(slug)}" class="${cls}">${renderInline(imp.rawText)}${actions}</h${imp.htmlLevel}>`);
      i += 1;
      continue;
    }

    // GFM Pipe Table
    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableRow(trimmed);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        bodyRows.push(splitTableRow(lines[i]));
        i += 1;
      }

      const isChoice = isChoiceTableHeaders(headerCells);
      if (isChoice) {
        const tIdx = choiceTableIdx;
        choiceTableIdx += 1;
        const chosenCol =
          tableChoices && (tableChoices[tIdx] === 0 || tableChoices[tIdx] === 1)
            ? Number(tableChoices[tIdx])
            : null;
        const pureKicker = isPureChoiceKicker(headerCells) ? ' data-pure-kicker="1"' : "";

        const ths = headerCells
          .map((c, colIdx) => {
            const cls = chosenCol === null ? "" : chosenCol === colIdx ? "choice-selected" : "choice-unselected";
            const btnLabel = chosenCol === colIdx ? "✓ Selected" : "Use this option";
            const btn = `<button type="button" class="choice-col-btn no-print" data-choice-table="${tIdx}" data-choice-col="${colIdx}">${btnLabel}</button>`;
            return `<th class="${cls}"><div class="choice-th-inner"><span>${renderInline(c)}</span>${btn}</div></th>`;
          })
          .join("");

        const trs = bodyRows
          .map((row) => {
            const tds = headerCells
              .map((_, colIdx) => {
                const cls = chosenCol === null ? "" : chosenCol === colIdx ? "choice-selected" : "choice-unselected";
                return `<td class="${cls}">${renderInline(row[colIdx] ?? "")}</td>`;
              })
              .join("");
            return `<tr>${tds}</tr>`;
          })
          .join("");

        const chosenAttr = chosenCol !== null ? ` data-chosen-col="${chosenCol}"` : "";
        htmlParts.push(`<div class="table-wrap"><table class="choice-table" data-choice-table="${tIdx}"${chosenAttr}${pureKicker}><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`);
      } else {
        const ths = headerCells.map((c) => `<th>${renderInline(c)}</th>`).join("");
        const trs = bodyRows
          .map((row) => {
            const tds = headerCells.map((_, idx) => `<td>${renderInline(row[idx] ?? "")}</td>`).join("");
            return `<tr>${tds}</tr>`;
          })
          .join("");
        htmlParts.push(`<div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`);
      }
      continue;
    }

    // Heidelberg Catechism Q&A block
    if (isQaQuestionStart(trimmed)) {
      const qNum = /^\*\*Q\.\s*(\d+)\./.exec(trimmed)[1];
      const qaParts = [];
      const firstPara = parseParagraphAt(i);
      i = firstPara.nextIdx;
      const qaActions = `<span class="qa-actions no-print"><button type="button" class="mini-copy-btn" data-copy-qa="${qNum}" data-copy-format="clean" title="Copy Q&amp;A ${qNum}">Copy</button><button type="button" class="mini-copy-btn" data-copy-qa="${qNum}" data-copy-format="slides" title="Copy Q&amp;A ${qNum} for slides">Slides</button></span>`;
      qaParts.push(firstPara.html.replace(/^<p>/, '<p class="qa-question">').replace(/<\/p>$/, `${qaActions}</p>`));

      // Collect answer paragraphs / blockquotes / lists up to next Q., heading, or hr
      while (i < lines.length) {
        const nt = lines[i].trim();
        if (!nt) {
          i += 1;
          continue;
        }
        if (/^---+$/.test(nt) || /^#{1,4}\s+/.test(nt) || isQaQuestionStart(nt) || checkImplicitAt(i)) {
          break;
        }
        if (/^>\s?/.test(nt)) {
          const quoteLines = [];
          while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
            quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
            i += 1;
          }
          qaParts.push(`<blockquote><p>${renderInline(quoteLines.filter(Boolean).join(" "))}</p></blockquote>`);
        } else if (parseListLine(lines[i])) {
          const listBlock = parseListBlock(lines, i, renderInline, checkImplicitAt);
          qaParts.push(listBlock.html);
          i = listBlock.nextIdx;
        } else if (!nt.startsWith("|")) {
          const ansPara = parseParagraphAt(i);
          i = ansPara.nextIdx;
          qaParts.push(ansPara.html);
        } else {
          break;
        }
      }

      htmlParts.push(`<div class="qa-block" id="qa-${qNum}" data-qa-num="${qNum}">${qaParts.join("\n")}</div>`);
      continue;
    }

    // Westminster Confession numbered section block (**1.**, **2.**, ...)
    const wcfSecMatch = isWestminster && currentWcfChapter ? /^\*\*(\d+)\.\*\*\s+/.exec(trimmed) : null;
    if (wcfSecMatch) {
      const secNum = wcfSecMatch[1];
      const secPara = parseParagraphAt(i);
      i = secPara.nextIdx;
      const wcfId = `${currentWcfChapter}-${secNum}`;
      const wcfActions = `<span class="qa-actions no-print"><button type="button" class="mini-copy-btn" data-copy-wcf="${wcfId}" data-copy-format="clean" title="Copy WCF ${currentWcfChapter}:${secNum}">Copy</button><button type="button" class="mini-copy-btn" data-copy-wcf="${wcfId}" data-copy-format="slides" title="Copy WCF ${currentWcfChapter}:${secNum} for slides">Slides</button></span>`;
      const innerHtml = secPara.html.replace(/<\/p>$/, `${wcfActions}</p>`);
      htmlParts.push(`<div class="wcf-section-block" id="wcf-${wcfId}" data-wcf-ch="${currentWcfChapter}" data-wcf-sec="${secNum}">${innerHtml}</div>`);
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      const attrs = isNotAdoptedBlockquote(quoteLines) ? ' class="status-not-adopted"' : "";
      htmlParts.push(renderBlockquoteHtml(quoteLines, renderInline, attrs));
      continue;
    }

    // Ordered & Unordered lists (with nested sub-lists)
    if (parseListLine(line)) {
      const listBlock = parseListBlock(lines, i, renderInline, checkImplicitAt);
      htmlParts.push(listBlock.html);
      i = listBlock.nextIdx;
      continue;
    }

    // Standard Paragraph
    const para = parseParagraphAt(i);
    i = para.nextIdx;
    htmlParts.push(para.html);
  }

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

export function getCleanText(mdText, { includeFootnotes = false, tableChoices = null, tableIndexOffset = 0 } = {}) {
  const { bodyText, defs } = extractFootnotes(mdText || "");
  const lines = bodyText.split("\n");
  const refOrder = [];
  const refBadgeMap = new Map();
  let choiceTableIdx = 0;

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
      const rawHeaders = splitTableRow(trimmed);
      const isChoice = isChoiceTableHeaders(rawHeaders);
      const headers = rawHeaders.map((h) => cleanInline(h).trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i]).map((c) => cleanInline(c).trim()));
        i += 1;
      }

      if (isChoice) {
        const globalIdx = tableIndexOffset + choiceTableIdx;
        choiceTableIdx += 1;
        const chosenCol =
          tableChoices && (tableChoices[globalIdx] === 0 || tableChoices[globalIdx] === 1)
            ? Number(tableChoices[globalIdx])
            : null;
        if (chosenCol !== null) {
          const colLines = [];
          const strippedHdr = headers[chosenCol].replace(/^(?:EITHER|OR)\s*:?\s*/i, "").trim();
          if (strippedHdr) colLines.push(strippedHdr);
          for (const r of rows) {
            if (r[chosenCol]) colLines.push(r[chosenCol]);
          }
          out.push(colLines.join("\n\n"));
          continue;
        }
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

    if (parseListLine(lines[i])) {
      const items = [];
      let li;
      while (i < lines.length && (li = parseListLine(lines[i]))) {
        items.push(" ".repeat(li.indent) + li.rawMarker + cleanInline(li.text));
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
      if (k === 0) pOut = rendered;
      else if (/ {2,}$/.test(pLines[k - 1])) pOut += "\n" + rendered;
      else pOut += " " + rendered;
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

// ---------------------------------------------------------------------------
// Section & Q&A Slice Extraction (with scoped footnotes & table index offset)
// ---------------------------------------------------------------------------

function appendScopedFootnotes(sliceText, defs) {
  const seen = new Set();
  const refIds = [];
  for (const m of sliceText.matchAll(/\[\^([^\]]+)\]/g)) {
    const id = m[1].trim();
    if (!seen.has(id) && defs.has(id)) {
      seen.add(id);
      refIds.push(id);
    }
  }
  if (refIds.length === 0) return sliceText.trim();
  const fnLines = refIds.map((id) => `[^${id}]: ${defs.get(id)}`);
  return `${sliceText.trim()}\n\n---\n\n${fnLines.join("\n")}`;
}

export function extractSectionMarkdown(mdText, targetSlug, { isLiturgicalForm = false, isReadingsDoc = false } = {}) {
  const { bodyText, defs } = extractFootnotes(mdText || "");
  const lines = bodyText.split("\n");
  const hasExplicitH2 = lines.some((l) => /^#{2,4}\s+/.test(l.trim()));
  const seenSlugs = new Map();

  let startIdx = -1;
  let startLevel = 2;
  let endIdx = lines.length;
  let choiceTablesBefore = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // Track EITHER/OR choice tables appearing before target section
    if (startIdx < 0 && trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      if (isChoiceTableHeaders(splitTableRow(trimmed))) {
        choiceTablesBefore += 1;
      }
    }

    let level = null;
    let rawHeading = null;
    const hMatch = /^(#{2,4})\s+(.+)$/.exec(trimmed);
    if (hMatch) {
      level = hMatch[1].length;
      rawHeading = hMatch[2].trim();
    } else {
      const nextLineIsBlank = i + 1 >= lines.length || lines[i + 1].trim() === "";
      const imp = detectImplicitHeading(trimmed, {
        hasExplicitH2,
        isLiturgicalForm,
        isReadingsDoc,
        nextLineIsBlank,
      });
      if (imp) {
        level = imp.htmlLevel;
        rawHeading = imp.rawText;
      }
    }

    if (level !== null && rawHeading !== null) {
      const base = slugify(rawHeading);
      const count = (seenSlugs.get(base) || 0) + 1;
      seenSlugs.set(base, count);
      const slug = count === 1 ? base : `${base}-${count}`;

      if (startIdx < 0) {
        if (slug === targetSlug) {
          startIdx = i;
          startLevel = level;
        }
      } else if (level <= startLevel) {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx < 0) return { markdown: "", tableIndexOffset: 0 };
  const slice = lines.slice(startIdx, endIdx).join("\n");
  return {
    markdown: appendScopedFootnotes(slice, defs),
    tableIndexOffset: choiceTablesBefore,
  };
}

export function extractQaMarkdown(mdText, qaNum) {
  const { bodyText, defs } = extractFootnotes(mdText || "");
  const lines = bodyText.split("\n");
  const targetRe = new RegExp(`^\\*\\*Q\\.\\s*${Number(qaNum)}\\.\\s*`);

  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (startIdx < 0) {
      if (targetRe.test(trimmed)) startIdx = i;
    } else if (/^---+$/.test(trimmed) || /^#{1,4}\s+/.test(trimmed) || isQaQuestionStart(trimmed)) {
      endIdx = i;
      break;
    }
  }

  if (startIdx < 0) return "";
  return appendScopedFootnotes(lines.slice(startIdx, endIdx).join("\n"), defs);
}

export function extractWcfSectionMarkdown(mdText, chapterNum, sectionNum) {
  const { bodyText, defs } = extractFootnotes(mdText || "");
  const lines = bodyText.split("\n");
  const chRe = new RegExp(`^##\\s+Chapter\\s+${Number(chapterNum)}\\b`, "i");
  const secRe = new RegExp(`^\\*\\*${Number(sectionNum)}\\.\\*\\*\\s+`);

  let inChapter = false;
  let chapterHeadingLine = "";
  let secLine = "";

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!inChapter) {
      if (chRe.test(trimmed)) {
        inChapter = true;
        chapterHeadingLine = trimmed;
      }
      continue;
    }
    if (/^##\s+/.test(trimmed)) break;
    if (secRe.test(trimmed)) {
      secLine = trimmed;
      break;
    }
  }

  if (!secLine) return "";
  return appendScopedFootnotes(`${chapterHeadingLine}\n\n${secLine}`, defs);
}

/**
 * Render pure semantic HTML (no UI chrome, buttons, or unselected EITHER/OR columns)
 * suitable for dual-format clipboard copy (Word / Google Docs) and .doc export.
 */
export function getCleanHtml(
  mdText,
  {
    includeFootnotes = false,
    tableChoices = null,
    tableIndexOffset = 0,
    isLiturgicalForm = false,
    isReadingsDoc = false,
  } = {}
) {
  const { bodyText, defs } = extractFootnotes(mdText || "");
  const lines = bodyText.split("\n");
  const hasExplicitH2 = lines.some((l) => /^#{2,4}\s+/.test(l.trim()));
  const refOrder = [];
  const refBadgeMap = new Map();
  let choiceTableIdx = 0;

  function trackRef(id) {
    if (!refBadgeMap.has(id)) {
      const seq = refOrder.length + 1;
      refBadgeMap.set(id, formatFootnoteDisplay(id, seq));
      refOrder.push(id);
    }
    return refBadgeMap.get(id);
  }

  function renderCleanInline(raw) {
    let safe = escapeWithSafeBr(raw);
    const fnTokens = [];
    safe = safe.replace(/\[\^([^\]]+)\]/g, (_, idRaw) => {
      if (!includeFootnotes) return "";
      const badge = trackRef(idRaw.trim());
      const token = `\u0000CFN_${fnTokens.length}\u0000`;
      fnTokens.push(`<sup>[${escapeHtml(badge)}]</sup>`);
      return token;
    });
    safe = safe.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
    safe = safe.replace(/\u0000CFN_(\d+)\u0000/g, (_, idx) => fnTokens[Number(idx)]);
    return safe;
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
      out.push("<hr>");
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
      out.push(`<h${level}>${renderCleanInline(heading)}</h${level}>`);
      i += 1;
      continue;
    }

    const nextBlank = i + 1 >= lines.length || lines[i + 1].trim() === "";
    const imp = detectImplicitHeading(trimmed, {
      hasExplicitH2,
      isLiturgicalForm,
      isReadingsDoc,
      nextLineIsBlank: nextBlank,
    });
    if (imp) {
      out.push(`<h${imp.htmlLevel}>${renderCleanInline(imp.rawText)}</h${imp.htmlLevel}>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const rawHeaders = splitTableRow(trimmed);
      const isChoice = isChoiceTableHeaders(rawHeaders);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        bodyRows.push(splitTableRow(lines[i]));
        i += 1;
      }

      if (isChoice) {
        const globalIdx = tableIndexOffset + choiceTableIdx;
        choiceTableIdx += 1;
        const chosenCol =
          tableChoices && (tableChoices[globalIdx] === 0 || tableChoices[globalIdx] === 1)
            ? Number(tableChoices[globalIdx])
            : null;
        if (chosenCol !== null) {
          const strippedHdr = rawHeaders[chosenCol].replace(/^(?:EITHER|OR)\s*:?\s*/i, "").trim();
          if (strippedHdr) out.push(`<p><strong>${renderCleanInline(strippedHdr)}</strong></p>`);
          for (const r of bodyRows) {
            const cell = (r[chosenCol] ?? "").trim();
            if (cell) out.push(`<p>${renderCleanInline(cell)}</p>`);
          }
          continue;
        }
      }

      const ths = rawHeaders.map((c) => `<th>${renderCleanInline(c)}</th>`).join("");
      const trs = bodyRows
        .map((row) => `<tr>${rawHeaders.map((_, idx) => `<td>${renderCleanInline(row[idx] ?? "")}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      const attrs = isNotAdoptedBlockquote(quoteLines)
        ? ' style="border-left: 3px solid #B42318; background: #FEF3F2; color: #B42318; padding: 6px 10px;"'
        : "";
      out.push(renderBlockquoteHtml(quoteLines, renderCleanInline, attrs));
      continue;
    }

    if (parseListLine(lines[i])) {
      const listBlock = parseListBlock(lines, i, renderCleanInline, (idx) => {
        const t = lines[idx]?.trim() || "";
        const nb = idx + 1 >= lines.length || lines[idx + 1].trim() === "";
        return detectImplicitHeading(t, { hasExplicitH2, isLiturgicalForm, isReadingsDoc, nextLineIsBlank: nb });
      });
      out.push(listBlock.html);
      i = listBlock.nextIdx;
      continue;
    }

    const pLines = [];
    while (i < lines.length && lines[i].trim() && !isBlockStarter(lines[i])) {
      if (pLines.length > 0) {
        const nb = i + 1 >= lines.length || lines[i + 1].trim() === "";
        if (detectImplicitHeading(lines[i].trim(), { hasExplicitH2, isLiturgicalForm, isReadingsDoc, nextLineIsBlank: nb })) {
          break;
        }
      }
      pLines.push(lines[i]);
      i += 1;
    }
    let paraHtml = "";
    for (let k = 0; k < pLines.length; k += 1) {
      const rendered = renderCleanInline(pLines[k].trim());
      if (k === 0) paraHtml = rendered;
      else if (/ {2,}$/.test(pLines[k - 1])) paraHtml += `<br>${rendered}`;
      else paraHtml += ` ${rendered}`;
    }
    out.push(`<p>${paraHtml}</p>`);
  }

  if (includeFootnotes && defs.size > 0) {
    for (const id of defs.keys()) trackRef(id);
    const fnItems = refOrder
      .filter((id) => defs.has(id))
      .map((id) => `<li><strong>[${escapeHtml(formatFootnoteListLabel(id, refBadgeMap.get(id)))}]</strong> ${escapeHtml(defs.get(id))}</li>`);
    if (fnItems.length > 0) {
      out.push(`<hr><h3>Footnotes &amp; Scripture References</h3><ol>${fnItems.join("")}</ol>`);
    }
  }

  return `<div style="font-family: Georgia, Cambria, 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.55; color: #111111;">${out.join("\n")}</div>`;
}
