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
  recentDocs: []
};

const CONTEXT_MENU_ID = "search-crca-selection";

function registerContextMenu() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Search CRCA Forms & Documents for "%s"',
      contexts: ["selection"]
    }, () => {
      void chrome.runtime.lastError;
    });
  });
}

function openSidePanelOrTab(windowId, tabUrl) {
  if (typeof windowId === "number" && chrome.sidePanel?.open) {
    chrome.sidePanel.open({ windowId }).catch(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL(tabUrl) });
    });
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL(tabUrl) });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["settings"]);
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...(existing.settings || {}) }
  });
  registerContextMenu();
});

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) return;
    const q = info.selectionText.trim();
    if (!q) return;

    // Persist without awaiting so chrome.sidePanel.open() keeps the user gesture
    chrome.storage.local.set({ pendingSearch: { query: q, ts: Date.now() } });
    const tabUrl = `app.html?mode=tab&q=${encodeURIComponent(q)}`;
    openSidePanelOrTab(tab?.windowId, tabUrl);
  });
}

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "open-side-panel") {
      openSidePanelOrTab(tab?.windowId, "app.html?mode=tab");
    }
  });
}
