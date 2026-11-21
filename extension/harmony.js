/**
 * Parallel Confessional Harmony & Bidirectional Church Order <-> Liturgical Forms mapping.
 * Resolves all targets dynamically against index.json document metadata.
 */

const DOC_ALIASES = {
  subscription: { suffix: "01-form-of-subscription", label: "Form of Subscription" },
  apostles: { suffix: "the-apostles-creed", label: "Apostles' Creed" },
  nicene: { suffix: "the-nicene-creed", label: "Nicene Creed" },
  athanasian: { suffix: "the-athanasian-creed", label: "Athanasian Creed" },
  "baptism-1": { suffix: "baptism-of-the-children-of-believers-i", label: "Baptism Form I" },
  "baptism-2": { suffix: "baptism-of-the-children-of-believers-ii", label: "Baptism Form II" },
  "baptism-adults": { suffix: "baptism-of-adults", label: "Adult Baptism Form" },
  profession: { suffix: "public-profession-of-faith", label: "Profession of Faith" },
  "ls-prep-1": { suffix: "preparation-of-the-lords-supper-i", label: "Lord's Supper Prep I" },
  "ls-cel-1": { suffix: "celebration-of-the-lords-supper-i", label: "Lord's Supper Form I" },
  "ls-cel-4": { suffix: "celebration-of-the-lords-supper-iv", label: "Lord's Supper Form IV" },
  "disc-1": { suffix: "public-exhortations-re-communicant-members", label: "Discipline: Exhortations" },
  "disc-2": { suffix: "form-for-excommunication", label: "Excommunication Form" },
  "disc-4": { suffix: "form-for-the-re-admission-of-excommunicated-persons", label: "Re-Admission Form" },
  "disc-5": { suffix: "baptised-members-living-in-unbelief-and-sin", label: "Discipline: Baptised Members" },
  "ord-all": { suffix: "ordination-and-installation-of-office-bearers", label: "Ordination Form" },
  "ord-min": { suffix: "ordination-and-installation-of-ministers", label: "Ordination: Ministers" },
  "ord-ed": { suffix: "ordination-and-installation-of-elders-and-deacons", label: "Ordination: Elders & Deacons" },
  marriage: { suffix: "solemnisation-of-marriage", label: "Marriage Form" },
  banns: { suffix: "marriage-banns", label: "Marriage Banns" },
  funerals: { suffix: "guidelines-for-funerals", label: "Funeral Guidelines" },
  law: { suffix: "readings-of-the-law", label: "Readings of the Law" },
  calls: { suffix: "calls-to-worship", label: "Calls to Worship" },
  greetings: { suffix: "greetings-and-benedictions", label: "Greetings & Benedictions" },
  pardon: { suffix: "assurances-of-pardon", label: "Assurances of Pardon" },
  offerings: { suffix: "readings-at-the-offerings", label: "Readings at Offerings" },
};

function expandRangeSpecs(specs) {
  const out = [];
  for (const raw of specs) {
    const colonIdx = raw.indexOf(":");
    const prefix = raw.slice(0, colonIdx);
    const body = raw.slice(colonIdx + 1);
    if (prefix === "doc" || prefix === "cd" || body === "note") {
      out.push(raw);
      continue;
    }
    for (const part of body.split(",")) {
      const rangeM = /^(\d+)\.\.(\d+)$/.exec(part.trim());
      if (rangeM) {
        const start = Number(rangeM[1]);
        const end = Number(rangeM[2]);
        for (let n = start; n <= end; n += 1) {
          out.push(`${prefix}:${n}`);
        }
      } else {
        out.push(`${prefix}:${part.trim()}`);
      }
    }
  }
  return out;
}

