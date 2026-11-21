import {
  parseMarkdown,
  getCleanText,
  getCleanHtml,
  extractSectionMarkdown,
  extractQaMarkdown,
  extractWcfSectionMarkdown,
} from "./markdown.js";
import {
  BIBLE_VERSIONS,
  linkifyScriptureHtml,
  linkifyDocRefsHtml,
  linkifyChurchOrderRefsHtml,
  parseSearchShortcut,
  isPersonalizableDoc,
  analyzeFormSchema,
  applyFormPersonalization,
  formatForSlides,
  buildWordDocumentHtml,
} from "./features.js";
import {
  getSectionRelatedLinks,
  getDocumentRelatedLinks,
} from "./harmony.js";

const DEFAULT_SETTINGS = {
  sourceMode: "github",
  githubOwner: "Aussie-App-Studio",
  githubRepo: "crca-forms-and-documents",
  githubBranch: "main",
  customBaseUrl: "http://127.0.0.1:8765",
  theme: "light",
  fontSize: 16,
  showFootnotes: true,
  bibleVersion: "NIV",
  pulpitMode: false,
  bookmarks: [],
  recentDocs: [],
};

const CACHE_STORAGE_KEY = "crcaCache_v1";
const PREP_STORAGE_KEY = "crcaPrep_v1";
const LAST_STATE_KEY = "crcaLastState_v1";

const state = {
  mode: "popup",
  settings: { ...DEFAULT_SETTINGS },
  cache: { byBase: {} },
  prep: {},
  index: null,
  searchIndex: null,
  activeCategory: "all",
  collapsedGroups: new Set(),
  currentDoc: null,
  currentMarkdown: "",
  currentParsed: null,
  currentSchema: null,
  compareDoc: null,
  compareMarkdown: "",
  compareParsed: null,
  compareReqId: 0,
  popoverCoTarget: null,
  prepExpanded: false,
  pulpitActive: false,
  findOpen: false,
  findHits: [],
  findIndex: -1,
  searchQuery: "",
  searchIndexLoading: false,
  offlineDownloading: false,
  toastTimer: null,
  scrollSaveTimer: null,
};

