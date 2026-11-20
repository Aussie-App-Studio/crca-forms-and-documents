# CRCA Forms & Documents

A structured, open-format repository of **Christian Reformed Churches of Australia (CRCA)** liturgical forms, worship resources, ecumenical creeds, and Reformed confessions—paired with a lightweight Chrome extension that fetches documents on demand from GitHub and caches them locally for offline reading.

## Repository Contents

- **`Creeds and Confessions/`**
  - **`01 - Ecumenical Creeds/`**: The Apostles' Creed, The Nicene Creed, and The Athanasian Creed (in Markdown, matching the CRCA *Book of Worship* / website wording).
  - **`02 - Reformed Confessions/`**: The Belgic Confession, The Heidelberg Catechism, The Canons of Dort (converted to Markdown with interactive `[^id]` Scripture footnotes, plus the original PDFs in the repository root: `CRCA BelgicConfession.pdf`, `CRCA HeidelbergCatechism.pdf`, `CRCA CanonsofDort.pdf`), and The Westminster Confession of Faith.
- **`01 - Form of Subscription.md`**: The CRCA Form of Subscription (including the 1957 Synod footnote regarding the Westminster Confession).
- **`The Liturgical Forms/`**: Baptism (Children I–IV & Adults), Public Profession of Faith, Lord's Supper (Preparation I–II & Celebration I–V), Church Discipline, Ordination & Installation of Office Bearers, Marriage, and Funerals.
- **`Church Order/`**: The CRCA Church Order (`01 - CRCA Church Order (2022).md`, `crca-book-of-order-2022.json`, and source `CRCA Book of Church Order 2022.docx` in root).
- **`Other Resources/`**: Alternatives & Options, Calls to Worship, Greetings & Benedictions, Readings of the Law, Assurances of Pardon, and Readings at the Offerings.
- **`index.json`** & **`search-index.json`**: Generated catalog and full-text search index used by the Chrome extension (and future mobile app).
- **`extension/`**: Zero-dependency Manifest V3 Chrome extension (Popup, Side Panel, Full Tab, Print/PDF export, Clean Copy, and Offline Cache).
- **`scripts/`**: Maintenance utilities (`convert_pdfs.py`, `convert_church_order.py`, `convert_wcf.py`, `build_index.py`, `generate_icons.py`, `serve_local.py`).

---

## Testing the Chrome Extension Locally

Before pushing to GitHub, you can test the Chrome extension immediately against your local files:

1. Start the local preview server from the repository root:
   ```powershell
   python scripts/serve_local.py
   ```
   This serves the repository at `http://127.0.0.1:8765` with CORS enabled.

2. Load the extension in Chrome / Edge:
   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the `extension/` folder

3. Click the **CRCA Forms & Documents** toolbar icon:
   - Until the GitHub repo is pushed, click **"Use Local Preview (http://127.0.0.1:8765)"** (or open Settings ⚙ and switch Content Source to **Local / Custom URL**).

---

## Publishing to GitHub

1. Initialize Git and create the GitHub repository (if using GitHub CLI):
   ```powershell
   git init -b main
   git add .
   git commit -m "Initial commit: CRCA Forms, Creeds, Confessions, and Chrome extension"
   gh repo create crca-forms-and-documents --public --source=. --remote=origin --push
   ```
2. In the extension Settings (⚙), ensure **GitHub Repository** points to your GitHub username/organization (`Aussie-App-Studio` by default), repository (`crca-forms-and-documents`), and branch (`main`), then click **Save & Reload**.

Once pushed, any time you add or update a `.md` file and rebuild `index.json` + `search-index.json`, every installed Chrome extension picks up the update automatically without needing a Chrome Web Store re-release.

---

## Updating Content & Rebuilding Indexes

Whenever you add, rename, or edit any Markdown file:

```powershell
python scripts/build_index.py
```

If you need to re-run PDF conversion and integrity checks on the three Confessions (requires `pymupdf`):

```powershell
python scripts/convert_pdfs.py --verify
```
