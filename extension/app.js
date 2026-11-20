import { parseMarkdown, getCleanText } from "./markdown.js";

const DEFAULT_SETTINGS = {
  sourceMode: "github",
  githubOwner: "Aussie-App-Studio",
  githubRepo: "crca-forms-and-documents",
  githubBranch: "main",
  customBaseUrl: "http://127.0.0.1:8765",
  theme: "light",
  fontSize: 16,
  showFootnotes: true,
  bookmarks: [],
  recentDocs: [],
};

const CACHE_STORAGE_KEY = "crcaCache_v1";

const state = {
  mode: "popup",
  settings: { ...DEFAULT_SETTINGS },
  cache: { byBase: {} },
  index: null,
  searchIndex: null,
  activeCategory: "all",
  collapsedGroups: new Set(),
  currentDoc: null,
  currentMarkdown: "",
  currentParsed: null,
  searchQuery: "",
  searchIndexLoading: false,
  toastTimer: null,
};

const el = {
  body: document.body,
  brandBtn: document.getElementById("brandBtn"),
  sourceSubtitle: document.getElementById("sourceSubtitle"),
  refreshBtn: document.getElementById("refreshBtn"),
  themeBtn: document.getElementById("themeBtn"),
  sidePanelBtn: document.getElementById("sidePanelBtn"),
  openTabBtn: document.getElementById("openTabBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  errorView: document.getElementById("errorView"),
  errorMessage: document.getElementById("errorMessage"),
  errorUrl: document.getElementById("errorUrl"),
  switchLocalBtn: document.getElementById("switchLocalBtn"),
  retryBtn: document.getElementById("retryBtn"),
  openSettingsFromErrBtn: document.getElementById("openSettingsFromErrBtn"),
  browseView: document.getElementById("browseView"),
  categoryTabs: document.getElementById("categoryTabs"),
  recentSection: document.getElementById("recentSection"),
  catalogList: document.getElementById("catalogList"),
  searchView: document.getElementById("searchView"),
  searchStatus: document.getElementById("searchStatus"),
  searchResults: document.getElementById("searchResults"),
  readerView: document.getElementById("readerView"),
  backBtn: document.getElementById("backBtn"),
  tocSelect: document.getElementById("tocSelect"),
  toggleFootnotesBtn: document.getElementById("toggleFootnotesBtn"),
  copyMenuBtn: document.getElementById("copyMenuBtn"),
  copyMenu: document.getElementById("copyMenu"),
  printBtn: document.getElementById("printBtn"),
  officialPdfLink: document.getElementById("officialPdfLink"),
  bookmarkDocBtn: document.getElementById("bookmarkDocBtn"),
  bookmarkStar: document.getElementById("bookmarkStar"),
  fontDecBtn: document.getElementById("fontDecBtn"),
  fontIncBtn: document.getElementById("fontIncBtn"),
  readerMetaBar: document.getElementById("readerMetaBar"),
  readerSidebarToc: document.getElementById("readerSidebarToc"),
  readerLoading: document.getElementById("readerLoading"),
  readerArticle: document.getElementById("readerArticle"),
  footnotesSection: document.getElementById("footnotesSection"),
  footnotesList: document.getElementById("footnotesList"),
  triggerPrintNowBtn: document.getElementById("triggerPrintNowBtn"),
  closePrintTabBtn: document.getElementById("closePrintTabBtn"),
  fnPopover: document.getElementById("fnPopover"),
  fnPopoverTitle: document.getElementById("fnPopoverTitle"),
  fnPopoverBody: document.getElementById("fnPopoverBody"),
  fnPopoverClose: document.getElementById("fnPopoverClose"),
  fnJumpBottomBtn: document.getElementById("fnJumpBottomBtn"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  cancelSettingsBtn: document.getElementById("cancelSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  githubFields: document.getElementById("githubFields"),
  customFields: document.getElementById("customFields"),
  githubOwnerInput: document.getElementById("githubOwnerInput"),
  githubRepoInput: document.getElementById("githubRepoInput"),
  githubBranchInput: document.getElementById("githubBranchInput"),
  customBaseUrlInput: document.getElementById("customBaseUrlInput"),
  cacheStats: document.getElementById("cacheStats"),
  clearCacheBtn: document.getElementById("clearCacheBtn"),
  toast: document.getElementById("toast"),
};

// ---------------------------------------------------------------------------
// Storage & URL helpers
// ---------------------------------------------------------------------------

function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
}

async function storageGet(keys) {
  if (hasChromeStorage()) {
    return chrome.storage.local.get(keys);
  }
  const out = {};
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) out[k] = JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  return out;
}

async function storageSet(obj) {
  if (hasChromeStorage()) {
    return chrome.storage.local.set(obj);
  }
  for (const [k, v] of Object.entries(obj)) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // ignore
    }
  }
}

