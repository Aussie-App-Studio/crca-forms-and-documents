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
  recentDocs: []
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["settings"]);
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});