const el = {
  body: document.body,
  mainContent: document.getElementById("mainContent"),
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
  offlineBanner: document.getElementById("offlineBanner"),
  offlineBannerText: document.getElementById("offlineBannerText"),
  offlineBannerBtn: document.getElementById("offlineBannerBtn"),
  categoryTabs: document.getElementById("categoryTabs"),
  recentSection: document.getElementById("recentSection"),
  catalogList: document.getElementById("catalogList"),
  searchView: document.getElementById("searchView"),
  searchStatus: document.getElementById("searchStatus"),
  searchResults: document.getElementById("searchResults"),
  readerView: document.getElementById("readerView"),
  backBtn: document.getElementById("backBtn"),
  tocSelect: document.getElementById("tocSelect"),
  findBtn: document.getElementById("findBtn"),
  toggleFootnotesBtn: document.getElementById("toggleFootnotesBtn"),
  copyMenuBtn: document.getElementById("copyMenuBtn"),
  copyMenu: document.getElementById("copyMenu"),
  printBtn: document.getElementById("printBtn"),
  officialPdfLink: document.getElementById("officialPdfLink"),
  compareBtn: document.getElementById("compareBtn"),
  pulpitBtn: document.getElementById("pulpitBtn"),
  bookmarkDocBtn: document.getElementById("bookmarkDocBtn"),
  bookmarkStar: document.getElementById("bookmarkStar"),
  fontDecBtn: document.getElementById("fontDecBtn"),
  fontIncBtn: document.getElementById("fontIncBtn"),
  findBar: document.getElementById("findBar"),
  findInput: document.getElementById("findInput"),
  findCount: document.getElementById("findCount"),
  findPrevBtn: document.getElementById("findPrevBtn"),
  findNextBtn: document.getElementById("findNextBtn"),
  findCloseBtn: document.getElementById("findCloseBtn"),
  readerMetaBar: document.getElementById("readerMetaBar"),
  docHarmonyBar: document.getElementById("docHarmonyBar"),
  servicePrepBar: document.getElementById("servicePrepBar"),
  prepStatusBadge: document.getElementById("prepStatusBadge"),
  prepResetBtn: document.getElementById("prepResetBtn"),
  prepToggleBtn: document.getElementById("prepToggleBtn"),
  prepBody: document.getElementById("prepBody"),
  prepFieldsGrid: document.getElementById("prepFieldsGrid"),
  prepChoiceHint: document.getElementById("prepChoiceHint"),
  readerSidebarToc: document.getElementById("readerSidebarToc"),
  readerLoading: document.getElementById("readerLoading"),
  readerArticle: document.getElementById("readerArticle"),
  footnotesSection: document.getElementById("footnotesSection"),
  footnotesList: document.getElementById("footnotesList"),
  readerFooterNav: document.getElementById("readerFooterNav"),
  prevDocBtn: document.getElementById("prevDocBtn"),
  nextDocBtn: document.getElementById("nextDocBtn"),
  comparePane: document.getElementById("comparePane"),
  compareDocSelect: document.getElementById("compareDocSelect"),
  compareTocSelect: document.getElementById("compareTocSelect"),
  compareSwapBtn: document.getElementById("compareSwapBtn"),
  compareCloseBtn: document.getElementById("compareCloseBtn"),
  compareLoading: document.getElementById("compareLoading"),
  compareArticle: document.getElementById("compareArticle"),
  compareFootnotesSection: document.getElementById("compareFootnotesSection"),
  compareFootnotesList: document.getElementById("compareFootnotesList"),
  pulpitBar: document.getElementById("pulpitBar"),
  pulpitExitBtn: document.getElementById("pulpitExitBtn"),
  pulpitPrevSecBtn: document.getElementById("pulpitPrevSecBtn"),
  pulpitNextSecBtn: document.getElementById("pulpitNextSecBtn"),
  pulpitSecLabel: document.getElementById("pulpitSecLabel"),
  pulpitFontDecBtn: document.getElementById("pulpitFontDecBtn"),
  pulpitFontIncBtn: document.getElementById("pulpitFontIncBtn"),
  pulpitThemeBtn: document.getElementById("pulpitThemeBtn"),
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
  bibleVersionSelect: document.getElementById("bibleVersionSelect"),
  cacheStats: document.getElementById("cacheStats"),
  cacheAllBtn: document.getElementById("cacheAllBtn"),
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

async function storageRemove(keys) {
  if (hasChromeStorage()) {
    return chrome.storage.local.remove(keys);
  }
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
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

async function persistPrep() {
  await storageSet({ [PREP_STORAGE_KEY]: state.prep });
}

async function saveSettings() {
  await storageSet({ settings: state.settings });
}

function getScrollTop() {
  return state.mode === "tab" ? window.scrollY : el.mainContent.scrollTop;
}

function setScrollTop(y) {
  if (state.mode === "tab") window.scrollTo(0, y);
  else el.mainContent.scrollTop = y;
}

function saveLastState() {
  if (state.mode === "print") return;
  const payload = {
    docId: state.currentDoc ? state.currentDoc.id : null,
    scrollTop: state.currentDoc ? Math.round(getScrollTop()) : 0,
    activeCategory: state.activeCategory,
    ts: Date.now(),
  };
  storageSet({ [LAST_STATE_KEY]: payload }).catch(() => {});
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
// Theme, typography, Pulpit mode & view switching
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

function setPulpitMode(active) {
  state.pulpitActive = Boolean(active);
  if (state.pulpitActive && state.compareDoc) {
    closeCompare();
  }
  el.body.classList.toggle("pulpit-mode", state.pulpitActive);
  el.pulpitBtn.classList.toggle("btn-active", state.pulpitActive);
  el.pulpitBar.classList.toggle("hidden", !state.pulpitActive);
  if (state.pulpitActive) {
    updatePulpitSectionLabel();
  }
}

function setActiveView(viewName) {
  el.errorView.classList.add("hidden");
  el.browseView.classList.add("hidden");
  el.searchView.classList.add("hidden");
  el.readerView.classList.add("hidden");
  hideFnPopover();
  el.copyMenu.classList.add("hidden");

  if (viewName !== "reader") {
    if (state.pulpitActive) setPulpitMode(false);
    if (state.compareDoc) closeCompare();
  }

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
// Fetching index, search-index, documents & Offline Cache All
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} (${res.statusText || "Error"})`);
  }
  return res.json();
}

async function loadLibrary({ forceRefresh = false, deferRender = false } = {}) {
  const baseUrl = getBaseUrl();
  const baseCache = getBaseCache(baseUrl);
  const indexUrl = buildFileUrl("index.json");

  if (!forceRefresh && baseCache.index) {
    state.index = baseCache.index;
    state.searchIndex = baseCache.searchIndex || null;
    if (!deferRender) renderBrowse();
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
    if (!deferRender) renderBrowse();
    if (forceRefresh) showToast("Library refreshed");
    return true;
  } catch (err) {
    if (baseCache.index) {
      state.index = baseCache.index;
      if (!deferRender) renderBrowse();
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

function getCacheProgress() {
  const docs = allDocumentsFlat();
  const baseCache = getBaseCache();
  let cachedCount = 0;
  for (const d of docs) {
    if (baseCache.docs[d.path]?.text) cachedCount += 1;
  }
  return { cachedCount, totalCount: docs.length };
}

function updateCacheUiIndicators() {
  const { cachedCount, totalCount } = getCacheProgress();
  if (totalCount > 0 && cachedCount < totalCount && !state.offlineDownloading) {
    el.offlineBanner.classList.remove("hidden");
    el.offlineBannerText.textContent = `Offline availability: ${cachedCount} of ${totalCount} documents cached (~1 MB total)`;
    el.offlineBannerBtn.disabled = false;
    el.offlineBannerBtn.textContent = "Download All Offline";
  } else if (!state.offlineDownloading) {
    el.offlineBanner.classList.add("hidden");
  }

  if (totalCount > 0) {
    el.cacheStats.textContent = `Offline library: ${cachedCount} / ${totalCount} documents cached`;
  } else {
    el.cacheStats.textContent = `Cached documents: ${cachedCount}`;
  }
  el.cacheAllBtn.disabled = state.offlineDownloading || (totalCount > 0 && cachedCount === totalCount);
  el.cacheAllBtn.textContent =
    totalCount > 0 && cachedCount === totalCount ? "All Cached Offline" : "Download All Offline";
}

async function downloadAllOffline() {
  if (state.offlineDownloading || !state.index) return;
  const docs = allDocumentsFlat();
  const baseCache = getBaseCache();
  const missing = docs.filter((d) => !baseCache.docs[d.path]?.text);

  state.offlineDownloading = true;
  el.offlineBannerBtn.disabled = true;
  el.cacheAllBtn.disabled = true;
  el.offlineBannerBtn.textContent = "Downloading...";
  el.cacheAllBtn.textContent = "Downloading...";

  try {
    await ensureSearchIndex();
    let done = docs.length - missing.length;
    const total = docs.length;
    const BATCH_SIZE = 6;
    let failed = 0;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (doc) => {
          try {
            const res = await fetch(buildFileUrl(doc.path), { cache: "no-cache" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            baseCache.docs[doc.path] = { text, fetchedAt: Date.now() };
            done += 1;
          } catch {
            failed += 1;
          }
        })
      );
      const statusMsg = `Caching ${done} / ${total} documents...`;
      el.offlineBannerText.textContent = statusMsg;
      el.cacheStats.textContent = statusMsg;
    }

    await persistCache();
    if (failed === 0) {
      showToast(`All ${total} documents cached offline!`);
    } else {
      showToast(`Cached ${done}/${total} documents (${failed} failed)`);
    }
  } finally {
    state.offlineDownloading = false;
    updateCacheUiIndicators();
    if (!state.currentDoc && !state.searchQuery) {
      renderBrowse();
    }
  }
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

  updateCacheUiIndicators();

  const cats = state.index.categories || [];
  const totalDocs = state.index.documentCount || 0;
  const bookmarkCount = state.settings.bookmarks.length;

  const tabs = [
    { id: "all", label: `All (${totalDocs})` },
    ...cats.map((c) => {
      const count = (c.groups || []).reduce((n, g) => n + (g.items || []).length, 0);
      return { id: c.id, label: `${c.title} (${count})` };
    }),
    { id: "bookmarks", label: `Bookmarks (${bookmarkCount})` },
  ];

  if (!tabs.some((t) => t.id === state.activeCategory)) {
    state.activeCategory = "all";
  }

  el.categoryTabs.innerHTML = "";
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab-pill${state.activeCategory === t.id ? " active" : ""}`;
    btn.textContent = t.label;
    btn.addEventListener("click", () => {
      state.activeCategory = t.id;
      saveLastState();
      renderBrowse();
    });
    el.categoryTabs.appendChild(btn);
  }

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
// Smart Search (Shorthand + Headings + Multi-word Full Text)
// ---------------------------------------------------------------------------

function buildHighlightedSnippet(text, queryOrTokens) {
  const lower = text.toLowerCase();
  const terms = Array.isArray(queryOrTokens) ? queryOrTokens : [queryOrTokens];
  let firstIdx = -1;
  let firstLen = 0;

  for (const term of terms) {
    const pos = lower.indexOf(term.toLowerCase());
    if (pos >= 0 && (firstIdx < 0 || pos < firstIdx)) {
      firstIdx = pos;
      firstLen = term.length;
    }
  }
  if (firstIdx < 0) return "";

  const start = Math.max(0, firstIdx - 55);
  const end = Math.min(text.length, firstIdx + firstLen + 120);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const windowStr = text.slice(start, end);

  const escapedTerms = terms
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  const highlighted = windowStr
    .split(re)
    .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join("");

  return `${prefix}${highlighted}${suffix}`;
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

  // 0. Confessional & liturgical shorthand shortcuts (LD 1, Q 1, BC 14, CD 1:7, CO 71...)
  const shortcuts = parseSearchShortcut(q, docs);
  const quickDocAnchors = new Set();
  shortcuts.forEach((entry, idx) => {
    const key = `quick:${entry.doc.id}:${entry.headingSlug || entry.qaAnchor || idx}`;
    matched.set(key, entry);
    quickDocAnchors.add(`${entry.doc.id}::${entry.headingSlug || ""}`);
  });

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
      const dupCheck = `${d.id}::${matchedHeading ? matchedHeading.slug : ""}`;
      if (quickDocAnchors.has(dupCheck)) continue;
      matched.set(`doc:${d.id}`, {
        doc: d,
        score,
        headingSlug: matchedHeading ? matchedHeading.slug : null,
        headingText: matchedHeading ? matchedHeading.text : null,
        qaAnchor: null,
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
      const tokens = qLower.split(/\s+/).filter((t) => t.length >= 2);
      for (const sDoc of sIdx.documents) {
        const text = sDoc.text || "";
        const textLower = text.toLowerCase();
        const exactPos = textLower.indexOf(qLower);
        let snippetHtml = "";
        let bonus = 0;

        if (exactPos >= 0) {
          snippetHtml = buildHighlightedSnippet(text, q);
          bonus = 20;
        } else if (tokens.length >= 2 && tokens.every((t) => textLower.includes(t))) {
          snippetHtml = buildHighlightedSnippet(text, tokens);
          bonus = 10;
        }

        if (bonus > 0) {
          const baseDoc = findDocById(sDoc.id);
          if (!baseDoc) continue;
          const existing = matched.get(`doc:${sDoc.id}`);
          if (existing) {
            existing.score += bonus;
            if (!existing.snippetHtml) existing.snippetHtml = snippetHtml;
          } else {
            matched.set(`doc:${sDoc.id}`, {
              doc: baseDoc,
              score: bonus,
              headingSlug: null,
              qaAnchor: null,
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

    const topRow = document.createElement("div");
    topRow.className = "search-card-top";

    const title = document.createElement("span");
    title.className = "search-card-title";
    title.textContent = entry.doc.title;
    topRow.appendChild(title);

    if (entry.badge) {
      const badge = document.createElement("span");
      badge.className = "badge quick-jump-badge";
      badge.textContent = entry.badge;
      topRow.appendChild(badge);
    }

    const path = document.createElement("div");
    path.className = "search-card-path";
    path.textContent = `${entry.doc.categoryTitle} › ${entry.doc.groupTitle}`;

    btn.appendChild(topRow);
    btn.appendChild(path);

    if (entry.snippetHtml) {
      const snip = document.createElement("div");
      snip.className = "search-card-snippet";
      snip.innerHTML = entry.snippetHtml;
      btn.appendChild(snip);
    }

    btn.addEventListener("click", () => {
      const needHighlight = !entry.headingSlug && !entry.qaAnchor;
      openDocument(entry.doc, {
        scrollToSlug: entry.headingSlug,
        qaAnchor: entry.qaAnchor,
        highlightQuery: needHighlight ? query : null,
      });
    });
    el.searchResults.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Service Prep Panel (Form Personalization & EITHER/OR Choice Tables)
// ---------------------------------------------------------------------------

function getDocPrep(docId) {
  if (!state.prep[docId]) {
    state.prep[docId] = { values: {}, tableChoices: {} };
  }
  return state.prep[docId];
}

function hasAnyPrepData(docId) {
  const entry = state.prep[docId];
  if (!entry) return false;
  const hasVal = Object.entries(entry.values || {}).some(([k, v]) => k !== "pronoun" ? Boolean(String(v).trim()) : Boolean(v && v !== "original"));
  const hasChoice = Object.values(entry.tableChoices || {}).some((v) => v === 0 || v === 1);
  return hasVal || hasChoice;
}

function updatePrepStatusUi(doc, parsedHtml) {
  if (!state.currentSchema) {
    el.servicePrepBar.classList.add("hidden");
    return;
  }
  el.servicePrepBar.classList.remove("hidden");
  const blankMatches = (parsedHtml.match(/class="form-blank"/g) || []).length;
  const filledMatches = (parsedHtml.match(/class="form-filled"/g) || []).length;
  const chosenCount = Object.values(getDocPrep(doc.id).tableChoices || {}).filter((v) => v === 0 || v === 1).length;

  const parts = [];
  if (filledMatches > 0) parts.push(`${filledMatches} filled`);
  if (blankMatches > 0) parts.push(`${blankMatches} blank${blankMatches === 1 ? "" : "s"}`);
  if (chosenCount > 0) parts.push(`${chosenCount} option${chosenCount === 1 ? "" : "s"} chosen`);
  if (parts.length === 0 && state.currentSchema.hasChoiceTables) parts.push("Options available");

  el.prepStatusBadge.textContent = parts.join(" · ") || "Ready";
  el.prepResetBtn.classList.toggle("hidden", !hasAnyPrepData(doc.id));
  el.prepToggleBtn.textContent = state.prepExpanded ? "Hide" : "Customize";
  el.prepBody.classList.toggle("hidden", !state.prepExpanded);
}

function renderServicePrepPanel(doc, schema) {
  state.currentSchema = schema;
  if (!schema) {
    el.servicePrepBar.classList.add("hidden");
    el.prepFieldsGrid.innerHTML = "";
    return;
  }

  const prep = getDocPrep(doc.id);
  el.prepFieldsGrid.innerHTML = "";

  for (const field of schema.fields) {
    const wrap = document.createElement("div");
    wrap.className = field.type === "pronoun" ? "prep-field prep-field-wide" : "prep-field";

    const lbl = document.createElement("label");
    lbl.className = "prep-label";
    lbl.textContent = field.label;
    wrap.appendChild(lbl);

    if (field.type === "pronoun") {
      const pills = document.createElement("div");
      pills.className = "pronoun-pills";
      const curVal = prep.values[field.key] || "original";
      for (const opt of field.options) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `pronoun-pill${curVal === opt.value ? " active" : ""}`;
        btn.textContent = opt.label;
        btn.dataset.pronounValue = opt.value;
        btn.addEventListener("click", () => {
          prep.values[field.key] = opt.value;
          for (const sib of pills.querySelectorAll(".pronoun-pill")) {
            sib.classList.toggle("active", sib.dataset.pronounValue === opt.value);
          }
          persistPrep().catch(() => {});
          renderCurrentDocument({ preserveScroll: true });
        });
        pills.appendChild(btn);
      }
      wrap.appendChild(pills);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "prep-input";
      input.placeholder = field.placeholder || "";
      input.value = prep.values[field.key] || "";
      input.dataset.prepField = field.key;
      input.addEventListener("input", () => {
        prep.values[field.key] = input.value;
        persistPrep().catch(() => {});
        renderCurrentDocument({ preserveScroll: true });
      });
      wrap.appendChild(input);
    }

    el.prepFieldsGrid.appendChild(wrap);
  }

  el.prepChoiceHint.classList.toggle("hidden", !schema.hasChoiceTables);
}

// ---------------------------------------------------------------------------
// In-Document Find & Match Highlighting
// ---------------------------------------------------------------------------

function clearHighlights() {
  for (const root of [el.readerArticle, el.footnotesList]) {
    const marks = root.querySelectorAll("mark.find-hit");
    if (marks.length === 0) continue;
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
      }
    }
  }
  state.findHits = [];
  state.findIndex = -1;
}

function applyHighlights(query, { includeFootnotes = false, scrollToFirst = true } = {}) {
  clearHighlights();
  const q = String(query || "").trim();
  if (!q) {
    el.findCount.textContent = "";
    return 0;
  }

  const lowerFull = q.toLowerCase();
  const roots = includeFootnotes ? [el.readerArticle, el.footnotesList] : [el.readerArticle];

  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !/\S/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest(".no-print, script, style, .fn-ref")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    let cur;
    while ((cur = walker.nextNode())) {
      textNodes.push(cur);
    }

    // Build single regex using full query or multi-word tokens if full query isn't found anywhere
    let useTokens = [q];
    if (!root.textContent.toLowerCase().includes(lowerFull)) {
      const parts = lowerFull.split(/\s+/).filter((t) => t.length >= 2);
      if (parts.length >= 2) useTokens = parts;
    }
    const escaped = useTokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${escaped.join("|")})`, "gi");

    for (const node of textNodes) {
      const val = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(val)) continue;
      re.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let m;
      while ((m = re.exec(val)) !== null) {
        if (m.index > lastIdx) {
          frag.appendChild(document.createTextNode(val.slice(lastIdx, m.index)));
        }
        const mark = document.createElement("mark");
        mark.className = "find-hit";
        mark.textContent = m[0];
        frag.appendChild(mark);
        state.findHits.push(mark);
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < val.length) {
        frag.appendChild(document.createTextNode(val.slice(lastIdx)));
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  if (state.findHits.length > 0) {
    state.findIndex = 0;
    activateFindHit(0, { scroll: scrollToFirst });
  } else {
    el.findCount.textContent = "0 matches";
  }
  return state.findHits.length;
}

function activateFindHit(index, { scroll = true } = {}) {
  if (state.findHits.length === 0) return;
  const len = state.findHits.length;
  const wrapped = ((index % len) + len) % len;
  for (const old of state.findHits) {
    old.classList.remove("find-hit-active");
  }
  state.findIndex = wrapped;
  const target = state.findHits[wrapped];
  target.classList.add("find-hit-active");
  el.findCount.textContent = `${wrapped + 1} of ${len}`;
  if (scroll) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function openFindBar(prefill = "") {
  state.findOpen = true;
  el.findBar.classList.remove("hidden");
  if (prefill) el.findInput.value = prefill;
  el.findInput.focus();
  el.findInput.select();
  if (el.findInput.value.trim()) {
    applyHighlights(el.findInput.value, { includeFootnotes: state.settings.showFootnotes });
  }
}

function closeFindBar() {
  state.findOpen = false;
  el.findBar.classList.add("hidden");
  clearHighlights();
  el.findCount.textContent = "";
}

// ---------------------------------------------------------------------------
// Reader View & Rendering Pipeline
// ---------------------------------------------------------------------------

function updateBookmarkButton() {
  if (!state.currentDoc) return;
  const starred = isBookmarked(state.currentDoc.id);
  el.bookmarkStar.textContent = starred ? "★" : "☆";
  el.bookmarkDocBtn.classList.toggle("starred", starred);
}

function renderDocumentFooterNav(doc) {
  const docs = allDocumentsFlat();
  const idx = docs.findIndex((d) => d.id === doc.id);
  if (idx < 0 || docs.length <= 1) {
    el.readerFooterNav.classList.add("hidden");
    return;
  }
  const prevDoc = idx > 0 ? docs[idx - 1] : null;
  const nextDoc = idx < docs.length - 1 ? docs[idx + 1] : null;

  el.prevDocBtn.classList.toggle("hidden", !prevDoc);
  el.nextDocBtn.classList.toggle("hidden", !nextDoc);

  if (prevDoc) {
    el.prevDocBtn.textContent = `← ${prevDoc.title}`;
    el.prevDocBtn.onclick = () => openDocument(prevDoc);
  }
  if (nextDoc) {
    el.nextDocBtn.textContent = `${nextDoc.title} →`;
    el.nextDocBtn.onclick = () => openDocument(nextDoc);
  }
  el.readerFooterNav.classList.remove("hidden");
}

function buildHarmonyChipsHtml(items, kicker = "Related:") {
  if (!items || items.length === 0) return "";
  const chips = items
    .map((item) => {
      const slugAttr = item.slug ? ` data-doc-slug="${escapeHtml(item.slug)}"` : "";
      const titleAttr = escapeHtml(item.title || item.label);
      return `<span class="harmony-chip"><button type="button" class="harmony-open-btn" data-doc-id="${escapeHtml(item.docId)}"${slugAttr} title="Open ${titleAttr}">${escapeHtml(item.label)}</button><button type="button" class="harmony-compare-btn" data-doc-id="${escapeHtml(item.docId)}"${slugAttr} title="Compare ${titleAttr} side by side">&#8644;</button></span>`;
    })
    .join("");
  return `<span class="harmony-kicker">${escapeHtml(kicker)}</span>${chips}`;
}

function injectSectionHarmonyStrips(articleEl, doc, headings, allDocs) {
  if (!headings || headings.length === 0) return;
  const headingBySlug = new Map(headings.map((h) => [h.slug, h]));

  for (const hEl of articleEl.querySelectorAll("h2[id], h3[id]")) {
    const hMeta = headingBySlug.get(hEl.id);
    if (!hMeta) continue;
    const links = getSectionRelatedLinks(doc, hMeta.text, allDocs);
    if (links.length === 0) continue;

    const strip = document.createElement("div");
    strip.className = "harmony-strip no-print";
    strip.innerHTML = buildHarmonyChipsHtml(links, "Related:");
    hEl.insertAdjacentElement("afterend", strip);
  }
}

function renderDocumentContentInto(
  doc,
  rawMarkdown,
  articleEl,
  footnotesListEl,
  footnotesSectionEl,
  allDocs,
  { markPrep = true } = {}
) {
  const prep = markPrep ? getDocPrep(doc.id) : { values: {}, tableChoices: {} };
  const personalizable = markPrep && isPersonalizableDoc(doc);

  const { text: mdForRender, prepTokens } = personalizable
    ? applyFormPersonalization(rawMarkdown, doc, prep.values, { markTokens: true })
    : { text: rawMarkdown, prepTokens: [] };

  const parsed = parseMarkdown(mdForRender, {
    prepTokens,
    tableChoices: prep.tableChoices,
    isLiturgicalForm: doc.categoryId === "liturgical-forms",
    isReadingsDoc: doc.categoryId === "other-resources",
    isWestminster: doc.id.includes("westminster-confession"),
  });

  let renderedHtml = linkifyDocRefsHtml(parsed.html, allDocs, doc.id);
  if (doc.id.includes("crca-church-order")) {
    renderedHtml = linkifyChurchOrderRefsHtml(renderedHtml, doc);
  }
  renderedHtml = linkifyScriptureHtml(renderedHtml, state.settings.bibleVersion, { skipHeadings: true });

  articleEl.innerHTML = renderedHtml;

  if (parsed.footnotes.length > 0) {
    footnotesListEl.innerHTML = "";
    for (const fn of parsed.footnotes) {
      const li = document.createElement("li");
      li.id = `${articleEl === el.compareArticle ? "cmp-" : ""}fn-${fn.id}`;

      const badge = document.createElement("span");
      badge.className = "fn-list-badge";
      badge.textContent = fn.listLabel;

      const body = document.createElement("span");
      body.innerHTML = linkifyScriptureHtml(
        linkifyDocRefsHtml(escapeHtml(fn.text), allDocs, doc.id),
        state.settings.bibleVersion
      );

      li.appendChild(badge);
      li.appendChild(body);
      footnotesListEl.appendChild(li);
    }
    footnotesSectionEl.classList.remove("hidden");
  } else {
    footnotesSectionEl.classList.add("hidden");
  }

  return { parsed, renderedHtml };
}

function renderCurrentDocument({ preserveScroll = false, fromCache = false } = {}) {
  const doc = state.currentDoc;
  if (!doc || !state.currentMarkdown) return;

  const savedScroll = preserveScroll ? getScrollTop() : 0;
  const allDocs = allDocumentsFlat();

  const { parsed, renderedHtml } = renderDocumentContentInto(
    doc,
    state.currentMarkdown,
    el.readerArticle,
    el.footnotesList,
    el.footnotesSection,
    allDocs,
    { markPrep: true }
  );
  state.currentParsed = parsed;

  injectSectionHarmonyStrips(el.readerArticle, doc, parsed.headings, allDocs);

  // Document-level Harmony chips (Forms, Subscription, Creeds, Readings)
  const docLinks = getDocumentRelatedLinks(doc, allDocs);
  if (docLinks.length > 0) {
    el.docHarmonyBar.innerHTML = buildHarmonyChipsHtml(docLinks, "Related Standards & Order:");
    el.docHarmonyBar.classList.remove("hidden");
  } else {
    el.docHarmonyBar.innerHTML = "";
    el.docHarmonyBar.classList.add("hidden");
  }

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
  } else {
    el.tocSelect.classList.add("hidden");
    el.readerSidebarToc.classList.add("hidden");
  }

  updatePrepStatusUi(doc, renderedHtml);

  if (state.findOpen && el.findInput.value.trim()) {
    applyHighlights(el.findInput.value, {
      includeFootnotes: state.settings.showFootnotes,
      scrollToFirst: false,
    });
  }

  if (state.pulpitActive) {
    updatePulpitSectionLabel();
  }

  if (preserveScroll) {
    setScrollTop(savedScroll);
  }
}

async function openDocument(
  doc,
  { scrollToSlug = null, qaAnchor = null, highlightQuery = null, restoreScrollTop = null, autoPrint = false } = {}
) {
  state.currentDoc = doc;
  state.prepExpanded = false;
  closeFindBar();
  setActiveView("reader");
  el.readerArticle.innerHTML = "";
  el.footnotesSection.classList.add("hidden");
  el.footnotesList.innerHTML = "";
  el.readerLoading.classList.remove("hidden");
  el.tocSelect.classList.add("hidden");
  el.readerSidebarToc.classList.add("hidden");
  el.officialPdfLink.classList.add("hidden");
  el.docHarmonyBar.classList.add("hidden");
  el.servicePrepBar.classList.add("hidden");
  el.readerFooterNav.classList.add("hidden");
  updateBookmarkButton();

  state.settings.recentDocs = [
    doc.id,
    ...(state.settings.recentDocs || []).filter((id) => id !== doc.id),
  ].slice(0, 8);
  saveSettings().catch(() => {});

  try {
    const { text, fromCache } = await fetchDocumentMarkdown(doc.path);
    if (state.currentDoc?.id !== doc.id) return;

    state.currentMarkdown = text;
    el.readerLoading.classList.add("hidden");

    const schema = analyzeFormSchema(text, doc);
    renderServicePrepPanel(doc, schema);
    renderCurrentDocument({ preserveScroll: false, fromCache });
    renderDocumentFooterNav(doc);

    if (qaAnchor) {
      setTimeout(() => {
        const qaEl = el.readerArticle.querySelector(`[id="${CSS.escape(qaAnchor)}"]`);
        if (qaEl) {
          qaEl.classList.add("qa-highlight");
          qaEl.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => qaEl.classList.remove("qa-highlight"), 2500);
        }
      }, 45);
    } else if (scrollToSlug) {
      setTimeout(() => scrollToHeading(scrollToSlug), 45);
    } else if (highlightQuery) {
      setTimeout(() => {
        applyHighlights(highlightQuery, { includeFootnotes: true, scrollToFirst: true });
      }, 45);
    } else if (typeof restoreScrollTop === "number" && restoreScrollTop > 0) {
      setTimeout(() => setScrollTop(restoreScrollTop), 20);
    } else {
      setScrollTop(0);
    }

    saveLastState();

    if (autoPrint) {
      setTimeout(() => window.print(), 250);
    }
  } catch (err) {
    el.readerLoading.classList.add("hidden");
    el.readerArticle.innerHTML = `<div class="setup-card"><h2>Failed to load document</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function scrollToHeading(slug, container = el.readerArticle) {
  if (!slug || !container) return;
  const target = container.querySelector(`[id="${CSS.escape(slug)}"]`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function getCurrentHeadingIndex() {
  const headings = state.currentParsed?.headings || [];
  if (headings.length === 0) return -1;
  const containerTop = (state.mode === "tab" ? 0 : el.mainContent.getBoundingClientRect().top) + 72;
  let activeIdx = 0;
  for (let i = 0; i < headings.length; i += 1) {
    const node = el.readerArticle.querySelector(`[id="${CSS.escape(headings[i].slug)}"]`);
    if (node && node.getBoundingClientRect().top <= containerTop) {
      activeIdx = i;
    }
  }
  return activeIdx;
}

// ---------------------------------------------------------------------------
// Side-by-Side Compare View
// ---------------------------------------------------------------------------

function pickDefaultCompareDoc(primaryDoc, allDocs) {
  if (!allDocs || allDocs.length === 0) return null;
  const id = primaryDoc?.id || "";
  if (id.includes("belgic-confession")) {
    return allDocs.find((d) => d.id.includes("westminster-confession")) || allDocs[0];
  }
  if (id.includes("westminster-confession")) {
    return allDocs.find((d) => d.id.includes("belgic-confession")) || allDocs[0];
  }
  if (id.includes("heidelberg-catechism")) {
    return allDocs.find((d) => d.id.includes("belgic-confession")) || allDocs[0];
  }
  if (id.includes("celebration-of-the-lords-supper-i")) {
    return allDocs.find((d) => d.id.includes("celebration-of-the-lords-supper-ii")) || allDocs[0];
  }
  return allDocs.find((d) => d.id !== id) || allDocs[0];
}

function populateCompareSelect(selectedId) {
  if (!state.index) return;
  el.compareDocSelect.innerHTML = "";
  for (const cat of state.index.categories || []) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = cat.title;
    for (const grp of cat.groups || []) {
      for (const doc of grp.items || []) {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = doc.title;
        if (doc.id === selectedId) opt.selected = true;
        optgroup.appendChild(opt);
      }
    }
    el.compareDocSelect.appendChild(optgroup);
  }
}

async function openCompare(targetDoc, { scrollToSlug = null, qaAnchor = null } = {}) {
  if (!targetDoc) return;

  // Narrow popup / narrow panel opens full tab directly in compare layout
  if (state.mode === "popup" || window.innerWidth < 820) {
    const base =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("app.html")
        : "app.html";
    const curParam = state.currentDoc ? `&doc=${encodeURIComponent(state.currentDoc.id)}` : "";
    const cmpParam = `&compare=${encodeURIComponent(targetDoc.id)}`;
    const slugParam = scrollToSlug ? `&compareSlug=${encodeURIComponent(scrollToSlug)}` : "";
    const qaParam = qaAnchor ? `&compareAnchor=${encodeURIComponent(qaAnchor)}` : "";
    window.open(`${base}?mode=tab${curParam}${cmpParam}${slugParam}${qaParam}`, "_blank");
    return;
  }

  if (state.pulpitActive) setPulpitMode(false);
  state.compareDoc = targetDoc;
  const reqId = (state.compareReqId += 1);

  el.body.classList.add("compare-active");
  el.comparePane.classList.remove("hidden");
  el.compareBtn.classList.add("btn-active");
  populateCompareSelect(targetDoc.id);

  el.compareArticle.innerHTML = "";
  el.compareFootnotesSection.classList.add("hidden");
  el.compareFootnotesList.innerHTML = "";
  el.compareTocSelect.classList.add("hidden");
  el.compareLoading.classList.remove("hidden");

  try {
    const { text } = await fetchDocumentMarkdown(targetDoc.path);
    if (state.compareReqId !== reqId || !state.compareDoc) return;

    state.compareMarkdown = text;
    el.compareLoading.classList.add("hidden");

    const { parsed } = renderDocumentContentInto(
      targetDoc,
      text,
      el.compareArticle,
      el.compareFootnotesList,
      el.compareFootnotesSection,
      allDocumentsFlat(),
      { markPrep: false }
    );
    state.compareParsed = parsed;

    if (parsed.headings.length >= 2) {
      el.compareTocSelect.innerHTML = `<option value="">Jump to section...</option>`;
      for (const h of parsed.headings) {
        const opt = document.createElement("option");
        opt.value = h.slug;
        opt.textContent = h.level === 3 ? `  · ${h.text}` : h.text;
        el.compareTocSelect.appendChild(opt);
      }
      el.compareTocSelect.classList.remove("hidden");
    }

    if (qaAnchor) {
      setTimeout(() => {
        const qaEl = el.compareArticle.querySelector(`[id="${CSS.escape(qaAnchor)}"]`);
        if (qaEl) {
          qaEl.classList.add("qa-highlight");
          qaEl.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => qaEl.classList.remove("qa-highlight"), 2500);
        }
      }, 45);
    } else if (scrollToSlug) {
      setTimeout(() => scrollToHeading(scrollToSlug, el.compareArticle), 45);
    }
  } catch (err) {
    if (state.compareReqId !== reqId) return;
    el.compareLoading.classList.add("hidden");
    el.compareArticle.innerHTML = `<div class="setup-card"><h2>Failed to load comparison</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function closeCompare() {
  state.compareDoc = null;
  state.compareMarkdown = "";
  state.compareParsed = null;
  state.compareReqId += 1;
  el.body.classList.remove("compare-active");
  el.comparePane.classList.add("hidden");
  el.compareBtn.classList.remove("btn-active");
}

async function swapCompare() {
  if (!state.currentDoc || !state.compareDoc) return;
  const oldPrimary = state.currentDoc;
  const oldCompare = state.compareDoc;
  await openDocument(oldCompare);
  await openCompare(oldPrimary);
}

function updatePulpitSectionLabel() {
  const headings = state.currentParsed?.headings || [];
  if (headings.length === 0) {
    el.pulpitSecLabel.textContent = state.currentDoc?.title || "";
    el.pulpitPrevSecBtn.disabled = true;
    el.pulpitNextSecBtn.disabled = true;
    return;
  }
  const idx = getCurrentHeadingIndex();
  const h = headings[Math.max(0, idx)];
  el.pulpitSecLabel.textContent = h.text;
  el.pulpitPrevSecBtn.disabled = idx <= 0;
  el.pulpitNextSecBtn.disabled = idx >= headings.length - 1;
}

function stepPulpitSection(delta) {
  const headings = state.currentParsed?.headings || [];
  if (headings.length === 0) return;
  const cur = getCurrentHeadingIndex();
  const next = Math.max(0, Math.min(headings.length - 1, cur + delta));
  scrollToHeading(headings[next].slug);
  setTimeout(updatePulpitSectionLabel, 250);
}

// ---------------------------------------------------------------------------
// Footnote & Church Order Article Popovers
// ---------------------------------------------------------------------------

function positionPopoverNear(anchorBtn) {
  el.fnPopover.classList.remove("hidden");
  const rect = anchorBtn.getBoundingClientRect();
  const popW = Math.min(340, window.innerWidth - 24);
  let left = rect.left;
  if (left + popW > window.innerWidth - 12) {
    left = window.innerWidth - popW - 12;
  }
  if (left < 12) left = 12;

  let top = rect.bottom + 6;
  const popH = el.fnPopover.offsetHeight || 120;
  if (top + popH > window.innerHeight - 12) {
    top = Math.max(12, rect.top - popH - 6);
  }

  el.fnPopover.style.left = `${left}px`;
  el.fnPopover.style.top = `${top}px`;
}

function showFnPopover(anchorBtn, fnObj, pane = "primary") {
  state.popoverCoTarget = null;
  el.fnPopoverTitle.textContent = `Footnote ${fnObj.listLabel}`;
  const currentId = pane === "compare" ? state.compareDoc?.id : state.currentDoc?.id;
  el.fnPopoverBody.innerHTML = linkifyScriptureHtml(
    linkifyDocRefsHtml(escapeHtml(fnObj.text), allDocumentsFlat(), currentId || null),
    state.settings.bibleVersion
  );
  el.fnJumpBottomBtn.textContent = "Jump to footnotes ↓";
  el.fnJumpBottomBtn.dataset.targetId = `${pane === "compare" ? "cmp-" : ""}fn-${fnObj.id}`;
  positionPopoverNear(anchorBtn);
}

function showCoArticlePopover(anchorBtn, artNum, subClause, slug, sourceMarkdown, pane = "primary") {
  const { markdown } = extractSectionMarkdown(sourceMarkdown || "", slug);
  const clean = getCleanText(markdown, { includeFootnotes: false });
  const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const titleLine = lines[0] || `Article ${artNum}`;
  let bodyLines = lines.slice(1);

  if (subClause) {
    const subRe = new RegExp(`^${subClause}\\.\\s`, "i");
    const subIdx = bodyLines.findIndex((l) => subRe.test(l));
    if (subIdx >= 0) {
      bodyLines = bodyLines.slice(subIdx);
    }
  }

  let bodyText = bodyLines.join("\n\n") || clean;
  if (bodyText.length > 520) {
    bodyText = bodyText.slice(0, 517).trimEnd() + "…";
  }

  state.popoverCoTarget = { slug, pane };
  el.fnPopoverTitle.textContent = subClause ? `${titleLine} (${subClause})` : titleLine;
  el.fnPopoverBody.innerHTML = escapeHtml(bodyText)
    .replace(/\n\n/g, "<br><br>")
    .replace(/^([a-z]\.)\s/gm, "<strong>$1</strong> ");
  el.fnJumpBottomBtn.textContent = `Jump to Article ${artNum} →`;
  el.fnJumpBottomBtn.dataset.targetId = slug;
  positionPopoverNear(anchorBtn);
}

function hideFnPopover() {
  state.popoverCoTarget = null;
  el.fnPopover.classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Copy & Word Export Helpers
// ---------------------------------------------------------------------------

async function copySlice(mdSlice, { format = "clean", tableIndexOffset = 0, label = "Copied!" } = {}) {
  const doc = state.currentDoc;
  if (!doc || !mdSlice) return;

  const prep = getDocPrep(doc.id);
  const personalized = isPersonalizableDoc(doc)
    ? applyFormPersonalization(mdSlice, doc, prep.values, { markTokens: false }).text
    : mdSlice;
  const parseOpts = {
    tableChoices: prep.tableChoices,
    tableIndexOffset,
    isLiturgicalForm: doc.categoryId === "liturgical-forms",
    isReadingsDoc: doc.categoryId === "other-resources",
  };

  if (format === "word") {
    const cleanHtml = getCleanHtml(personalized, {
      ...parseOpts,
      includeFootnotes: state.settings.showFootnotes,
    });
    const wordDoc = buildWordDocumentHtml(doc.title, cleanHtml);
    const blob = new Blob(["\ufeff", wordDoc], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeSlug = doc.title.replace(/[^a-z0-9\- ]+/gi, "").trim().replace(/\s+/g, "-").toLowerCase();
    a.href = url;
    a.download = `${safeSlug || "crca-document"}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(label || "Exported Word / Bulletin (.doc)!");
    return;
  }

  try {
    if (format === "markdown") {
      await navigator.clipboard.writeText(mdSlice);
    } else if (format === "slides") {
      const plain = getCleanText(personalized, { ...parseOpts, includeFootnotes: false });
      await navigator.clipboard.writeText(formatForSlides(plain));
    } else {
      const includeFootnotes = format === "footnotes";
      const plain = getCleanText(personalized, { ...parseOpts, includeFootnotes });
      const html = getCleanHtml(personalized, { ...parseOpts, includeFootnotes });
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([plain], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
    }
    showToast(label);
  } catch {
    showToast("Clipboard permission denied");
  }
}

// ---------------------------------------------------------------------------
// Settings Modal
// ---------------------------------------------------------------------------

function populateBibleSelect() {
  el.bibleVersionSelect.innerHTML = "";
  for (const ver of BIBLE_VERSIONS) {
    const opt = document.createElement("option");
    opt.value = ver;
    opt.textContent = ver;
    el.bibleVersionSelect.appendChild(opt);
  }
}

function openSettingsModal() {
  const radios = document.querySelectorAll('input[name="sourceMode"]');
  for (const r of radios) {
    r.checked = r.value === state.settings.sourceMode;
  }
  el.githubOwnerInput.value = state.settings.githubOwner;
  el.githubRepoInput.value = state.settings.githubRepo;
  el.githubBranchInput.value = state.settings.githubBranch;
  el.customBaseUrlInput.value = state.settings.customBaseUrl;
  el.bibleVersionSelect.value = BIBLE_VERSIONS.includes(state.settings.bibleVersion)
    ? state.settings.bibleVersion
    : "NIV";
  syncSourceFieldsVisibility();
  updateCacheUiIndicators();
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
    saveLastState();
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

  const toggleTheme = async () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    applySettingsToDom();
    await saveSettings();
  };
  el.themeBtn.addEventListener("click", toggleTheme);
  el.pulpitThemeBtn.addEventListener("click", toggleTheme);

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
    const base =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
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
    const prevBase = getBaseUrl();
    const mode = document.querySelector('input[name="sourceMode"]:checked')?.value || "github";
    state.settings.sourceMode = mode;
    state.settings.githubOwner = el.githubOwnerInput.value.trim() || DEFAULT_SETTINGS.githubOwner;
    state.settings.githubRepo = el.githubRepoInput.value.trim() || DEFAULT_SETTINGS.githubRepo;
    state.settings.githubBranch = el.githubBranchInput.value.trim() || DEFAULT_SETTINGS.githubBranch;
    state.settings.customBaseUrl = el.customBaseUrlInput.value.trim() || DEFAULT_SETTINGS.customBaseUrl;
    state.settings.bibleVersion = el.bibleVersionSelect.value || "NIV";
    await saveSettings();
    applySettingsToDom();
    closeSettingsModal();

    if (getBaseUrl() !== prevBase || !state.currentDoc) {
      state.currentDoc = null;
      await loadLibrary({ forceRefresh: true });
    } else {
      renderCurrentDocument({ preserveScroll: true });
      if (state.compareDoc) openCompare(state.compareDoc);
      showToast("Settings saved");
    }
  });

  el.offlineBannerBtn.addEventListener("click", downloadAllOffline);
  el.cacheAllBtn.addEventListener("click", downloadAllOffline);

  el.clearCacheBtn.addEventListener("click", async () => {
    state.cache = { byBase: {} };
    state.searchIndex = null;
    await persistCache();
    updateCacheUiIndicators();
    if (!state.currentDoc && !state.searchQuery) renderBrowse();
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
    saveLastState();
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
    el.copyMenu.classList.add("hidden");

    const labelMap = {
      clean: "Copied clean text (Rich + Plain)!",
      footnotes: "Copied with footnotes (Rich + Plain)!",
      slides: "Copied formatted for slides!",
      word: "Exported Word / Bulletin (.doc)!",
      markdown: "Copied raw Markdown!",
    };
    await copySlice(state.currentMarkdown, { format: mode, label: labelMap[mode] || "Copied!" });
  });

  // Side-by-side compare controls
  el.compareBtn.addEventListener("click", () => {
    if (state.compareDoc) {
      closeCompare();
      return;
    }
    const target = pickDefaultCompareDoc(state.currentDoc, allDocumentsFlat());
    if (target) openCompare(target);
  });
  el.compareCloseBtn.addEventListener("click", closeCompare);
  el.compareSwapBtn.addEventListener("click", swapCompare);
  el.compareDocSelect.addEventListener("change", () => {
    const target = findDocById(el.compareDocSelect.value);
    if (target) openCompare(target);
  });
  el.compareTocSelect.addEventListener("change", (e) => {
    if (e.target.value) {
      scrollToHeading(e.target.value, el.compareArticle);
      e.target.value = "";
    }
  });

  el.printBtn.addEventListener("click", () => {
    if (!state.currentDoc) return;
    const base =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("app.html")
        : "app.html";
    window.open(`${base}?mode=print&doc=${encodeURIComponent(state.currentDoc.id)}`, "_blank");
  });

  el.triggerPrintNowBtn.addEventListener("click", () => window.print());
  el.closePrintTabBtn.addEventListener("click", () => window.close());

  el.bookmarkDocBtn.addEventListener("click", () => {
    if (state.currentDoc) toggleBookmark(state.currentDoc.id);
  });

  const changeFontSize = async (delta) => {
    state.settings.fontSize = Math.max(13, Math.min(24, state.settings.fontSize + delta));
    applySettingsToDom();
    await saveSettings();
  };
  el.fontDecBtn.addEventListener("click", () => changeFontSize(-1));
  el.fontIncBtn.addEventListener("click", () => changeFontSize(1));
  el.pulpitFontDecBtn.addEventListener("click", () => changeFontSize(-1));
  el.pulpitFontIncBtn.addEventListener("click", () => changeFontSize(1));

  // Pulpit mode controls
  el.pulpitBtn.addEventListener("click", () => {
    if (state.mode === "popup" && state.currentDoc) {
      const base =
        typeof chrome !== "undefined" && chrome.runtime?.getURL
          ? chrome.runtime.getURL("app.html")
          : "app.html";
      window.open(`${base}?mode=tab&doc=${encodeURIComponent(state.currentDoc.id)}&pulpit=1`, "_blank");
      return;
    }
    setPulpitMode(!state.pulpitActive);
  });
  el.pulpitExitBtn.addEventListener("click", () => setPulpitMode(false));
  el.pulpitPrevSecBtn.addEventListener("click", () => stepPulpitSection(-1));
  el.pulpitNextSecBtn.addEventListener("click", () => stepPulpitSection(1));

  // In-document Find bar
  el.findBtn.addEventListener("click", () => {
    if (state.findOpen) closeFindBar();
    else openFindBar();
  });
  el.findCloseBtn.addEventListener("click", closeFindBar);
  el.findInput.addEventListener("input", () => {
    applyHighlights(el.findInput.value, { includeFootnotes: state.settings.showFootnotes });
  });
  el.findPrevBtn.addEventListener("click", () => activateFindHit(state.findIndex - 1));
  el.findNextBtn.addEventListener("click", () => activateFindHit(state.findIndex + 1));
  el.findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      activateFindHit(state.findIndex + (e.shiftKey ? -1 : 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFindBar();
    }
  });

  // Service Prep bar controls
  el.prepToggleBtn.addEventListener("click", () => {
    if (!state.currentDoc) return;
    state.prepExpanded = !state.prepExpanded;
    el.prepToggleBtn.textContent = state.prepExpanded ? "Hide" : "Customize";
    el.prepBody.classList.toggle("hidden", !state.prepExpanded);
  });

  el.prepResetBtn.addEventListener("click", () => {
    if (!state.currentDoc || !state.currentSchema) return;
    state.prep[state.currentDoc.id] = { values: {}, tableChoices: {} };
    persistPrep().catch(() => {});
    renderServicePrepPanel(state.currentDoc, state.currentSchema);
    renderCurrentDocument({ preserveScroll: true });
    showToast("Form reset to defaults");
  });

  const handleHarmonyClick = (e) => {
    const openBtn = e.target.closest(".harmony-open-btn");
    if (openBtn) {
      const targetDoc = findDocById(openBtn.dataset.docId);
      if (targetDoc) {
        openDocument(targetDoc, { scrollToSlug: openBtn.dataset.docSlug || null });
      }
      return true;
    }
    const cmpBtn = e.target.closest(".harmony-compare-btn");
    if (cmpBtn) {
      const targetDoc = findDocById(cmpBtn.dataset.docId);
      if (targetDoc) {
        openCompare(targetDoc, { scrollToSlug: cmpBtn.dataset.docSlug || null });
      }
      return true;
    }
    return false;
  };
  el.docHarmonyBar.addEventListener("click", handleHarmonyClick);

  // Reader article delegation (footnotes, Church Order previews, xrefs, harmony, blanks, choice tables, section/Q&A/WCF copy)
  el.readerArticle.addEventListener("click", async (e) => {
    if (handleHarmonyClick(e)) return;

    const fnBtn = e.target.closest(".fn-ref");
    if (fnBtn && state.currentParsed) {
      e.stopPropagation();
      const found = state.currentParsed.footnotes.find((f) => f.id === fnBtn.dataset.fnId);
      if (found) showFnPopover(fnBtn, found, "primary");
      return;
    }

    const coBtn = e.target.closest(".co-art-ref");
    if (coBtn && state.currentMarkdown) {
      e.stopPropagation();
      showCoArticlePopover(
        coBtn,
        coBtn.dataset.coArt,
        coBtn.dataset.coSub || "",
        coBtn.dataset.coSlug,
        state.currentMarkdown,
        "primary"
      );
      return;
    }

    const xrefBtn = e.target.closest(".doc-xref-link");
    if (xrefBtn) {
      const targetDoc = findDocById(xrefBtn.dataset.docId);
      if (targetDoc) {
        openDocument(targetDoc, { scrollToSlug: xrefBtn.dataset.docSlug || null });
      }
      return;
    }

    const blankEl = e.target.closest(".form-blank, .form-filled");
    if (blankEl && state.currentSchema) {
      const field = blankEl.dataset.field;
      state.prepExpanded = true;
      el.prepBody.classList.remove("hidden");
      el.prepToggleBtn.textContent = "Hide";
      const input = el.prepFieldsGrid.querySelector(`[data-prep-field="${field}"]`);
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "nearest" });
        input.focus();
        input.select();
      }
      return;
    }

    const choiceBtn = e.target.closest(".choice-col-btn");
    if (choiceBtn && state.currentDoc) {
      const tableIdx = Number(choiceBtn.dataset.choiceTable);
      const colIdx = Number(choiceBtn.dataset.choiceCol);
      const prep = getDocPrep(state.currentDoc.id);
      if (prep.tableChoices[tableIdx] === colIdx) {
        delete prep.tableChoices[tableIdx];
        showToast("Showing both options");
      } else {
        prep.tableChoices[tableIdx] = colIdx;
        showToast(colIdx === 0 ? "Selected EITHER option" : "Selected OR option");
      }
      persistPrep().catch(() => {});
      renderCurrentDocument({ preserveScroll: true });
      return;
    }

    const miniCopy = e.target.closest(".mini-copy-btn");
    if (miniCopy && state.currentDoc && state.currentMarkdown) {
      const format = miniCopy.dataset.copyFormat || "clean";
      if (miniCopy.dataset.copyQa) {
        const qaNum = miniCopy.dataset.copyQa;
        const slice = extractQaMarkdown(state.currentMarkdown, qaNum);
        await copySlice(slice, {
          format,
          label: format === "slides" ? `Copied Q&A ${qaNum} for slides!` : `Copied Q&A ${qaNum}!`,
        });
      } else if (miniCopy.dataset.copyWcf) {
        const [ch, sec] = miniCopy.dataset.copyWcf.split("-");
        const slice = extractWcfSectionMarkdown(state.currentMarkdown, ch, sec);
        await copySlice(slice, {
          format,
          label: format === "slides" ? `Copied WCF ${ch}:${sec} for slides!` : `Copied WCF ${ch}:${sec}!`,
        });
      } else if (miniCopy.dataset.copySection) {
        const slug = miniCopy.dataset.copySection;
        const { markdown, tableIndexOffset } = extractSectionMarkdown(state.currentMarkdown, slug, {
          isLiturgicalForm: state.currentDoc.categoryId === "liturgical-forms",
          isReadingsDoc: state.currentDoc.categoryId === "other-resources",
        });
        await copySlice(markdown, {
          format,
          tableIndexOffset,
          label: format === "slides" ? "Copied section for slides!" : "Copied section!",
        });
      }
    }
  });

  // Compare pane interactions (footnotes, Church Order previews, cross-links)
  el.compareArticle.addEventListener("click", (e) => {
    const fnBtn = e.target.closest(".fn-ref");
    if (fnBtn && state.compareParsed) {
      e.stopPropagation();
      const found = state.compareParsed.footnotes.find((f) => f.id === fnBtn.dataset.fnId);
      if (found) showFnPopover(fnBtn, found, "compare");
      return;
    }
    const coBtn = e.target.closest(".co-art-ref");
    if (coBtn && state.compareMarkdown) {
      e.stopPropagation();
      showCoArticlePopover(
        coBtn,
        coBtn.dataset.coArt,
        coBtn.dataset.coSub || "",
        coBtn.dataset.coSlug,
        state.compareMarkdown,
        "compare"
      );
      return;
    }
    const xrefBtn = e.target.closest(".doc-xref-link");
    if (xrefBtn) {
      const targetDoc = findDocById(xrefBtn.dataset.docId);
      if (targetDoc) {
        openCompare(targetDoc, { scrollToSlug: xrefBtn.dataset.docSlug || null });
      }
    }
  });

  const handleFootnoteXrefClick = (pane) => (e) => {
    const xrefBtn = e.target.closest(".doc-xref-link");
    if (!xrefBtn) return;
    const targetDoc = findDocById(xrefBtn.dataset.docId);
    if (!targetDoc) return;
    hideFnPopover();
    if (pane === "compare") {
      openCompare(targetDoc, { scrollToSlug: xrefBtn.dataset.docSlug || null });
    } else {
      openDocument(targetDoc, { scrollToSlug: xrefBtn.dataset.docSlug || null });
    }
  };
  el.footnotesList.addEventListener("click", handleFootnoteXrefClick("primary"));
  el.compareFootnotesList.addEventListener("click", handleFootnoteXrefClick("compare"));
  el.fnPopoverBody.addEventListener("click", handleFootnoteXrefClick("primary"));

  el.fnPopoverClose.addEventListener("click", hideFnPopover);
  el.fnJumpBottomBtn.addEventListener("click", () => {
    if (state.popoverCoTarget) {
      const { slug, pane } = state.popoverCoTarget;
      hideFnPopover();
      const container = pane === "compare" ? el.compareArticle : el.readerArticle;
      scrollToHeading(slug, container);
      return;
    }

    const targetId = el.fnJumpBottomBtn.dataset.targetId;
    hideFnPopover();
    if (!targetId) return;
    const isCmp = targetId.startsWith("cmp-");
    const listEl = isCmp ? el.compareFootnotesList : el.footnotesList;
    const li = listEl.querySelector(`[id="${CSS.escape(targetId)}"]`);
    if (li) {
      for (const old of listEl.querySelectorAll(".fn-highlight")) {
        old.classList.remove("fn-highlight");
      }
      li.classList.add("fn-highlight");
      li.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  // Scroll tracking (save scroll position + update pulpit section indicator)
  const onReaderScroll = () => {
    if (state.pulpitActive) {
      updatePulpitSectionLabel();
    }
    if (state.currentDoc) {
      if (state.scrollSaveTimer) clearTimeout(state.scrollSaveTimer);
      state.scrollSaveTimer = setTimeout(saveLastState, 350);
    }
  };
  el.mainContent.addEventListener("scroll", onReaderScroll);
  window.addEventListener("scroll", onReaderScroll, { passive: true });

  document.addEventListener("click", (e) => {
    if (!el.copyMenu.contains(e.target) && e.target !== el.copyMenuBtn) {
      el.copyMenu.classList.add("hidden");
    }
    if (!el.fnPopover.contains(e.target) && !e.target.closest(".fn-ref, .co-art-ref")) {
      hideFnPopover();
    }
  });

  document.addEventListener("keydown", (e) => {
    const inEditable = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && state.currentDoc && state.mode !== "print") {
      e.preventDefault();
      openFindBar();
      return;
    }

    if (e.key === "/" && !inEditable && el.settingsModal.classList.contains("hidden") && !state.pulpitActive) {
      if (state.mode !== "print") {
        e.preventDefault();
        el.searchInput.focus();
      }
      return;
    }

    if (state.pulpitActive && !inEditable && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      stepPulpitSection(e.key === "]" ? 1 : -1);
      return;
    }

    if (e.key === "Escape") {
      if (!el.settingsModal.classList.contains("hidden")) {
        closeSettingsModal();
      } else if (!el.fnPopover.classList.contains("hidden")) {
        hideFnPopover();
      } else if (!el.copyMenu.classList.contains("hidden")) {
        el.copyMenu.classList.add("hidden");
      } else if (state.findOpen) {
        closeFindBar();
      } else if (state.pulpitActive) {
        setPulpitMode(false);
      } else if (state.findHits.length > 0) {
        clearHighlights();
      } else if (state.compareDoc) {
        closeCompare();
      } else if (state.currentDoc) {
        state.currentDoc = null;
        saveLastState();
        if (state.searchQuery) setActiveView("search");
        else renderBrowse();
      } else if (state.searchQuery) {
        el.searchInput.value = "";
        handleSearch("");
      }
    }
  });

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.pendingSearch?.newValue) return;
      const pending = changes.pendingSearch.newValue;
      if (pending?.query && Date.now() - pending.ts < 30000) {
        storageRemove(["pendingSearch"]).catch(() => {});
        el.searchInput.value = pending.query;
        handleSearch(pending.query);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") || "popup";
  const docParam = params.get("doc");
  const qParam = params.get("q");
  const pulpitParam = params.get("pulpit");
  const compareParam = params.get("compare");
  const compareSlugParam = params.get("compareSlug");
  const compareAnchorParam = params.get("compareAnchor");
  state.mode = mode;
  el.body.dataset.mode = mode;

  populateBibleSelect();

  const stored = await storageGet([
    "settings",
    CACHE_STORAGE_KEY,
    PREP_STORAGE_KEY,
    LAST_STATE_KEY,
    "pendingSearch",
  ]);
  if (stored.settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  }
  if (stored[CACHE_STORAGE_KEY]?.byBase) {
    state.cache = stored[CACHE_STORAGE_KEY];
  }
  if (stored[PREP_STORAGE_KEY]) {
    state.prep = stored[PREP_STORAGE_KEY];
  }

  const lastState = stored[LAST_STATE_KEY] || null;
  if (lastState?.activeCategory) {
    state.activeCategory = lastState.activeCategory;
  }

  const pending = stored.pendingSearch;
  const hasPendingSearch = Boolean(pending?.query && Date.now() - pending.ts < 30000);
  const shouldResumeDoc = Boolean(!docParam && !qParam && !hasPendingSearch && (mode === "popup" || mode === "sidepanel") && lastState?.docId);

  applySettingsToDom();
  bindEvents();

  const loaded = await loadLibrary({
    deferRender: Boolean(docParam || qParam || hasPendingSearch || shouldResumeDoc),
  });
  if (!loaded) return;

  if (qParam) {
    el.searchInput.value = qParam;
    await handleSearch(qParam);
    return;
  }

  if (hasPendingSearch) {
    await storageRemove(["pendingSearch"]);
    el.searchInput.value = pending.query;
    await handleSearch(pending.query);
    return;
  }

  if (docParam) {
    const doc = findDocById(docParam);
    if (doc) {
      await openDocument(doc, { autoPrint: mode === "print" });
      if (compareParam && mode !== "print") {
        const cmpDoc = findDocById(compareParam);
        if (cmpDoc) {
          await openCompare(cmpDoc, {
            scrollToSlug: compareSlugParam || null,
            qaAnchor: compareAnchorParam || null,
          });
        }
      } else if (pulpitParam === "1" && mode !== "print") {
        setPulpitMode(true);
      }
      return;
    }
  }

  if (shouldResumeDoc) {
    const resumeDoc = findDocById(lastState.docId);
    if (resumeDoc) {
      await openDocument(resumeDoc, { restoreScrollTop: lastState.scrollTop || 0 });
      return;
    }
  }

  renderBrowse();
}

init();