function getBaseUrl(settings = state.settings) {
  if (settings.sourceMode === "custom") {
    return (settings.customBaseUrl || "http://127.0.0.1:8765").replace(/\/+$/, "");
  }
  const owner = (settings.githubOwner || DEFAULT_SETTINGS.githubOwner).trim();
  const repo = (settings.githubRepo || DEFAULT_SETTINGS.githubRepo).trim();
  const branch = (settings.githubBranch || DEFAULT_SETTINGS.githubBranch).trim();
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}`;
}

function buildFileUrl(relPath) {
  const base = getBaseUrl();
  const encodedPath = relPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/${encodedPath}`;
}

function getBaseCache(baseUrl = getBaseUrl()) {
  if (!state.cache.byBase[baseUrl]) {
    state.cache.byBase[baseUrl] = { index: null, searchIndex: null, docs: {} };
  }
  return state.cache.byBase[baseUrl];
}

async function persistCache() {
  await storageSet({ [CACHE_STORAGE_KEY]: state.cache });
}

async function saveSettings() {
  await storageSet({ settings: state.settings });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    el.toast.classList.add("hidden");
  }, 2200);
}

// ---------------------------------------------------------------------------
// Theme, typography & view switching
// ---------------------------------------------------------------------------

function applySettingsToDom() {
  el.body.dataset.theme = state.settings.theme === "dark" ? "dark" : "light";
  el.body.style.setProperty("--reader-font-size", `${state.settings.fontSize}px`);
  el.body.classList.toggle("hide-footnotes", !state.settings.showFootnotes);
  el.toggleFootnotesBtn.classList.toggle("btn-active", state.settings.showFootnotes);

  if (state.settings.sourceMode === "custom") {
    el.sourceSubtitle.textContent = `Local/Custom: ${getBaseUrl()}`;
  } else {
    el.sourceSubtitle.textContent = `GitHub: ${state.settings.githubOwner}/${state.settings.githubRepo}`;
  }
}

function setActiveView(viewName) {
  el.errorView.classList.add("hidden");
  el.browseView.classList.add("hidden");
  el.searchView.classList.add("hidden");
  el.readerView.classList.add("hidden");
  hideFnPopover();
  el.copyMenu.classList.add("hidden");

  if (viewName === "error") el.errorView.classList.remove("hidden");
  else if (viewName === "browse") el.browseView.classList.remove("hidden");
  else if (viewName === "search") el.searchView.classList.remove("hidden");
  else if (viewName === "reader") el.readerView.classList.remove("hidden");
}

function allDocumentsFlat() {
  if (!state.index) return [];
  const items = [];
  for (const cat of state.index.categories || []) {
    for (const grp of cat.groups || []) {
      for (const doc of grp.items || []) {
        items.push({ ...doc, categoryId: cat.id, categoryTitle: cat.title, groupTitle: grp.title });
      }
    }
  }
  return items;
}

function findDocById(docId) {
  return allDocumentsFlat().find((d) => d.id === docId) || null;
}