const HARMONY_TOPICS = [
  { id: "scripture", title: "Holy Scripture", refs: expandRangeSpecs(["bc:2..7", "wcf:1", "hc:6"]) },
  { id: "trinity", title: "God & Trinity", refs: expandRangeSpecs(["bc:1,8..11", "hc:8..9", "wcf:2", "doc:athanasian", "doc:nicene"]) },
  { id: "election", title: "Election & Decree", refs: expandRangeSpecs(["bc:16", "cd:1", "wcf:3"]) },
  { id: "creation", title: "Creation", refs: expandRangeSpecs(["bc:12", "hc:9", "wcf:4"]) },
  { id: "providence", title: "Providence", refs: expandRangeSpecs(["bc:13", "hc:10", "wcf:5"]) },
  { id: "fall-sin", title: "Fall & Depravity", refs: expandRangeSpecs(["bc:14..15", "hc:2..4", "cd:3/4", "wcf:6,9"]) },
  { id: "mediator", title: "Covenant & Christ", refs: expandRangeSpecs(["bc:17..21", "hc:5..6,11..19", "cd:2", "wcf:7..8", "doc:apostles"]) },
  { id: "calling", title: "Effectual Calling", refs: expandRangeSpecs(["cd:3/4", "hc:33", "wcf:10,15"]) },
  { id: "justification", title: "Justification & Faith", refs: expandRangeSpecs(["bc:22..23", "hc:7,23..24", "wcf:11,14", "doc:pardon"]) },
  { id: "sanctification", title: "Sanctification & Good Works", refs: expandRangeSpecs(["bc:24", "hc:32..33", "wcf:13,16"]) },
  { id: "perseverance", title: "Perseverance & Assurance", refs: expandRangeSpecs(["cd:5", "hc:1,21", "wcf:17..18"]) },
  { id: "law", title: "Law of God", refs: expandRangeSpecs(["bc:25", "hc:34..44", "wcf:19", "doc:law"]) },
  { id: "worship", title: "Worship & Prayer", refs: expandRangeSpecs(["hc:38,45..52", "wcf:21..22", "co:56..59", "doc:calls", "doc:greetings"]) },
  { id: "offices", title: "Church Offices & Subscription", refs: expandRangeSpecs(["bc:31", "co:5,4,2,3,10,22..24", "doc:subscription", "doc:ord-all", "doc:ord-min", "doc:ord-ed"]) },
  { id: "magistrate", title: "Civil Government (1957 Note)", refs: expandRangeSpecs(["bc:36", "wcf:23", "wcf:note", "co:55", "doc:subscription"]) },
  { id: "marriage", title: "Marriage", refs: expandRangeSpecs(["wcf:24", "co:70", "doc:marriage", "doc:banns"]) },
  { id: "church", title: "Church & Assemblies", refs: expandRangeSpecs(["bc:27..30", "hc:21", "wcf:25..26,31", "co:1,25,31,42,48"]) },
  { id: "sacraments", title: "Sacraments", refs: expandRangeSpecs(["bc:33", "hc:25", "wcf:27", "co:60"]) },
  { id: "baptism", title: "Baptism", refs: expandRangeSpecs(["bc:34", "hc:26..27", "wcf:28", "co:61", "doc:baptism-1", "doc:baptism-2", "doc:baptism-adults"]) },
  { id: "profession", title: "Public Profession of Faith", refs: expandRangeSpecs(["co:62", "doc:profession", "doc:baptism-adults"]) },
  { id: "lords-supper", title: "Lord's Supper", refs: expandRangeSpecs(["bc:35", "hc:28..30", "wcf:29", "co:63", "doc:ls-prep-1", "doc:ls-cel-1", "doc:ls-cel-4"]) },
  { id: "offerings", title: "Offerings", refs: expandRangeSpecs(["co:64", "doc:offerings"]) },
  { id: "nurture", title: "Faith Nurture", refs: expandRangeSpecs(["co:65", "hc:1"]) },
  { id: "discipline", title: "Church Discipline", refs: expandRangeSpecs(["bc:32", "hc:31", "wcf:30", "co:76..85", "doc:disc-1", "doc:disc-2", "doc:disc-4", "doc:disc-5"]) },
  { id: "eschatology", title: "Death, Funerals & Judgment", refs: expandRangeSpecs(["bc:37", "hc:19,22", "wcf:32..33", "co:71", "doc:funerals"]) },
];

const CD_PREFIX_MAP = {
  "1": { prefix: "First Main Point", label: "Canons of Dort I" },
  "2": { prefix: "Second Main Point", label: "Canons of Dort II" },
  "3/4": { prefix: "Third and Fourth Main Points", label: "Canons of Dort III/IV" },
  "5": { prefix: "Fifth Main Point", label: "Canons of Dort V" },
};

function findDocBySuffix(allDocs, suffix) {
  return allDocs.find((d) => d.id.endsWith(suffix)) || allDocs.find((d) => d.id.includes(suffix)) || null;
}

function resolveRef(spec, allDocs) {
  const [kind, val] = spec.split(":");
  if (kind === "bc") {
    const doc = findDocBySuffix(allDocs, "the-belgic-confession");
    const h = doc?.headings?.find((hd) => new RegExp(`^Article\\s+${val}\\b`, "i").test(hd.text));
    return doc && h ? { spec, groupOrder: 1, label: `Belgic Art. ${val}`, docId: doc.id, slug: h.slug, title: h.text } : null;
  }
  if (kind === "hc") {
    const doc = findDocBySuffix(allDocs, "the-heidelberg-catechism");
    const h = doc?.headings?.find((hd) => new RegExp(`^Lord['’]s Day\\s+${val}$`, "i").test(hd.text));
    return doc && h ? { spec, groupOrder: 1, label: `Heidelberg LD ${val}`, docId: doc.id, slug: h.slug, title: h.text } : null;
  }
  if (kind === "cd") {
    const doc = findDocBySuffix(allDocs, "the-canons-of-dort");
    const info = CD_PREFIX_MAP[val];
    const h = info && doc?.headings?.find((hd) => hd.level === 2 && hd.text.startsWith(info.prefix));
    return doc && h ? { spec, groupOrder: 1, label: info.label, docId: doc.id, slug: h.slug, title: h.text } : null;
  }
  if (kind === "wcf") {
    const doc = findDocBySuffix(allDocs, "the-westminster-confession-of-faith");
    if (!doc) return null;
    if (val === "note") {
      const h = doc.headings?.find((hd) => hd.text.toLowerCase().includes("crca adoption"));
      return h ? { spec, groupOrder: 1, label: "WCF: CRCA Adoption Note", docId: doc.id, slug: h.slug, title: h.text } : null;
    }
    const h = doc.headings?.find((hd) => new RegExp(`^Chapter\\s+${val}\\b`, "i").test(hd.text));
    return h ? { spec, groupOrder: 1, label: `WCF Ch. ${val}`, docId: doc.id, slug: h.slug, title: h.text } : null;
  }
  if (kind === "co") {
    const doc = findDocBySuffix(allDocs, "crca-church-order-2022");
    const h = doc?.headings?.find((hd) => new RegExp(`^Article\\s+${val}\\b`, "i").test(hd.text));
    return doc && h ? { spec, groupOrder: 2, label: `Church Order Art. ${val}`, docId: doc.id, slug: h.slug, title: h.text } : null;
  }
  if (kind === "doc") {
    const alias = DOC_ALIASES[val];
    if (!alias) return null;
    const doc = findDocBySuffix(allDocs, alias.suffix);
    return doc ? { spec, groupOrder: 3, label: alias.label, docId: doc.id, slug: null, title: doc.title } : null;
  }
  return null;
}

