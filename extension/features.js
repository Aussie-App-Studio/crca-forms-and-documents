/**
 * Domain-specific enhancements for CRCA Forms & Documents:
 * - Clickable Scripture citations (BibleGateway)
 * - Cross-document links
 * - Confessional & liturgical shorthand search
 * - Service Prep form schema detection & live substitution
 * - ProPresenter / presentation slide formatting
 */

export const BIBLE_VERSIONS = ["NIV", "ESV", "NKJV", "NASB", "NRSVUE", "CSB", "KJV"];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const VOID_OR_SELF_CLOSING = /^<(?:br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)\b|\/\s*>$/i;

/**
 * Walk an HTML string and transform only text nodes outside skipTags.
 */
function transformHtmlTextNodes(html, { skipTags = ["a", "button", "code", "pre"], transformText }) {
  const skipSet = new Set(skipTags.map((t) => t.toLowerCase()));
  const parts = String(html).split(/(<[^>]+>)/g);
  const stack = [];
  let skipDepth = 0;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;

    if (part.startsWith("<")) {
      if (part.startsWith("<!--") || VOID_OR_SELF_CLOSING.test(part)) continue;
      const closeMatch = /^<\/([a-zA-Z0-9-]+)\s*>$/.exec(part);
      if (closeMatch) {
        const tag = closeMatch[1].toLowerCase();
        if (skipSet.has(tag) && skipDepth > 0 && stack[stack.length - 1] === tag) {
          stack.pop();
          skipDepth -= 1;
        }
        continue;
      }
      const openMatch = /^<([a-zA-Z0-9-]+)(?:[\s>]|$)/.exec(part);
      if (openMatch) {
        const tag = openMatch[1].toLowerCase();
        if (skipSet.has(tag)) {
          stack.push(tag);
          skipDepth += 1;
        }
      }
    } else if (skipDepth === 0 && /\S/.test(part)) {
      parts[i] = transformText(part);
    }
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// 1. Scripture Citation Linker
// ---------------------------------------------------------------------------

const SINGLE_CHAPTER_BOOKS = new Set([
  "obadiah", "obad", "philemon", "philem", "phlm",
  "2 john", "2 jn", "3 john", "3 jn", "jude",
]);

const BIBLE_BOOK_PATTERN = [
  "1\\s*Chronicles", "1\\s*Chron\\.?", "1\\s*Chr\\.?",
  "2\\s*Chronicles", "2\\s*Chron\\.?", "2\\s*Chr\\.?",
  "1\\s*Corinthians", "1\\s*Cor\\.?",
  "2\\s*Corinthians", "2\\s*Cor\\.?",
  "1\\s*Thessalonians", "1\\s*Thess\\.?",
  "2\\s*Thessalonians", "2\\s*Thess\\.?",
  "1\\s*Timothy", "1\\s*Tim\\.?",
  "2\\s*Timothy", "2\\s*Tim\\.?",
  "1\\s*Samuel", "1\\s*Sam\\.?",
  "2\\s*Samuel", "2\\s*Sam\\.?",
  "1\\s*Kings", "1\\s*Kgs\\.?",
  "2\\s*Kings", "2\\s*Kgs\\.?",
  "1\\s*Peter", "1\\s*Pet\\.?",
  "2\\s*Peter", "2\\s*Pet\\.?",
  "1\\s*John", "1\\s*Jn\\.?",
  "2\\s*John", "2\\s*Jn\\.?",
  "3\\s*John", "3\\s*Jn\\.?",
  "Song\\s+of\\s+Songs", "Song\\s+of\\s+Solomon",
  "Deuteronomy", "Deut\\.?",
  "Ecclesiastes", "Eccles\\.?", "Eccl\\.?",
  "Lamentations", "Lam\\.?",
  "Philippians", "Phil\\.?",
  "Colossians", "Col\\.?",
  "Thessalonians", "Thess\\.?",
  "Revelation", "Rev\\.?",
  "Galatians", "Gal\\.?",
  "Ephesians", "Eph\\.?",
  "Zechariah", "Zech\\.?",
  "Zephaniah", "Zeph\\.?",
  "Habakkuk", "Hab\\.?",
  "Nehemiah", "Neh\\.?",
  "Leviticus", "Lev\\.?",
  "Proverbs", "Prov\\.?",
  "Jeremiah", "Jer\\.?",
  "Ezekiel", "Ezek\\.?",
  "Obadiah", "Obad\\.?",
  "Philemon", "Philem\\.?", "Phlm\\.?",
  "Malachi", "Mal\\.?",
  "Matthew", "Matt\\.?", "Mat\\.?", "Mt\\.?",
  "Genesis", "Gen\\.?",
  "Numbers", "Num\\.?",
  "Timothy", "Tim\\.?",
  "Hebrews", "Heb\\.?",
  "Corinthians", "Cor\\.?",
  "Exodus", "Exod\\.?", "Ex\\.?",
  "Joshua", "Josh\\.?",
  "Judges", "Judg\\.?",
  "Esther", "Esth\\.?",
  "Psalms", "Psalm", "Psa\\.?", "Ps\\.?",
  "Isaiah", "Isa\\.?",
  "Daniel", "Dan\\.?",
  "Haggai", "Hag\\.?",
  "Samuel", "Sam\\.?",
  "Romans", "Rom\\.?",
  "Hosea", "Hos\\.?",
  "Jonah", "Micah", "Mic\\.?", "Nahum", "Nah\\.?",
  "James", "Jas\\.?",
  "Peter", "Pet\\.?",
  "Chronicles",
  "Kings",
  "Titus", "Tit\\.?",
  "Amos",
  "Joel",
  "Ruth",
  "Ezra",
  "Mark", "Mk\\.?",
  "Luke", "Lk\\.?",
  "John", "Jn\\.?",
  "Acts",
  "Jude",
  "Job",
].join("|");

const VERSE_LIST = "\\d+[a-z]?(?:\\s*[-–—]\\s*\\d+[a-z]?)?(?:\\s*,\\s*\\d+[a-z]?(?:\\s*[-–—]\\s*\\d+[a-z]?)?)*";
const CITATION_NUMBERS = `\\d+(?::${VERSE_LIST}(?:\\s*[-–—]\\s*\\d+:${VERSE_LIST})?|\\s*[-–—]\\s*\\d+(?::${VERSE_LIST})?)?`;
const CHAIN_ITEM = `\\d+(?::${VERSE_LIST}(?:\\s*[-–—]\\s*\\d+:${VERSE_LIST})?|\\s*[-–—]\\s*\\d+(?::${VERSE_LIST})?(?![ \\t]+[A-Za-z])|(?![ \\t]+[A-Za-z]))`;
const CITATION_CHAIN = `(?:\\s*;\\s*${CHAIN_ITEM})*`;
const SCRIPTURE_RE = new RegExp(
  `(?<![A-Za-z0-9])(${BIBLE_BOOK_PATTERN})\\s+(${CITATION_NUMBERS}(?![ \\t]+(?:Cor|Chron|Thess|Tim|Pet|Sam|Kgs|Jn|John|Peter|Timothy|Corinthians|Thessalonians|Kings|Samuel|Chronicles)\\b)${CITATION_CHAIN})`,
  "g"
);

function normalizeBookKey(bookRaw) {
  return bookRaw.replace(/\./g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function buildBibleGatewayLink(displayText, queryText, bibleVersion) {
  const href = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(queryText)}&version=${encodeURIComponent(bibleVersion)}`;
  return `<a class="scripture-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="Read ${escapeHtml(queryText)} (${escapeHtml(bibleVersion)}) on BibleGateway">${displayText}</a>`;
}

export function linkifyScriptureHtml(html, bibleVersion = "NIV", { skipHeadings = false } = {}) {
  const skipTags = skipHeadings ? ["a", "button", "code", "pre", "h1", "h2", "h3"] : ["a", "button", "code", "pre"];
  const version = BIBLE_VERSIONS.includes(bibleVersion) ? bibleVersion : "NIV";

  return transformHtmlTextNodes(html, {
    skipTags,
    transformText: (segment) =>
      segment.replace(SCRIPTURE_RE, (fullMatch, bookRaw, restRaw) => {
        const cleanBook = bookRaw.replace(/\s+/g, " ").trim();
        const bookKey = normalizeBookKey(cleanBook);
        const parts = restRaw.split(/\s*;\s*/);
        const firstRef = parts[0].trim();

        // Guard bare single-word ambiguous names unless followed by chapter:verse, chapter range, or single-chapter book
        const hasColon = firstRef.includes(":");
        const isSingleChapter = SINGLE_CHAPTER_BOOKS.has(bookKey);
        const isSafeChapterBook = /^(psalm|psalms|psa|ps|genesis|gen|exodus|exod|deuteronomy|deut|isaiah|isa|jeremiah|jer|ezekiel|ezek|daniel|dan|matthew|matt|luke|john|acts|romans|rom|1 corinthians|1 cor|2 corinthians|2 cor|galatians|gal|ephesians|eph|philippians|phil|colossians|col|1 thessalonians|1 thess|2 thessalonians|2 thess|1 timothy|1 tim|2 timothy|2 tim|hebrews|heb|1 peter|1 pet|2 peter|2 pet|1 john|1 jn|revelation|rev)$/.test(bookKey);
        if (!hasColon && !isSingleChapter && !isSafeChapterBook && !/[-–—]/.test(firstRef)) {
          return fullMatch;
        }

        if (parts.length === 1) {
          return buildBibleGatewayLink(fullMatch, `${cleanBook} ${firstRef}`, version);
        }

        // Link each semicolon-separated reference under the same book individually
        const segParts = [];
        let cursor = fullMatch.indexOf(restRaw);
        segParts.push(buildBibleGatewayLink(fullMatch.slice(0, cursor) + firstRef, `${cleanBook} ${firstRef}`, version));
        let searchFrom = cursor + firstRef.length;
        for (let k = 1; k < parts.length; k += 1) {
          const ref = parts[k].trim();
          const idx = fullMatch.indexOf(ref, searchFrom);
          segParts.push(fullMatch.slice(searchFrom, idx));
          segParts.push(buildBibleGatewayLink(ref, `${cleanBook} ${ref}`, version));
          searchFrom = idx + ref.length;
        }
        segParts.push(fullMatch.slice(searchFrom));
        return segParts.join("");
      }),
  });
}

// ---------------------------------------------------------------------------
// 2. Cross-Document Linker
// ---------------------------------------------------------------------------

function titleToHtmlRegexText(title) {
  return title
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/['’]/g, "(?:&#39;|['’])")
    .replace(/&/g, "(?:&amp;|&)")
    .replace(/\s+/g, "\\s+");
}

export function linkifyDocRefsHtml(html, allDocs, currentDocId) {
  if (!Array.isArray(allDocs) || allDocs.length === 0) return html;

  const byTitleLower = new Map();
  for (const doc of allDocs) {
    byTitleLower.set(doc.title.toLowerCase().replace(/’/g, "'"), doc);
  }

  const findTitle = (t) => byTitleLower.get(t.toLowerCase().replace(/’/g, "'")) || null;
  const belgicDoc = findTitle("The Belgic Confession");
  const heidelbergDoc = findTitle("The Heidelberg Catechism");
  const canonsDoc = findTitle("The Canons of Dort");
  const wcfDoc = findTitle("The Westminster Confession of Faith");
  const coDoc = findTitle("CRCA Church Order (2022)");
  const finalExamDoc = findTitle("Rules for the Final Examination (2024)");
  const acts2024Doc = findTitle("Acts of Synod (2024)");
  const owbgDoc = findTitle("Our World Belongs to God");
  const apostlesDoc = findTitle("The Apostles' Creed");
  const niceneDoc = findTitle("The Nicene Creed");
  const athanasianDoc = findTitle("The Athanasian Creed");
  const ls1Doc = findTitle("Form for the Celebration of the Lord's Supper (I)");
  const ordMinDoc = findTitle("Form for the Ordination and Installation of Ministers");
  const ordEldDoc = findTitle("Form for the Ordination and Installation of Elders and Deacons");
  const excommDoc = findTitle("Form for Excommunication");
  const readmitDoc = findTitle("Form for the Re-Admission of Excommunicated Persons");
  const marriageDoc = findTitle("Form for the Solemnisation of Marriage");

  const rules = [];
  const addRule = (phrase, doc, slug = null) => {
    if (!doc || doc.id === currentDocId) return;
    rules.push({ phrase, pattern: titleToHtmlRegexText(phrase), docId: doc.id, slug });
  };

  for (const doc of allDocs) {
    addRule(doc.title, doc);
  }

  // Natural aliases found in Alternatives and Options / Form of Subscription / Liturgical Forms
  addRule("Form for the Lord's Supper I", ls1Doc);
  addRule("Belgic Confession of Faith", belgicDoc);
  addRule("Belgic Confession", belgicDoc);
  addRule("Heidelberg Catechism", heidelbergDoc);
  addRule("Canons of Dort", canonsDoc);
  addRule("Westminster Confession of Faith", wcfDoc);
  addRule("Westminster Confession", wcfDoc);
  addRule("Church Order", coDoc);
  addRule("Rules for the Final Examination", finalExamDoc);
  addRule("Final Examination", finalExamDoc);
  addRule("The Acts of Synod 2024", acts2024Doc);
  addRule("Acts of Synod 2024", acts2024Doc);
  addRule("Our World Belongs to God: A Contemporary Testimony", owbgDoc);
  addRule("Apostles' Creed", apostlesDoc);
  addRule("Apostles Creed", apostlesDoc);
  addRule("Nicene Creed", niceneDoc);
  addRule("Athanasian Creed", athanasianDoc);
  addRule("ordination / installation of ministers", ordMinDoc);
  addRule("ordination / installation of elders and deacons", ordEldDoc);
  addRule("form for excommunication prescribed by synod", excommDoc);
  addRule("form for re-admission prescribed by synod", readmitDoc);
  addRule("form for the solemnisation of marriage prescribed by the synod", marriageDoc);

  // Deduplicate by pattern & sort longest first so more specific titles win
  const seen = new Set();
  const uniqueRules = rules
    .filter((r) => {
      const key = r.phrase.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.phrase.length - a.phrase.length);

  // First handle deep section references ("Article N of the Belgic Confession", "Church Order, Article N")
  let result = html;
  if (belgicDoc && belgicDoc.id !== currentDocId) {
    result = transformHtmlTextNodes(result, {
      skipTags: ["a", "button", "h1", "h2", "h3", "h4"],
      transformText: (seg) =>
        seg.replace(/\bArticle\s+(\d{1,2})\s+of\s+the\s+Belgic\s+Confession\b/gi, (match, num) => {
          const heading = (belgicDoc.headings || []).find((h) => new RegExp(`^Article\\s+${num}\\b`, "i").test(h.text));
          const slugAttr = heading ? ` data-doc-slug="${escapeHtml(heading.slug)}"` : "";
          return `<button type="button" class="doc-xref-link" data-doc-id="${escapeHtml(belgicDoc.id)}"${slugAttr}>${match}</button>`;
        }),
    });
  }
  if (coDoc && coDoc.id !== currentDocId) {
    const makeCoXref = (match, num) => {
      const heading = (coDoc.headings || []).find((h) => new RegExp(`^Article\\s+${num}\\b`, "i").test(h.text));
      const slugAttr = heading ? ` data-doc-slug="${escapeHtml(heading.slug)}"` : "";
      return `<button type="button" class="doc-xref-link" data-doc-id="${escapeHtml(coDoc.id)}"${slugAttr}>${match}</button>`;
    };
    result = transformHtmlTextNodes(result, {
      skipTags: ["a", "button", "h1", "h2", "h3", "h4"],
      transformText: (seg) =>
        seg
          .replace(/\b(?:Church\s+Order|C\.O\.),?\s+Art(?:icle)?\.?\s+(\d{1,3})(?:\.?[a-z])?\b/gi, makeCoXref)
          .replace(/\bArticle\s+(\d{1,3})\s+of\s+the\s+Church\s+Order\b/gi, makeCoXref),
    });
  }

  if (uniqueRules.length === 0) return result;

  const combinedRe = new RegExp(`\\b(${uniqueRules.map((r) => r.pattern).join("|")})(?![A-Za-z0-9])`, "gi");
  const ruleMatchers = uniqueRules.map((r) => ({
    ...r,
    re: new RegExp(`^${r.pattern}$`, "i"),
  }));

  return transformHtmlTextNodes(result, {
    skipTags: ["a", "button", "h1", "h2", "h3", "h4"],
    transformText: (seg) =>
      seg.replace(combinedRe, (match) => {
        const rule = ruleMatchers.find((r) => r.re.test(match));
        if (!rule) return match;
        const slugAttr = rule.slug ? ` data-doc-slug="${escapeHtml(rule.slug)}"` : "";
        return `<button type="button" class="doc-xref-link" data-doc-id="${escapeHtml(rule.docId)}"${slugAttr}>${match}</button>`;
      }),
  });
}

/**
 * Linkify internal CRCA Church Order cross-references like "(See Art 51)",
 * "(See Arts 23, 31)", "(See Arts 66.b, c)", and "Article 44.b".
 */
export function linkifyChurchOrderRefsHtml(html, coDoc) {
  if (!coDoc || !Array.isArray(coDoc.headings)) return html;

  const artSlugMap = new Map();
  for (const h of coDoc.headings) {
    const m = /^Article\s+(\d+)\b/i.exec(h.text);
    if (m) artSlugMap.set(Number(m[1]), h.slug);
  }
  if (artSlugMap.size === 0) return html;

  const makeCoButton = (displayText, artNum, subClause = "") => {
    const slug = artSlugMap.get(Number(artNum));
    if (!slug) return displayText;
    const subAttr = subClause ? ` data-co-sub="${escapeHtml(subClause)}"` : "";
    return `<button type="button" class="co-art-ref" data-co-art="${escapeHtml(artNum)}"${subAttr} data-co-slug="${escapeHtml(slug)}" title="Preview Church Order Article ${escapeHtml(artNum)}${subClause ? `.${escapeHtml(subClause)}` : ""}">${displayText}</button>`;
  };

  // First handle parenthetical "(See Art 51)" / "(See Arts 7, 8, 9, ...)" / "(See Arts 66.b, c)"
  let result = transformHtmlTextNodes(html, {
    skipTags: ["a", "button", "h1", "h2", "h3", "h4", "code", "pre"],
    transformText: (seg) =>
      seg.replace(/\(((?:See|Refer(?:\s+to)?)\s+Arts?\.?\s+)([0-9a-z.,\s]+)\)/gi, (full, prefix, listPart) => {
        const linkedList = listPart.replace(/\b(\d{1,3})(?:\.([a-z]))?\b/g, (tok, nStr, sub) =>
          makeCoButton(tok, nStr, sub || "")
        );
        return `(${prefix}${linkedList})`;
      }),
  });

  // Then handle standalone prose "Article 44.b" / "Article 10.a"
  result = transformHtmlTextNodes(result, {
    skipTags: ["a", "button", "h1", "h2", "h3", "h4", "code", "pre"],
    transformText: (seg) =>
      seg.replace(/\bArticle\s+(\d{1,3})(?:\.([a-z]))?\b/g, (full, nStr, sub) =>
        makeCoButton(full, nStr, sub || "")
      ),
  });

  return result;
}

// ---------------------------------------------------------------------------
// 3. Confessional & Liturgical Shorthand Search Parser
// ---------------------------------------------------------------------------

function makeQuickResult(doc, { score = 500, headingSlug = null, headingText = null, qaAnchor = null, snippetHtml = "" }) {
  return {
    doc,
    score,
    headingSlug,
    headingText,
    qaAnchor,
    badge: "Quick Jump",
    snippetHtml,
  };
}

export function parseSearchShortcut(query, allDocs) {
  const q = String(query || "").trim();
  if (!q || !Array.isArray(allDocs) || allDocs.length === 0) return [];

  const hc = allDocs.find((d) => d.id.endsWith("the-heidelberg-catechism"));
  const bc = allDocs.find((d) => d.id.endsWith("the-belgic-confession"));
  const cd = allDocs.find((d) => d.id.endsWith("the-canons-of-dort"));
  const wcf = allDocs.find((d) => d.id.endsWith("the-westminster-confession-of-faith"));
  const co = allDocs.find((d) => d.id.includes("crca-church-order"));
  const acts2024 = allDocs.find((d) => d.id.includes("acts-of-synod-2024"));
  const owbg = allDocs.find((d) => d.id.includes("our-world-belongs-to-god"));
  const results = [];

  // 1. Heidelberg Catechism Lord's Day (LD 1, hc ld 21, lord's day 52)
  const ldMatch = /^(?:hc\s*)?(?:ld|lord['’]?s?\s*day)\s*(\d{1,2})$/i.exec(q);
  if (ldMatch && hc) {
    const n = Number(ldMatch[1]);
    if (n >= 1 && n <= 52) {
      const h = (hc.headings || []).find((hd) => new RegExp(`^Lord['’]s Day\\s+${n}$`, "i").test(hd.text));
      if (h) {
        results.push(makeQuickResult(hc, {
          score: 520,
          headingSlug: h.slug,
          headingText: h.text,
          snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
        }));
      }
    }
  }

  // 2. Heidelberg Catechism Q&A (Q 1, QA 21, Q. 129, question 52, hc q 1)
  const qaMatch = /^(?:hc\s*)?(?:q\.?\s*&?\s*a\.?|qa|question|q\.?)\s*(\d{1,3})$/i.exec(q);
  if (qaMatch && hc) {
    const n = Number(qaMatch[1]);
    if (n >= 1 && n <= 129) {
      results.push(makeQuickResult(hc, {
        score: 520,
        qaAnchor: `qa-${n}`,
        snippetHtml: `Jump directly to <strong>Question &amp; Answer ${n}</strong>`,
      }));
    }
  }

  // 3. Ambiguous "hc <n>"
  const hcNumMatch = /^hc\s*(\d{1,3})$/i.exec(q);
  if (hcNumMatch && hc && results.length === 0) {
    const n = Number(hcNumMatch[1]);
    if (n >= 1 && n <= 52) {
      const h = (hc.headings || []).find((hd) => new RegExp(`^Lord['’]s Day\\s+${n}$`, "i").test(hd.text));
      if (h) {
        results.push(makeQuickResult(hc, {
          score: 520,
          headingSlug: h.slug,
          headingText: h.text,
          snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
        }));
      }
    }
    if (n >= 1 && n <= 129) {
      results.push(makeQuickResult(hc, {
        score: 505,
        qaAnchor: `qa-${n}`,
        snippetHtml: `Jump directly to <strong>Question &amp; Answer ${n}</strong>`,
      }));
    }
  }

  // 4. Belgic Confession Article (BC 14, BC Art 36, Belgic 2)
  const bcMatch = /^(?:bc|belgic(?:\s+confession)?)\s*(?:art(?:icle)?\.?\s*)?(\d{1,2})$/i.exec(q);
  if (bcMatch && bc) {
    const n = Number(bcMatch[1]);
    if (n >= 1 && n <= 37) {
      const h = (bc.headings || []).find((hd) => new RegExp(`^Article\\s+${n}\\b`, "i").test(hd.text));
      if (h) {
        results.push(makeQuickResult(bc, {
          score: 520,
          headingSlug: h.slug,
          headingText: h.text,
          snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
        }));
      }
    }
  }

  // 5. Canons of Dort (CD 1, CD 1:7, CD 3/4:3, CD III/IV Art 5, Dort 5:1)
  const cdMatch = /^(?:cd|dort|canons(?:\s+of\s+dort)?)\s*(3\/4|3-4|34|iii\/iv|i{1,3}|iv|v|[1-5])(?:[:.\s]+(?:art(?:icle)?\.?\s*)?(\d{1,2}))?$/i.exec(q);
  if (cdMatch && cd) {
    const headRaw = cdMatch[1].toLowerCase();
    const artNum = cdMatch[2] ? Number(cdMatch[2]) : null;
    let pointPrefix = null;
    if (headRaw === "1" || headRaw === "i") pointPrefix = "First Main Point";
    else if (headRaw === "2" || headRaw === "ii") pointPrefix = "Second Main Point";
    else if (["3", "4", "3/4", "3-4", "34", "iii", "iv", "iii/iv"].includes(headRaw)) pointPrefix = "Third and Fourth Main Points";
    else if (headRaw === "5" || headRaw === "v") pointPrefix = "Fifth Main Point";

    if (pointPrefix) {
      const headings = cd.headings || [];
      const pointIdx = headings.findIndex((hd) => hd.level === 2 && hd.text.startsWith(pointPrefix));
      if (pointIdx >= 0) {
        if (!artNum) {
          const h = headings[pointIdx];
          results.push(makeQuickResult(cd, {
            score: 520,
            headingSlug: h.slug,
            headingText: h.text,
            snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
          }));
        } else {
          for (let i = pointIdx + 1; i < headings.length; i += 1) {
            if (headings[i].level === 2) break;
            if (new RegExp(`^Article\\s+${artNum}\\b`, "i").test(headings[i].text)) {
              const h = headings[i];
              results.push(makeQuickResult(cd, {
                score: 520,
                headingSlug: h.slug,
                headingText: h.text,
                snippetHtml: `Jump to <strong>${escapeHtml(headings[pointIdx].text.split(":")[0])} &rsaquo; ${escapeHtml(h.text)}</strong>`,
              }));
              break;
            }
          }
        }
      }
    }
  }

  // 5b. Westminster Confession Chapter or Chapter:Section (WCF 1, WCF 1:6, WCF 28.1)
  const wcfMatch = /^(?:wcf|westminster(?:\s+confession)?)\s*(?:ch(?:apter)?\.?\s*)?(\d{1,2})(?:[:.\s]+(?:sec(?:tion)?\.?\s*)?(\d{1,2}))?$/i.exec(q);
  if (wcfMatch && wcf) {
    const ch = Number(wcfMatch[1]);
    const sec = wcfMatch[2] ? Number(wcfMatch[2]) : null;
    if (ch >= 1 && ch <= 33) {
      if (sec) {
        results.push(makeQuickResult(wcf, {
          score: 525,
          qaAnchor: `wcf-${ch}-${sec}`,
          snippetHtml: `Jump directly to <strong>Chapter ${ch}, Section ${sec}</strong>`,
        }));
      } else {
        const h = (wcf.headings || []).find((hd) => new RegExp(`^Chapter\\s+${ch}\\b`, "i").test(hd.text));
        if (h) {
          results.push(makeQuickResult(wcf, {
            score: 520,
            headingSlug: h.slug,
            headingText: h.text,
            snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
          }));
        }
      }
    }
  }

  // 5c. CRCA Church Order Article (CO 71, Church Order Art 5)
  const coMatch = /^(?:co|church\s*order)\s*(?:art(?:icle)?\.?\s*)?(\d{1,3})$/i.exec(q);
  if (coMatch && co) {
    const n = Number(coMatch[1]);
    const h = (co.headings || []).find((hd) => new RegExp(`^Article\\s+${n}\\b`, "i").test(hd.text));
    if (h) {
      results.push(makeQuickResult(co, {
        score: 520,
        headingSlug: h.slug,
        headingText: h.text,
        snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
      }));
    }
  }

  // 5d. Acts of Synod 2024 Article (Synod 2024 Art 15, Synod 24 14, Acts 2024 Art 25, Acts 15)
  const actsMatch = /^(?:(?:the\s+)?acts(?:\s+of\s+synod)?|synod)(?:\s*(?:20)?24)?\s*(?:art(?:icle)?\.?\s*)?(\d{1,2})$/i.exec(q);
  if (actsMatch && acts2024) {
    const n = Number(actsMatch[1]);
    if (n >= 1 && n <= 43) {
      const h = (acts2024.headings || []).find((hd) => new RegExp(`^Article\\s+${n}\\b`, "i").test(hd.text));
      if (h) {
        results.push(makeQuickResult(acts2024, {
          score: 520,
          headingSlug: h.slug,
          headingText: h.text,
          snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
        }));
      }
    }
  }

  // 5e. Our World Belongs to God (OWBG, OWBG 1, Contemporary Testimony 43)
  const owbgMatch = /^(?:owbg|contemporary\s+testimony)(?:\s*(?:art(?:icle)?\.?|para(?:graph)?\.?|#)?\s*(\d{1,2}))?$/i.exec(q);
  if (owbgMatch && owbg) {
    if (owbgMatch[1] === undefined) {
      results.push(makeQuickResult(owbg, {
        score: 500,
        snippetHtml: `Open <strong>${escapeHtml(owbg.title)}</strong>`,
      }));
    } else {
      const n = Number(owbgMatch[1]);
      if (n >= 1 && n <= 58) {
        const sectionRanges = [
          [1, 6, "Preamble"],
          [7, 12, "Creation"],
          [13, 17, "Fall"],
          [18, 22, "Redemption"],
          [23, 28, "Christ"],
          [29, 31, "The Spirit"],
          [32, 33, "Revelation"],
          [34, 40, "God's New People"],
          [41, 54, "The Mission of God's People"],
          [55, 58, "New Creation"],
        ];
        const sec = sectionRanges.find(([lo, hi]) => n >= lo && n <= hi);
        const h = sec ? (owbg.headings || []).find((hd) => hd.text === sec[2]) : null;
        if (h) {
          results.push(makeQuickResult(owbg, {
            score: 520,
            headingSlug: h.slug,
            headingText: h.text,
            snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong> (Stanza ${n})`,
          }));
        }
      }
    }
  }

  // 6. Generic "Art 14" / "Article 36"
  const artMatch = /^art(?:icle)?\.?\s*(\d{1,2})$/i.exec(q);
  if (artMatch && results.length === 0) {
    const n = Number(artMatch[1]);
    if (bc && n >= 1 && n <= 37) {
      const h = (bc.headings || []).find((hd) => new RegExp(`^Article\\s+${n}\\b`, "i").test(hd.text));
      if (h) {
        results.push(makeQuickResult(bc, {
          score: 510,
          headingSlug: h.slug,
          headingText: h.text,
          snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
        }));
      }
    }
    if (cd) {
      let currentMain = "";
      for (const hd of cd.headings || []) {
        if (hd.level === 2) currentMain = hd.text.split(":")[0];
        else if (new RegExp(`^Article\\s+${n}\\b`, "i").test(hd.text)) {
          results.push(makeQuickResult(cd, {
            score: 460,
            headingSlug: hd.slug,
            headingText: hd.text,
            snippetHtml: `Jump to <strong>${escapeHtml(currentMain)} &rsaquo; ${escapeHtml(hd.text)}</strong>`,
          }));
        }
      }
    }
    if (co) {
      const h = (co.headings || []).find((hd) => new RegExp(`^Article\\s+${n}\\b`, "i").test(hd.text));
      if (h) {
        results.push(makeQuickResult(co, {
          score: 440,
          headingSlug: h.slug,
          headingText: h.text,
          snippetHtml: `Jump to <strong>${escapeHtml(h.text)}</strong>`,
        }));
      }
    }
  }

  // 7. Creed shorthands
  const qLower = q.toLowerCase();
  if (/^(?:apostles?|nicene|athanasian)(?:\s+creed)?$/i.test(qLower)) {
    const creed = allDocs.find((d) => d.title.toLowerCase().includes(qLower.replace(/\s+creed$/, "")));
    if (creed) {
      results.push(makeQuickResult(creed, {
        score: 500,
        snippetHtml: `Open <strong>${escapeHtml(creed.title)}</strong>`,
      }));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. Service Prep Mode (Form Personalization & Choice Tables)
// ---------------------------------------------------------------------------

export function isPersonalizableDoc(doc) {
  return Boolean(doc && (doc.categoryId === "liturgical-forms" || doc.id === "01-form-of-subscription"));
}

function splitBodyAndFootnotes(mdText) {
  const normalized = String(mdText || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let firstFnIdx = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\[\^[^\]]+\]:/.test(lines[i])) {
      firstFnIdx = i;
      break;
    }
  }
  return {
    body: lines.slice(0, firstFnIdx).join("\n"),
    tail: firstFnIdx < lines.length ? "\n" + lines.slice(firstFnIdx).join("\n") : "",
  };
}

export function analyzeFormSchema(mdText, doc) {
  if (!isPersonalizableDoc(doc)) return null;

  const { body } = splitBodyAndFootnotes(mdText);
  const hasChoiceTables = /^\|[^\n]*EITHER\b/im.test(body);
  const hasPronouns = /\b(?:he\/she|him\s*\/\s*her|his\s*\/\s*her|his\/hers|himself\/herself|brother\/sister|man\/woman)\b/i.test(body);
  const id = doc.id || "";
  const path = doc.path || "";

  const fields = [];
  let formType = "generic";

  if (id.includes("marriage")) {
    formType = "marriage";
    fields.push(
      { key: "groomFull", label: "Groom's Full Name", type: "text", placeholder: "e.g. Joshua Daniel Smith" },
      { key: "brideFull", label: "Bride's Full Name", type: "text", placeholder: "e.g. Hannah Grace Brown" }
    );
    if (id.includes("solemnisation")) {
      fields.push(
        { key: "groomFirst", label: "Groom's First Name", type: "text", placeholder: "Auto from full name" },
        { key: "brideFirst", label: "Bride's First Name", type: "text", placeholder: "Auto from full name" },
        { key: "groomParents", label: "Groom's Parents", type: "text", placeholder: "e.g. Mr & Mrs Smith" },
        { key: "brideParents", label: "Bride's Parents", type: "text", placeholder: "e.g. Mr & Mrs Brown" }
      );
    } else {
      fields.push(
        { key: "place", label: "Church / Place", type: "text", placeholder: "e.g. CRCA Kingston" },
        { key: "day", label: "Day", type: "text", placeholder: "e.g. Saturday" },
        { key: "date", label: "Date", type: "text", placeholder: "e.g. 14th of November" }
      );
    }
  } else if (id === "01-form-of-subscription") {
    formType = "subscription";
    fields.push(
      { key: "churchName", label: "Reformed Church of...", type: "text", placeholder: "e.g. Kingston" },
      { key: "classisName", label: "Classis of...", type: "text", placeholder: "e.g. Tasmania" }
    );
  } else if (path.includes("01 - Baptism/") && !id.includes("adults")) {
    formType = "baptism-child";
    fields.push(
      { key: "childName", label: "Child's Full Name", type: "text", placeholder: "e.g. Samuel James Doe" },
      { key: "parentsName", label: "Parents' Names", type: "text", placeholder: "e.g. John and Sarah Doe" }
    );
    if (hasPronouns) {
      fields.push({
        key: "pronoun",
        label: "Pronouns",
        type: "pronoun",
        options: [
          { value: "original", label: "he/she" },
          { value: "he", label: "he / him" },
          { value: "she", label: "she / her" },
          { value: "they", label: "they (multiple)" },
        ],
      });
    }
  } else if (id.includes("baptism-of-adults")) {
    formType = "baptism-adult";
    fields.push(
      { key: "candidateName", label: "Candidate Name(s)", type: "text", placeholder: "e.g. Emily Rose Taylor" },
      { key: "baptisedMembers", label: "Professing Baptised Member(s)", type: "text", placeholder: "Optional" },
      { key: "childName", label: "Children's Names (if any)", type: "text", placeholder: "Optional" },
      {
        key: "pronoun",
        label: "Pronouns",
        type: "pronoun",
        options: [
          { value: "original", label: "he/she" },
          { value: "he", label: "he / him" },
          { value: "she", label: "she / her" },
          { value: "they", label: "they (multiple)" },
        ],
      }
    );
  } else if (id.includes("funerals")) {
    formType = "funeral";
    fields.push(
      { key: "personName", label: "Deceased's Full Name", type: "text", placeholder: "e.g. Pieter van Dijk" },
      { key: "shortName", label: "Short / First Name", type: "text", placeholder: "Auto from full name" },
      { key: "bereaved", label: "Bereaved Family", type: "text", placeholder: "e.g. Wife and children" },
      {
        key: "pronoun",
        label: "Reference & Pronouns",
        type: "pronoun",
        options: [
          { value: "original", label: "Original" },
          { value: "brother", label: "brother (he)" },
          { value: "sister", label: "sister (she)" },
          { value: "child-he", label: "child (he)" },
          { value: "child-she", label: "child (she)" },
        ],
      }
    );
  } else if (path.includes("04 - Discipline/")) {
    formType = "discipline";
    fields.push({ key: "personName", label: "Member's Full Name", type: "text", placeholder: "e.g. John Doe" });
    if (/\bAddress\b/.test(body)) {
      fields.push({ key: "address", label: "Address", type: "text", placeholder: "e.g. 12 Church St" });
    }
    if (/\bDate\b/.test(body)) {
      fields.push({ key: "date", label: "Date", type: "text", placeholder: "e.g. Sunday, 15 November" });
    }
    if (hasPronouns) {
      fields.push({
        key: "pronoun",
        label: "Pronouns",
        type: "pronoun",
        options: [
          { value: "original", label: "brother/sister" },
          { value: "brother", label: "brother (he)" },
          { value: "sister", label: "sister (she)" },
        ],
      });
    }
  } else if (id.includes("elders-and-deacons")) {
    formType = "ordination-ed";
    fields.push(
      { key: "elderNames", label: "Elder Name(s)", type: "text", placeholder: "e.g. John Smith, Mark Jones" },
      { key: "deaconNames", label: "Deacon Name(s)", type: "text", placeholder: "e.g. Luke Brown" }
    );
  } else if (path.includes("05 - Ordination")) {
    formType = "ordination";
    fields.push({ key: "personName", label: "Office Bearer Name(s)", type: "text", placeholder: "e.g. Rev. David Miller" });
    if (/(?<!Full\s)\bName\b/.test(body)) {
      fields.push({ key: "shortName", label: "First / Short Name", type: "text", placeholder: "Auto from full name" });
    }
  } else {
    if (/\b(?:Full\s+Name|Name\(s\)\s+of\s+Candidate\(s\)|Name\s+of\s+each\s+Candidate)\b/.test(body)) {
      fields.push({ key: "candidateName", label: "Candidate Name(s)", type: "text", placeholder: "Enter name(s)" });
    }
    if (hasPronouns) {
      fields.push({
        key: "pronoun",
        label: "Pronouns",
        type: "pronoun",
        options: [
          { value: "original", label: "he/she" },
          { value: "he", label: "he / him" },
          { value: "she", label: "she / her" },
          { value: "they", label: "they (multiple)" },
        ],
      });
    }
  }

  if (fields.length === 0 && !hasChoiceTables) return null;

  return { formType, fields, hasChoiceTables };
}

function matchPronounCase(source, replacement) {
  if (!replacement) return source;
  if (/^[A-Z]/.test(source)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function resolvePronounMap(pronounChoice) {
  if (!pronounChoice || pronounChoice === "original") return null;
  if (pronounChoice === "he" || pronounChoice === "brother" || pronounChoice === "child-he") {
    return {
      heShe: "he",
      himHer: "him",
      hisHer: "his",
      hisHers: "his",
      himselfHerself: "himself",
      brotherSister: "brother",
      brothersSisters: "brothers",
      manWoman: "man",
      funeralRelationFull: pronounChoice === "child-he" ? "this child" : "our brother",
      funeralRelationShort: pronounChoice === "child-he" ? "this child" : "brother",
    };
  }
  if (pronounChoice === "she" || pronounChoice === "sister" || pronounChoice === "child-she") {
    return {
      heShe: "she",
      himHer: "her",
      hisHer: "her",
      hisHers: "hers",
      himselfHerself: "herself",
      brotherSister: "sister",
      brothersSisters: "sisters",
      manWoman: "woman",
      funeralRelationFull: pronounChoice === "child-she" ? "this child" : "our sister",
      funeralRelationShort: pronounChoice === "child-she" ? "this child" : "sister",
    };
  }
  if (pronounChoice === "they") {
    return {
      heShe: "they",
      himHer: "them",
      hisHer: "their",
      hisHers: "theirs",
      himselfHerself: "themselves",
      brotherSister: "brothers and sisters",
      brothersSisters: "brothers and sisters",
      manWoman: "men and women",
      funeralRelationFull: "these loved ones",
      funeralRelationShort: "loved ones",
    };
  }
  return null;
}

function cleanVal(v) {
  return typeof v === "string" ? v.trim() : "";
}

function autoFirst(fullVal) {
  const s = cleanVal(fullVal);
  return s ? s.split(/\s+/)[0] : "";
}

export function applyFormPersonalization(mdText, doc, values = {}, { markTokens = false } = {}) {
  if (!isPersonalizableDoc(doc)) {
    return { text: mdText, prepTokens: [] };
  }

  const { body, tail } = splitBodyAndFootnotes(mdText);
  const prepTokens = [];
  const id = doc.id || "";
  const path = doc.path || "";

  function emit(fieldKey, fallbackLabel, replacement) {
    const val = cleanVal(replacement);
    const display = val || fallbackLabel;
    if (!markTokens) {
      return display;
    }
    const idx = prepTokens.length;
    prepTokens.push({ fieldKey, text: display, filled: Boolean(val) });
    return `\u0000PREP_${idx}\u0000`;
  }

  let out = body;

  if (id.includes("marriage")) {
    const groomFull = cleanVal(values.groomFull);
    const brideFull = cleanVal(values.brideFull);
    const groomFirst = cleanVal(values.groomFirst) || autoFirst(groomFull);
    const brideFirst = cleanVal(values.brideFirst) || autoFirst(brideFull);
    const groomParents = cleanVal(values.groomParents);
    const brideParents = cleanVal(values.brideParents);

    out = out.replace(/[\u00a0 ]*Name of Groom's Parents[\u00a0 ]*(?=[,.;:?!\n<]|$)/g, (m, off, s) =>
      (off > 0 && /[^\s>(\n]/.test(s[off - 1]) ? " " : "") + emit("groomParents", "Name of Groom's Parents", groomParents)
    );
    out = out.replace(/[\u00a0 ]*Name of Bride's Parents[\u00a0 ]*(?=[,.;:?!\n<]|$)/g, (m, off, s) =>
      (off > 0 && /[^\s>(\n]/.test(s[off - 1]) ? " " : "") + emit("brideParents", "Name of Bride's Parents", brideParents)
    );
    out = out.replace(/[\u00a0 ]*Name of Groom's Parents[\u00a0 ]+/g, () =>
      " " + emit("groomParents", "Name of Groom's Parents", groomParents) + " "
    );
    out = out.replace(/[\u00a0 ]*Name of Bride's Parents[\u00a0 ]+/g, () =>
      " " + emit("brideParents", "Name of Bride's Parents", brideParents) + " "
    );

    // Pair "Full Name and Full Name" (may wrap across newline or have NBSPs)
    out = out.replace(
      /[\u00a0 ]*Full Name[\u00a0 ]+and([\s\u00a0]+)Full Name[\u00a0 ]*(?=[,.;:?!\n<]|$)/g,
      (m, sep, off, s) => {
        const pre = off > 0 && /[^\s>(\n]/.test(s[off - 1]) && /^[\u00a0 ]/.test(m) ? " " : "";
        const joiner = sep.includes("\n") ? "\n" : " ";
        return `${pre}${emit("groomFull", "Full Name", groomFull)} and${joiner}${emit("brideFull", "Full Name", brideFull)}`;
      }
    );
    out = out.replace(
      /[\u00a0 ]*Full Name[\u00a0 ]+and([\s\u00a0]+)Full Name\b/g,
      (m, sep, off, s) => {
        const pre = off > 0 && /[^\s>(\n]/.test(s[off - 1]) && /^[\u00a0 ]/.test(m) ? " " : "";
        const joiner = sep.includes("\n") ? "\n" : " ";
        return `${pre}${emit("groomFull", "Full Name", groomFull)} and${joiner}${emit("brideFull", "Full Name", brideFull)}`;
      }
    );

    // Pair "Name and Name"
    out = out.replace(
      /(?<!Full[\u00a0 ])[\u00a0 ]*\bName[\u00a0 ]+and([\s\u00a0]+)Name[\u00a0 ]*(?=[,.;:?!\n<]|$)/g,
      (m, sep, off, s) => {
        const pre = off > 0 && /[^\s>(\n]/.test(s[off - 1]) && /^[\u00a0 ]/.test(m) ? " " : "";
        const joiner = sep.includes("\n") ? "\n" : " ";
        return `${pre}${emit("groomFirst", "Name", groomFirst)} and${joiner}${emit("brideFirst", "Name", brideFirst)}`;
      }
    );
    out = out.replace(
      /(?<!Full[\u00a0 ])[\u00a0 ]*\bName[\u00a0 ]+and([\s\u00a0]+)Name\b/g,
      (m, sep, off, s) => {
        const pre = off > 0 && /[^\s>(\n]/.test(s[off - 1]) && /^[\u00a0 ]/.test(m) ? " " : "";
        const joiner = sep.includes("\n") ? "\n" : " ";
        return `${pre}${emit("groomFirst", "Name", groomFirst)} and${joiner}${emit("brideFirst", "Name", brideFirst)}`;
      }
    );

    // Vows (Exchange of Vows columns): groom speaks to wife, bride speaks to husband
    out = out.replace(
      /I,[\u00a0 ]*Full Name[\u00a0 ]*,<br><br>receive you,[\u00a0 ]*Full Name[\u00a0 ]*,<br><br>to be my wife/g,
      () => `I, ${emit("groomFull", "Full Name", groomFull)},<br><br>receive you, ${emit("brideFull", "Full Name", brideFull)},<br><br>to be my wife`
    );
    out = out.replace(
      /I,[\u00a0 ]*Full Name[\u00a0 ]*,<br><br>receive you,[\u00a0 ]*Full Name[\u00a0 ]*,<br><br>to be my husband/g,
      () => `I, ${emit("brideFull", "Full Name", brideFull)},<br><br>receive you, ${emit("groomFull", "Full Name", groomFull)},<br><br>to be my husband`
    );

    // Alternative OR column vows
    out = out.replace(
      /witness that I,[\u00a0 ]*Full Name[\u00a0 ]*,<br><br>receive Full Name([\u00a0 ]*, to be my wife[\s\S]*?<br><br>)Full Name[\u00a0 ]*, all that I am/g,
      (_, mid) =>
        `witness that I, ${emit("groomFull", "Full Name", groomFull)},<br><br>receive ${emit("brideFull", "Full Name", brideFull)}${mid.replace(/^[\u00a0 ]+,/, ",")}${emit("brideFirst", "Full Name", brideFirst || brideFull)}, all that I am`
    );
    out = out.replace(
      /witness that I,[\u00a0 ]*Full Name[\u00a0 ]*, receive<br>Full Name([\u00a0 ]*, to be my husband[\s\S]*?<br><br>)Full Name[\u00a0 ]*, all that I am/g,
      (_, mid) =>
        `witness that I, ${emit("brideFull", "Full Name", brideFull)},<br><br>receive ${emit("groomFull", "Full Name", groomFull)}${mid.replace(/^[\u00a0 ]+,/, ",")}${emit("groomFirst", "Full Name", groomFirst || groomFull)}, all that I am`
    );

    // Remaining ring vows "Full Name , with this ring..." / "Full Name , I give you..."
    out = out.replace(/Full Name[\u00a0 ]*(?=[,.;:?!]|$)/gm, () =>
      emit("brideFirst", "Full Name", brideFirst || brideFull)
    );
    // Standalone "Names" in parents OR column ("together with<br>Names sincerely")
    out = out.replace(/(?<=<br>)\bNames\b/g, () =>
      emit("groomParents", "Names", groomParents || brideParents)
    );
    out = out.replace(/(?<=<br>)\bName(?= and I,)/g, () =>
      emit("brideParents", "Name", brideParents || groomParents)
    );

    if (id.includes("banns")) {
      out = out.replace(/(take place at)\s+Place\b/, (_, pre) => `${pre}\n${emit("place", "Place", values.place)}`);
      out = out.replace(/on[\u00a0 ]+Day\b/, () => `on ${emit("day", "Day", values.day)}`);
      out = out.replace(/the[\u00a0 ]+Date[\u00a0 ]*\./, () => `the ${emit("date", "Date", values.date)}.`);
    }
  } else if (id === "01-form-of-subscription") {
    out = out.replace(/_{5,}(?=\s*\/\s*of the Classis)/, () =>
      emit("churchName", "___________", values.churchName)
    );
    out = out.replace(/_{5,}/, () =>
      emit("classisName", "____________", values.classisName)
    );
  } else if (id.includes("elders-and-deacons")) {
    const elderNames = cleanVal(values.elderNames);
    const deaconNames = cleanVal(values.deaconNames);
    const bothNames = [elderNames, deaconNames].filter(Boolean).join(", ");
    out = out.replace(/[\u00a0 ]*____Names___[\u00a0 ]*/g, () =>
      ` ${emit("deaconNames", "Names", deaconNames)} `
    );
    out = out.replace(/([\u00a0 ]+)\bNames\b([\u00a0 ]+)(?=called to the office of elder)/g, (_, s1, s2) =>
      ` ${emit("elderNames", "Names", elderNames)} `
    );
    out = out.replace(/(Brothers)[\u00a0 ]+\bNames\b([\u00a0 ]*,)/g, (_, pre, post) =>
      `${pre} ${emit("elderNames", "Names", bothNames)},`
    );
  } else {
    const primaryKey = id.includes("baptism-of-adults") || id.includes("profession-of-faith")
      ? "candidateName"
      : path.includes("01 - Baptism/")
        ? "childName"
        : "personName";
    const primaryVal = cleanVal(values[primaryKey]);
    const shortVal = cleanVal(values.shortName) || autoFirst(primaryVal);
    const parentsVal = cleanVal(values.parentsName);
    const childVal = cleanVal(values.childName);
    const baptisedVal = cleanVal(values.baptisedMembers);

    const replacements = [
      { re: /[\u00a0 ]*Name\(s\)\s+of\s+Candidate\(s\)\s+for\s+Adult\s+Baptism[\u00a0 ]*/g, key: "candidateName", label: "Name(s) of Candidate(s) for Adult Baptism", val: cleanVal(values.candidateName) },
      { re: /[\u00a0 ]*Name\(s\)\s+of\s+Baptised\s+Member\(s\)[\u00a0 ]*/g, key: "baptisedMembers", label: "Name(s) of Baptised Member(s)", val: baptisedVal },
      { re: /[\u00a0 ]*Names?\s+of\s+Adults\s+Baptised[\u00a0 ]*/g, key: "candidateName", label: "Name of Adults Baptised", val: cleanVal(values.candidateName) },
      { re: /[\u00a0 ]*Names\s+of\s+all\s+to\s+be\s+baptised,\s+including\s+children\s+\(if\s+any\)[\u00a0 ]*/g, key: "candidateName", label: "Names of all to be baptised, including children (if any)", val: [cleanVal(values.candidateName), childVal].filter(Boolean).join(", ") },
      { re: /[\u00a0 ]*Names\s+of\s+those\s+baptised[\u00a0 ]*/g, key: "candidateName", label: "Names of those baptised", val: [cleanVal(values.candidateName), childVal].filter(Boolean).join(", ") },
      { re: /[\u00a0 ]*Name\(s\)\s+of\s+Candidate\(s\)[\u00a0 ]*/g, key: "candidateName", label: "Name(s) of Candidate(s)", val: cleanVal(values.candidateName) },
      { re: /[\u00a0 ]*Name\s+of\s+each\s+Candidate[\u00a0 ]*/g, key: "candidateName", label: "Name of each Candidate", val: cleanVal(values.candidateName) },
      { re: /[\u00a0 ]*Name\s+of\s+Candidate[\u00a0 ]*/g, key: "candidateName", label: "Name of Candidate", val: cleanVal(values.candidateName) },
      { re: /[\u00a0 ]*Name\(s\)\s+of\s+Child\(ren\)[\u00a0 ]*/g, key: "childName", label: "Name(s) of Child(ren)", val: childVal },
      { re: /[\u00a0 ]*Names?\s+of\s+Children[\u00a0 ]*/g, key: "childName", label: "Name of Children", val: childVal },
      { re: /[\u00a0 ]*Name\s+of\s+[Cc]hild[\u00a0 ]*/g, key: "childName", label: "Name of Child", val: childVal },
      { re: /[\u00a0 ]*Names?\s+of\s+Parents[\u00a0 ]*/g, key: "parentsName", label: "Names of Parents", val: parentsVal },
      { re: /[\u00a0 ]*Full\s+Name[\u00a0 ]*/g, key: primaryKey, label: "Full Name", val: primaryVal },
    ];

    for (const rule of replacements) {
      out = out.replace(rule.re, (match, offset, fullStr) => {
        const prevChar = offset > 0 ? fullStr[offset - 1] : "";
        const nextChar = fullStr[offset + match.length] || "";
        const needPre = /[^\s\n(>\[*]/.test(prevChar) && /^[\u00a0 ]/.test(match);
        const needPost = nextChar && !/^[,.;:?!)\]\n<]/.test(nextChar) && /[\u00a0 ]$/.test(match);
        return `${needPre ? " " : ""}${emit(rule.key, rule.label, rule.val)}${needPost ? " " : ""}`;
      });
    }

    // Standalone Name / Names (avoiding "His name", "the name", "God's name", etc.)
    out = out.replace(/(?<!(?:His|My|Your|the|God's|Christ's|by|in)\s)(?:[\u00a0 ]+)\b(Names?)\b(?:[\u00a0 ]*)(?=[,.;:?!\n]|$)/g, (m, tok, offset, fullStr) => {
      const key = fieldsKeyForShortName(id);
      const val = key === "shortName" ? shortVal : primaryVal;
      return ` ${emit(key, tok, val)}`;
    });
    out = out.replace(/^(Names?)\b[\u00a0 ]*(?=[,])/gm, (m, tok) =>
      emit(fieldsKeyForShortName(id), tok, shortVal || primaryVal)
    );

    if (id.includes("funerals")) {
      out = out.replace(/Husband\s*\/\s*Wife\s*\/\s*Children\s*\/\s*or\s+whoever\s+are\s+the\s+ones\s+most\s+afflicted\s+by\s+bereavement[\u00a0 ]*/g, () =>
        emit("bereaved", "Husband / Wife / Children / bereaved", values.bereaved)
      );
    }

    if (path.includes("04 - Discipline/")) {
      out = out.replace(/of[\u00a0 ]+Address[\u00a0 ]*/g, (m, off, str) => {
        const nextChar = str[off + m.length] || "";
        const needPost = nextChar && !/^[,.;:?!)\]\n<]/.test(nextChar) && /[\u00a0 ]$/.test(m);
        return `of ${emit("address", "Address", values.address)}${needPost ? " " : ""}`;
      });
      out = out.replace(/on[\u00a0 ]+Date[\u00a0 ]*/g, (m, off, str) => {
        const nextChar = str[off + m.length] || "";
        const needPost = nextChar && !/^[,.;:?!)\]\n<]/.test(nextChar) && /[\u00a0 ]$/.test(m);
        return `on ${emit("date", "Date", values.date)}${needPost ? " " : ""}`;
      });
    }
  }

  // Pronoun & gender-slash substitutions
  const pMap = resolvePronounMap(values.pronoun);
  if (pMap) {
    out = out.replace(/\bour brother\s*\/\s*our sister\s*\/\s*this child\b/gi, (m) => matchPronounCase(m, pMap.funeralRelationFull));
    out = out.replace(/\bbrother\s*\/\s*sister\s*\/\s*this child\b/gi, (m) => matchPronounCase(m, pMap.funeralRelationShort));
    out = out.replace(/\b(he\s*\/\s*she|him\s*\/\s*her|his\s*\/\s*hers|his\s*\/\s*her|himself\s*\/\s*herself|brothers\s*\/\s*sisters|brother\s*\/\s*sister|man\s*\/\s*woman)\b/gi, (m) => {
      const k = m.toLowerCase().replace(/\s+/g, "");
      if (k === "he/she") return matchPronounCase(m, pMap.heShe);
      if (k === "him/her") return matchPronounCase(m, pMap.himHer);
      if (k === "his/hers") return matchPronounCase(m, pMap.hisHers);
      if (k === "his/her") return matchPronounCase(m, pMap.hisHer);
      if (k === "himself/herself") return matchPronounCase(m, pMap.himselfHerself);
      if (k === "brothers/sisters") return matchPronounCase(m, pMap.brothersSisters);
      if (k === "brother/sister") return matchPronounCase(m, pMap.brotherSister);
      if (k === "man/woman") return matchPronounCase(m, pMap.manWoman);
      return m;
    });
  }

  return { text: out + tail, prepTokens };
}

function fieldsKeyForShortName(docId) {
  if (docId.includes("funerals") || docId.includes("ministers")) return "shortName";
  if (docId.includes("baptism-of-adults") || docId.includes("profession-of-faith")) return "candidateName";
  return "personName";
}

// ---------------------------------------------------------------------------
// 5. Presentation / Slide Formatter (ProPresenter, PowerPoint, EasyWorship)
// ---------------------------------------------------------------------------

export function formatForSlides(cleanText, { maxChars = 230, maxLines = 4 } = {}) {
  const paragraphs = String(cleanText || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const slides = [];
  let poeticBuf = [];

  const flushPoetic = () => {
    if (poeticBuf.length > 0) {
      slides.push(poeticBuf.join("\n"));
      poeticBuf = [];
    }
  };

  for (const para of paragraphs) {
    if (/^-{3,}$/.test(para)) {
      flushPoetic();
      continue;
    }

    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    const isShortLineBlock = lines.every((l) => l.length <= 75) && para.length <= maxChars;

    // Group short poetic / responsive / creed lines together up to maxLines / maxChars
    if (isShortLineBlock && !/^(?:Q\.|A\.|\d+\.)\s/.test(para)) {
      const candidateText = [...poeticBuf, ...lines].join("\n");
      if (poeticBuf.length > 0 && (poeticBuf.length + lines.length > maxLines || candidateText.length > maxChars)) {
        flushPoetic();
      }
      poeticBuf.push(...lines);
      continue;
    }

    flushPoetic();

    if (para.length <= maxChars) {
      slides.push(para);
      continue;
    }

    // Split longer paragraphs on sentence boundaries
    const sentences = para.split(/(?<=[.!?]["”']?)\s+/);
    let chunk = "";
    for (const s of sentences) {
      if (!chunk) {
        chunk = s;
      } else if (chunk.length + 1 + s.length <= maxChars) {
        chunk += " " + s;
      } else {
        slides.push(chunk);
        chunk = s;
      }
    }
    if (chunk) slides.push(chunk);
  }

  flushPoetic();
  return slides.join("\n\n");
}

// ---------------------------------------------------------------------------
// 6. Word / Bulletin (.doc) Document Builder
// ---------------------------------------------------------------------------

export function buildWordDocumentHtml(title, cleanHtml) {
  const safeTitle = escapeHtml(title || "CRCA Document");
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    @page { margin: 20mm; }
    body { font-family: Georgia, Cambria, "Times New Roman", serif; font-size: 11.5pt; line-height: 1.55; color: #111111; }
    h1 { font-size: 18pt; color: #1B365D; border-bottom: 1.5pt solid #A67C2E; padding-bottom: 4pt; margin-bottom: 12pt; }
    h2 { font-size: 14pt; color: #1B365D; margin-top: 16pt; margin-bottom: 6pt; }
    h3 { font-size: 12pt; color: #1B365D; margin-top: 12pt; margin-bottom: 4pt; }
    h4 { font-size: 11pt; color: #1B365D; margin-top: 10pt; margin-bottom: 4pt; }
    p { margin: 0 0 8pt 0; }
    blockquote { margin: 8pt 0 8pt 14pt; padding-left: 10pt; border-left: 2.5pt solid #A67C2E; color: #333333; }
    table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
    th, td { border: 1pt solid #CCCCCC; padding: 6pt 8pt; vertical-align: top; text-align: left; }
    th { background: #F2EFE9; font-weight: bold; }
    sup { font-size: 8pt; }
  </style>
</head>
<body>
${cleanHtml}
</body>
</html>`;
}