// ---------------------------------------------------------------------------
// Fetching index, search-index, and documents
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} (${res.statusText || "Error"})`);
  }
  return res.json();
}

async function loadLibrary({ forceRefresh = false } = {}) {
  const baseUrl = getBaseUrl();
  const baseCache = getBaseCache(baseUrl);
  const indexUrl = buildFileUrl("index.json");

  if (!forceRefresh && baseCache.index) {
    state.index = baseCache.index;
    state.searchIndex = baseCache.searchIndex || null;
    renderBrowse();
    // Background refresh silently
    fetchJson(indexUrl)
      .then(async (fresh) => {
        baseCache.index = fresh;
        state.index = fresh;
        await persistCache();
        if (!state.currentDoc && !state.searchQuery) renderBrowse();
      })
      .catch(() => {});
    return true;
  }

  try {
    const fresh = await fetchJson(indexUrl);
    baseCache.index = fresh;
    if (forceRefresh) {
      baseCache.searchIndex = null;
      state.searchIndex = null;
    }
    state.index = fresh;
    await persistCache();
    renderBrowse();
    if (forceRefresh) showToast("Library refreshed");
    return true;
  } catch (err) {
    if (baseCache.index) {
      state.index = baseCache.index;
      renderBrowse();
      showToast("Using offline cached library");
      return true;
    }
    el.errorMessage.textContent = `Could not fetch index.json (${err.message}).`;
    el.errorUrl.textContent = indexUrl;
    setActiveView("error");
    return false;
  }
}

async function ensureSearchIndex() {
  const baseCache = getBaseCache();
  if (state.searchIndex) return state.searchIndex;
  if (baseCache.searchIndex) {
    state.searchIndex = baseCache.searchIndex;
    return state.searchIndex;
  }
  if (state.searchIndexLoading) return null;
  state.searchIndexLoading = true;
  try {
    const data = await fetchJson(buildFileUrl("search-index.json"));
    baseCache.searchIndex = data;
    state.searchIndex = data;
    await persistCache();
    return data;
  } catch {
    return null;
  } finally {
    state.searchIndexLoading = false;
  }
}

async function fetchDocumentMarkdown(docPath, { forceRefresh = false } = {}) {
  const baseCache = getBaseCache();
  const cached = baseCache.docs[docPath];
  if (!forceRefresh && cached && typeof cached.text === "string") {
    return { text: cached.text, fromCache: true };
  }
  const url = buildFileUrl(docPath);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    if (cached && typeof cached.text === "string") {
      return { text: cached.text, fromCache: true };
    }
    throw new Error(`HTTP ${res.status} fetching ${docPath}`);
  }
  const text = await res.text();
  baseCache.docs[docPath] = { text, fetchedAt: Date.now() };
  await persistCache();
  return { text, fromCache: false };
}

// ---------------------------------------------------------------------------
// Browse Rendering
// ---------------------------------------------------------------------------

function isBookmarked(docId) {
  return state.settings.bookmarks.includes(docId);
}

async function toggleBookmark(docId) {
  const idx = state.settings.bookmarks.indexOf(docId);
  if (idx >= 0) {
    state.settings.bookmarks.splice(idx, 1);
    showToast("Removed from bookmarks");
  } else {
    state.settings.bookmarks.unshift(docId);
    showToast("Added to bookmarks");
  }
  await saveSettings();
  if (state.currentDoc && state.currentDoc.id === docId) {
    updateBookmarkButton();
  }
  if (!state.currentDoc && !state.searchQuery) {
    renderBrowse();
  }
}

function renderBrowse() {
  setActiveView("browse");
  if (!state.index) return;

  const cats = state.index.categories || [];
  const totalDocs = state.index.documentCount || 0;
  const bookmarkCount = state.settings.bookmarks.length;

  // Category tabs
  const tabs = [
    { id: "all", label: `All (${totalDocs})` },
    ...cats.map((c) => {
      const count = (c.groups || []).reduce((n, g) => n + (g.items || []).length, 0);
      return { id: c.id, label: `${c.title} (${count})` };
    }),
    { id: "bookmarks", label: `Bookmarks (${bookmarkCount})` },
  ];

  el.categoryTabs.innerHTML = "";
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab-pill${state.activeCategory === t.id ? " active" : ""}`;
    btn.textContent = t.label;
    btn.addEventListener("click", () => {
      state.activeCategory = t.id;
      renderBrowse();
    });
    el.categoryTabs.appendChild(btn);
  }

  // Recent strip
  const recents = (state.settings.recentDocs || [])
    .map((id) => findDocById(id))
    .filter(Boolean)
    .slice(0, 4);

  if (recents.length > 0 && state.activeCategory === "all") {
    el.recentSection.classList.remove("hidden");
    el.recentSection.innerHTML = `<div class="section-kicker">Recently Opened</div>`;
    const chips = document.createElement("div");
    chips.className = "recent-chips";
    for (const doc of recents) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "recent-chip";
      chip.textContent = doc.title;
      chip.title = doc.title;
      chip.addEventListener("click", () => openDocument(doc));
      chips.appendChild(chip);
    }
    el.recentSection.appendChild(chips);
  } else {
    el.recentSection.classList.add("hidden");
    el.recentSection.innerHTML = "";
  }

  el.catalogList.innerHTML = "";
  const baseCache = getBaseCache();

  if (state.activeCategory === "bookmarks") {
    const bmDocs = state.settings.bookmarks.map((id) => findDocById(id)).filter(Boolean);
    if (bmDocs.length === 0) {
      el.catalogList.innerHTML = `<div class="setup-card"><p>No bookmarks yet. Click the star &#9734; on any form or confession to save it here for quick access.</p></div>`;
      return;
    }
    const card = renderGroupCard({ id: "bookmarks", title: "Saved Bookmarks", items: bmDocs }, baseCache, false);
    el.catalogList.appendChild(card);
    return;
  }

  const visibleCats =
    state.activeCategory === "all" ? cats : cats.filter((c) => c.id === state.activeCategory);

  for (const cat of visibleCats) {
    if (state.activeCategory === "all") {
      const h = document.createElement("div");
      h.className = "category-heading";
      h.textContent = cat.title;
      el.catalogList.appendChild(h);
    }
    for (const grp of cat.groups || []) {
      const card = renderGroupCard(grp, baseCache, state.collapsedGroups.has(grp.id));
      el.catalogList.appendChild(card);
    }
  }
}