function getSectionKey(doc, headingText) {
  if (!doc || !headingText) return null;
  const id = doc.id || "";
  const txt = headingText.trim();

  if (id.endsWith("the-belgic-confession")) {
    const m = /^Article\s+(\d+)\b/i.exec(txt);
    return m ? `bc:${m[1]}` : null;
  }
  if (id.endsWith("the-heidelberg-catechism")) {
    const m = /^Lord['’]s Day\s+(\d+)$/i.exec(txt);
    return m ? `hc:${m[1]}` : null;
  }
  if (id.endsWith("the-canons-of-dort")) {
    for (const [k, info] of Object.entries(CD_PREFIX_MAP)) {
      if (txt.startsWith(info.prefix)) return `cd:${k}`;
    }
    return null;
  }
  if (id.endsWith("the-westminster-confession-of-faith")) {
    if (txt.toLowerCase().includes("crca adoption")) return "wcf:note";
    const m = /^Chapter\s+(\d+)\b/i.exec(txt);
    return m ? `wcf:${m[1]}` : null;
  }
  if (id.includes("crca-church-order")) {
    const m = /^Article\s+(\d+)\b/i.exec(txt);
    return m ? `co:${m[1]}` : null;
  }
  return null;
}

function collectHarmonyFromKeys(keys, currentDocId, allDocs, limit = 7) {
  const seenDocs = new Set();
  const resolved = [];

  for (const key of keys) {
    for (const topic of HARMONY_TOPICS) {
      if (!topic.refs.includes(key)) continue;
      for (const refSpec of topic.refs) {
        if (refSpec === key) continue;
        const item = resolveRef(refSpec, allDocs);
        if (!item || item.docId === currentDocId) continue;
        const dedupeKey = `${item.docId}::${item.slug || ""}`;
        if (seenDocs.has(dedupeKey)) continue;
        seenDocs.add(dedupeKey);
        resolved.push(item);
      }
    }
  }

  // Prioritize parallel standards (groupOrder 1), Church Order (2), Liturgical Forms (3),
  // keeping at most 2 entries per target document so results stay varied and compact.
  resolved.sort((a, b) => a.groupOrder - b.groupOrder);
  const perDocCount = new Map();
  const final = [];
  for (const item of resolved) {
    const cnt = perDocCount.get(item.docId) || 0;
    if (cnt >= 2) continue;
    perDocCount.set(item.docId, cnt + 1);
    final.push(item);
    if (final.length >= limit) break;
  }
  return final;
}

export function getSectionRelatedLinks(doc, headingText, allDocs) {
  if (!doc || !Array.isArray(allDocs) || allDocs.length === 0) return [];
  const key = getSectionKey(doc, headingText);
  if (!key) return [];
  return collectHarmonyFromKeys([key], doc.id, allDocs, 6);
}

export function getDocumentRelatedLinks(doc, allDocs) {
  if (!doc || !Array.isArray(allDocs) || allDocs.length === 0) return [];
  const id = doc.id || "";
  const keys = [];

  for (const [alias, info] of Object.entries(DOC_ALIASES)) {
    if (id.endsWith(info.suffix)) {
      keys.push(`doc:${alias}`);
    }
  }

  // Include sibling forms in the same liturgical folder so Forms II-IV, Lord's Supper II/III/V, etc. get related standards
  if (keys.length === 0) {
    if (id.includes("baptism-of")) keys.push("doc:baptism-1");
    else if (id.includes("preparation-of-the-lords-supper") || id.includes("celebration-of-the-lords-supper")) keys.push("doc:ls-cel-1");
    else if (id.includes("04-discipline")) keys.push("doc:disc-1");
  }

  if (keys.length === 0) return [];
  return collectHarmonyFromKeys(keys, doc.id, allDocs, 6);
}