function renderGroupCard(grp, baseCache, isCollapsed) {
  const card = document.createElement("div");
  card.className = "group-card";

  const hdr = document.createElement("button");
  hdr.type = "button";
  hdr.className = "group-header";

  const titleSpan = document.createElement("span");
  titleSpan.textContent = grp.title;

  const metaSpan = document.createElement("span");
  metaSpan.className = "group-meta";
  metaSpan.textContent = `${grp.items.length} ${grp.items.length === 1 ? "item" : "items"} ${isCollapsed ? "▸" : "▾"}`;

  hdr.appendChild(titleSpan);
  hdr.appendChild(metaSpan);

  const itemsWrap = document.createElement("div");
  itemsWrap.className = `group-items${isCollapsed ? " hidden" : ""}`;

  hdr.addEventListener("click", () => {
    if (state.collapsedGroups.has(grp.id)) state.collapsedGroups.delete(grp.id);
    else state.collapsedGroups.add(grp.id);
    renderBrowse();
  });

  for (const doc of grp.items) {
    const row = document.createElement("div");
    row.className = "doc-row";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "doc-open-btn";
    openBtn.addEventListener("click", () => openDocument(doc));

    const titleDiv = document.createElement("span");
    titleDiv.className = "doc-row-title";
    titleDiv.textContent = doc.title;

    const subDiv = document.createElement("span");
    subDiv.className = "doc-row-sub";
    const metaParts = [`${doc.wordCount.toLocaleString()} words`];
    if (doc.footnoteCount > 0) metaParts.push(`${doc.footnoteCount} footnotes`);
    subDiv.textContent = metaParts.join(" · ");

    if (doc.pdfPath) {
      const pdfBadge = document.createElement("span");
      pdfBadge.className = "badge";
      pdfBadge.textContent = "PDF";
      subDiv.appendChild(pdfBadge);
    }
    if (baseCache.docs[doc.path]) {
      const dot = document.createElement("span");
      dot.className = "cached-dot";
      dot.title = "Cached offline";
      subDiv.appendChild(dot);
    }

    openBtn.appendChild(titleDiv);
    openBtn.appendChild(subDiv);

    const starBtn = document.createElement("button");
    starBtn.type = "button";
    const starred = isBookmarked(doc.id);
    starBtn.className = `star-btn${starred ? " starred" : ""}`;
    starBtn.textContent = starred ? "★" : "☆";
    starBtn.title = starred ? "Remove bookmark" : "Bookmark";
    starBtn.setAttribute("aria-label", starBtn.title);
    starBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBookmark(doc.id);
    });

    row.appendChild(openBtn);
    row.appendChild(starBtn);
    itemsWrap.appendChild(row);
  }

  card.appendChild(hdr);
  card.appendChild(itemsWrap);
  return card;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function buildHighlightedSnippet(text, query) {
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx < 0) return "";
  const start = Math.max(0, idx - 55);
  const end = Math.min(text.length, idx + query.length + 115);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const before = escapeHtml(text.slice(start, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length, end));
  return `${prefix}${before}<mark>${match}</mark>${after}${suffix}`;
}

async function handleSearch(query) {
  const q = query.trim();
  state.searchQuery = q;
  el.clearSearchBtn.classList.toggle("hidden", q.length === 0);

  if (!q) {
    if (state.currentDoc) setActiveView("reader");
    else renderBrowse();
    return;
  }

  setActiveView("search");
  if (!state.index) return;

  const qLower = q.toLowerCase();
  const docs = allDocumentsFlat();
  const matched = new Map();

  // 1. Instant match against titles, groups, and headings
  for (const d of docs) {
    let score = 0;
    let matchedHeading = null;
    if (d.title.toLowerCase().includes(qLower)) score += 100;
    if (d.groupTitle.toLowerCase().includes(qLower)) score += 40;
    for (const h of d.headings || []) {
      if (h.text.toLowerCase().includes(qLower)) {
        score += 30;
        if (!matchedHeading) matchedHeading = h;
      }
    }
    if (score > 0) {
      matched.set(d.id, {
        doc: d,
        score,
        headingSlug: matchedHeading ? matchedHeading.slug : null,
        headingText: matchedHeading ? matchedHeading.text : null,
        snippetHtml: matchedHeading ? `Section match: <strong>${escapeHtml(matchedHeading.text)}</strong>` : "",
      });
    }
  }

  renderSearchResults(matched, q, q.length >= 2 && !state.searchIndex);

  // 2. Full-text body search if >= 2 chars
  if (q.length >= 2) {
    const sIdx = await ensureSearchIndex();
    if (state.searchQuery.trim() !== q) return;
    if (sIdx && Array.isArray(sIdx.documents)) {
      for (const sDoc of sIdx.documents) {
        const text = sDoc.text || "";
        const pos = text.toLowerCase().indexOf(qLower);
        if (pos >= 0) {
          const baseDoc = findDocById(sDoc.id);
          if (!baseDoc) continue;
          const existing = matched.get(sDoc.id);
          const snippetHtml = buildHighlightedSnippet(text, q);
          if (existing) {
            existing.score += 15;
            if (!existing.snippetHtml) existing.snippetHtml = snippetHtml;
          } else {
            matched.set(sDoc.id, {
              doc: baseDoc,
              score: 15,
              headingSlug: null,
              snippetHtml,
            });
          }
        }
      }
      renderSearchResults(matched, q, false);
    }
  }
}

function renderSearchResults(matchedMap, query, stillIndexing) {
  const list = Array.from(matchedMap.values()).sort((a, b) => b.score - a.score);
  el.searchStatus.textContent = stillIndexing
    ? `${list.length} title/section matches — searching full text...`
    : `${list.length} ${list.length === 1 ? "result" : "results"} for "${query}"`;

  el.searchResults.innerHTML = "";
  if (list.length === 0 && !stillIndexing) {
    el.searchResults.innerHTML = `<div class="setup-card"><p>No matches found for "${escapeHtml(query)}".</p></div>`;
    return;
  }

  for (const entry of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-card";

    const title = document.createElement("div");
    title.className = "search-card-title";
    title.textContent = entry.doc.title;

    const path = document.createElement("div");
    path.className = "search-card-path";
    path.textContent = `${entry.doc.categoryTitle} › ${entry.doc.groupTitle}`;

    btn.appendChild(title);
    btn.appendChild(path);

    if (entry.snippetHtml) {
      const snip = document.createElement("div");
      snip.className = "search-card-snippet";
      snip.innerHTML = entry.snippetHtml;
      btn.appendChild(snip);
    }

    btn.addEventListener("click", () => {
      openDocument(entry.doc, { scrollToSlug: entry.headingSlug });
    });
    el.searchResults.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Reader View
// ---------------------------------------------------------------------------

function updateBookmarkButton() {
  if (!state.currentDoc) return;
  const starred = isBookmarked(state.currentDoc.id);
  el.bookmarkStar.textContent = starred ? "★" : "☆";
  el.bookmarkDocBtn.classList.toggle("starred", starred);
}

async function openDocument(doc, { scrollToSlug = null, autoPrint = false } = {}) {
  state.currentDoc = doc;
  setActiveView("reader");
  el.readerArticle.innerHTML = "";
  el.footnotesSection.classList.add("hidden");
  el.footnotesList.innerHTML = "";
  el.readerLoading.classList.remove("hidden");
  el.tocSelect.classList.add("hidden");
  el.readerSidebarToc.classList.add("hidden");
  el.officialPdfLink.classList.add("hidden");
  updateBookmarkButton();

  // Track recent docs
  state.settings.recentDocs = [
    doc.id,
    ...(state.settings.recentDocs || []).filter((id) => id !== doc.id),
  ].slice(0, 8);
  saveSettings().catch(() => {});

  try {
    const { text, fromCache } = await fetchDocumentMarkdown(doc.path);
    if (state.currentDoc?.id !== doc.id) return;

    state.currentMarkdown = text;
    const parsed = parseMarkdown(text);
    state.currentParsed = parsed;

    el.readerLoading.classList.add("hidden");
    el.readerArticle.innerHTML = parsed.html;

    // Meta bar
    const metaParts = [doc.categoryTitle || "", doc.groupTitle || ""].filter(Boolean);
    metaParts.push(`${doc.wordCount.toLocaleString()} words`);
    if (fromCache) metaParts.push("Cached offline");
    el.readerMetaBar.textContent = metaParts.join(" · ");

    // Official PDF link
    if (doc.pdfPath) {
      el.officialPdfLink.href = buildFileUrl(doc.pdfPath);
      el.officialPdfLink.classList.remove("hidden");
    }

    // TOC dropdown & wide-tab sidebar TOC
    if (parsed.headings.length >= 2) {
      el.tocSelect.innerHTML = `<option value="">Jump to section...</option>`;
      el.readerSidebarToc.innerHTML = `<div class="sidebar-toc-title">Contents</div>`;
      for (const h of parsed.headings) {
        const opt = document.createElement("option");
        opt.value = h.slug;
        opt.textContent = h.level === 3 ? `  · ${h.text}` : h.text;
        el.tocSelect.appendChild(opt);

        const tocBtn = document.createElement("button");
        tocBtn.type = "button";
        tocBtn.className = `sidebar-toc-link level-${h.level}`;
        tocBtn.textContent = h.text;
        tocBtn.addEventListener("click", () => scrollToHeading(h.slug));
        el.readerSidebarToc.appendChild(tocBtn);
      }
      el.tocSelect.classList.remove("hidden");
      el.readerSidebarToc.classList.remove("hidden");
    }

    // Footnotes list at bottom
    if (parsed.footnotes.length > 0) {
      el.footnotesList.innerHTML = "";
      for (const fn of parsed.footnotes) {
        const li = document.createElement("li");
        li.id = `fn-${fn.id}`;

        const badge = document.createElement("span");
        badge.className = "fn-list-badge";
        badge.textContent = fn.listLabel;

        const body = document.createElement("span");
        body.textContent = fn.text;

        li.appendChild(badge);
        li.appendChild(body);
        el.footnotesList.appendChild(li);
      }
      el.footnotesSection.classList.remove("hidden");
    }

    if (scrollToSlug) {
      setTimeout(() => scrollToHeading(scrollToSlug), 40);
    } else {
      document.getElementById("mainContent").scrollTop = 0;
    }

    if (autoPrint) {
      setTimeout(() => window.print(), 250);
    }
  } catch (err) {
    el.readerLoading.classList.add("hidden");
    el.readerArticle.innerHTML = `<div class="setup-card"><h2>Failed to load document</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function scrollToHeading(slug) {
  const target = document.getElementById(slug);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function showFnPopover(anchorBtn, fnObj) {
  el.fnPopoverTitle.textContent = `Footnote ${fnObj.listLabel}`;
  el.fnPopoverBody.textContent = fnObj.text;
  el.fnJumpBottomBtn.dataset.targetId = `fn-${fnObj.id}`;
  el.fnPopover.classList.remove("hidden");

  const rect = anchorBtn.getBoundingClientRect();
  const popW = Math.min(320, window.innerWidth - 24);
  let left = rect.left;
  if (left + popW > window.innerWidth - 12) {
    left = window.innerWidth - popW - 12;
  }
  if (left < 12) left = 12;

  let top = rect.bottom + 6;
  const popH = el.fnPopover.offsetHeight || 110;
  if (top + popH > window.innerHeight - 12) {
    top = Math.max(12, rect.top - popH - 6);
  }

  el.fnPopover.style.left = `${left}px`;
  el.fnPopover.style.top = `${top}px`;
}

function hideFnPopover() {
  el.fnPopover.classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Settings Modal
// ---------------------------------------------------------------------------

function openSettingsModal() {
  const radios = document.querySelectorAll('input[name="sourceMode"]');
  for (const r of radios) {
    r.checked = r.value === state.settings.sourceMode;
  }
  el.githubOwnerInput.value = state.settings.githubOwner;
  el.githubRepoInput.value = state.settings.githubRepo;
  el.githubBranchInput.value = state.settings.githubBranch;
  el.customBaseUrlInput.value = state.settings.customBaseUrl;
  syncSourceFieldsVisibility();

  const totalCached = Object.values(state.cache.byBase).reduce(
    (sum, entry) => sum + Object.keys(entry.docs || {}).length,
    0
  );
  el.cacheStats.textContent = `Cached documents: ${totalCached}`;
  el.settingsModal.classList.remove("hidden");
}

function syncSourceFieldsVisibility() {
  const selected = document.querySelector('input[name="sourceMode"]:checked')?.value || "github";
  el.githubFields.classList.toggle("hidden", selected !== "github");
  el.customFields.classList.toggle("hidden", selected !== "custom");
}

function closeSettingsModal() {
  el.settingsModal.classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Event Wiring
// ---------------------------------------------------------------------------

function bindEvents() {
  el.brandBtn.addEventListener("click", () => {
    state.currentDoc = null;
    state.searchQuery = "";
    el.searchInput.value = "";
    el.clearSearchBtn.classList.add("hidden");
    renderBrowse();
  });

  el.refreshBtn.addEventListener("click", async () => {
    if (state.currentDoc) {
      await fetchDocumentMarkdown(state.currentDoc.path, { forceRefresh: true });
      await openDocument(state.currentDoc);
      showToast("Document refreshed");
    } else {
      await loadLibrary({ forceRefresh: true });
    }
  });

  el.themeBtn.addEventListener("click", async () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    applySettingsToDom();
    await saveSettings();
  });

  el.sidePanelBtn.addEventListener("click", async () => {
    try {
      if (typeof chrome !== "undefined" && chrome.sidePanel && chrome.windows) {
        const win = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: win.id });
        window.close();
      }
    } catch {
      showToast("Side Panel unavailable in this browser");
    }
  });

  el.openTabBtn.addEventListener("click", () => {
    const base = typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("app.html")
      : "app.html";
    const docParam = state.currentDoc ? `&doc=${encodeURIComponent(state.currentDoc.id)}` : "";
    window.open(`${base}?mode=tab${docParam}`, "_blank");
  });

  el.settingsBtn.addEventListener("click", openSettingsModal);
  el.openSettingsFromErrBtn.addEventListener("click", openSettingsModal);
  el.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  el.cancelSettingsBtn.addEventListener("click", closeSettingsModal);

  for (const r of document.querySelectorAll('input[name="sourceMode"]')) {
    r.addEventListener("change", syncSourceFieldsVisibility);
  }

  el.saveSettingsBtn.addEventListener("click", async () => {
    const mode = document.querySelector('input[name="sourceMode"]:checked')?.value || "github";
    state.settings.sourceMode = mode;
    state.settings.githubOwner = el.githubOwnerInput.value.trim() || DEFAULT_SETTINGS.githubOwner;
    state.settings.githubRepo = el.githubRepoInput.value.trim() || DEFAULT_SETTINGS.githubRepo;
    state.settings.githubBranch = el.githubBranchInput.value.trim() || DEFAULT_SETTINGS.githubBranch;
    state.settings.customBaseUrl = el.customBaseUrlInput.value.trim() || DEFAULT_SETTINGS.customBaseUrl;
    await saveSettings();
    applySettingsToDom();
    closeSettingsModal();
    state.currentDoc = null;
    await loadLibrary({ forceRefresh: true });
  });

  el.clearCacheBtn.addEventListener("click", async () => {
    state.cache = { byBase: {} };
    state.searchIndex = null;
    await persistCache();
    el.cacheStats.textContent = "Cached documents: 0";
    showToast("Offline cache cleared");
  });

  el.switchLocalBtn.addEventListener("click", async () => {
    state.settings.sourceMode = "custom";
    state.settings.customBaseUrl = "http://127.0.0.1:8765";
    await saveSettings();
    applySettingsToDom();
    await loadLibrary({ forceRefresh: true });
  });

  el.retryBtn.addEventListener("click", () => loadLibrary({ forceRefresh: true }));

  el.searchInput.addEventListener("input", (e) => handleSearch(e.target.value));
  el.clearSearchBtn.addEventListener("click", () => {
    el.searchInput.value = "";
    handleSearch("");
    el.searchInput.focus();
  });

  el.backBtn.addEventListener("click", () => {
    state.currentDoc = null;
    if (state.searchQuery) setActiveView("search");
    else renderBrowse();
  });

  el.tocSelect.addEventListener("change", (e) => {
    if (e.target.value) {
      scrollToHeading(e.target.value);
      e.target.value = "";
    }
  });

  el.toggleFootnotesBtn.addEventListener("click", async () => {
    state.settings.showFootnotes = !state.settings.showFootnotes;
    applySettingsToDom();
    await saveSettings();
  });

  el.copyMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.copyMenu.classList.toggle("hidden");
  });

  el.copyMenu.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-copy-mode]");
    if (!item || !state.currentMarkdown) return;
    const mode = item.dataset.copyMode;
    let payload = "";
    let label = "";
    if (mode === "clean") {
      payload = getCleanText(state.currentMarkdown, { includeFootnotes: false });
      label = "Copied clean text!";
    } else if (mode === "footnotes") {
      payload = getCleanText(state.currentMarkdown, { includeFootnotes: true });
      label = "Copied text with footnotes!";
    } else {
      payload = state.currentMarkdown;
      label = "Copied raw Markdown!";
    }
    el.copyMenu.classList.add("hidden");
    try {
      await navigator.clipboard.writeText(payload);
      showToast(label);
    } catch {
      showToast("Clipboard permission denied");
    }
  });

  el.printBtn.addEventListener("click", () => {
    if (!state.currentDoc) return;
    const base = typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("app.html")
      : "app.html";
    window.open(`${base}?mode=print&doc=${encodeURIComponent(state.currentDoc.id)}`, "_blank");
  });

  el.triggerPrintNowBtn.addEventListener("click", () => window.print());
  el.closePrintTabBtn.addEventListener("click", () => window.close());

  el.bookmarkDocBtn.addEventListener("click", () => {
    if (state.currentDoc) toggleBookmark(state.currentDoc.id);
  });

  el.fontDecBtn.addEventListener("click", async () => {
    state.settings.fontSize = Math.max(13, state.settings.fontSize - 1);
    applySettingsToDom();
    await saveSettings();
  });

  el.fontIncBtn.addEventListener("click", async () => {
    state.settings.fontSize = Math.min(22, state.settings.fontSize + 1);
    applySettingsToDom();
    await saveSettings();
  });

  // Event delegation for footnote buttons inside readerArticle
  el.readerArticle.addEventListener("click", (e) => {
    const btn = e.target.closest(".fn-ref");
    if (!btn || !state.currentParsed) return;
    e.stopPropagation();
    const fnId = btn.dataset.fnId;
    const found = state.currentParsed.footnotes.find((f) => f.id === fnId);
    if (found) {
      showFnPopover(btn, found);
    }
  });

  el.fnPopoverClose.addEventListener("click", hideFnPopover);
  el.fnJumpBottomBtn.addEventListener("click", () => {
    const targetId = el.fnJumpBottomBtn.dataset.targetId;
    hideFnPopover();
    if (!targetId) return;
    const li = document.getElementById(targetId);
    if (li) {
      for (const old of el.footnotesList.querySelectorAll(".fn-highlight")) {
        old.classList.remove("fn-highlight");
      }
      li.classList.add("fn-highlight");
      li.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  document.addEventListener("click", (e) => {
    if (!el.copyMenu.contains(e.target) && e.target !== el.copyMenuBtn) {
      el.copyMenu.classList.add("hidden");
    }
    if (!el.fnPopover.contains(e.target) && !e.target.closest(".fn-ref")) {
      hideFnPopover();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== el.searchInput && el.settingsModal.classList.contains("hidden")) {
      if (state.mode !== "print") {
        e.preventDefault();
        el.searchInput.focus();
      }
    } else if (e.key === "Escape") {
      if (!el.settingsModal.classList.contains("hidden")) {
        closeSettingsModal();
      } else if (!el.fnPopover.classList.contains("hidden")) {
        hideFnPopover();
      } else if (!el.copyMenu.classList.contains("hidden")) {
        el.copyMenu.classList.add("hidden");
      } else if (state.currentDoc) {
        state.currentDoc = null;
        if (state.searchQuery) setActiveView("search");
        else renderBrowse();
      } else if (state.searchQuery) {
        el.searchInput.value = "";
        handleSearch("");
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") || "popup";
  const docParam = params.get("doc");
  state.mode = mode;
  el.body.dataset.mode = mode;

  const stored = await storageGet(["settings", CACHE_STORAGE_KEY]);
  if (stored.settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  }
  if (stored[CACHE_STORAGE_KEY] && stored[CACHE_STORAGE_KEY].byBase) {
    state.cache = stored[CACHE_STORAGE_KEY];
  }

  applySettingsToDom();
  bindEvents();

  const loaded = await loadLibrary();
  if (loaded && docParam) {
    const doc = findDocById(docParam);
    if (doc) {
      await openDocument(doc, { autoPrint: mode === "print" });
    }
  }
}

init();
