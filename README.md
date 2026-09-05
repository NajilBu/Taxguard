# TaxGuard desktop storage

## Run the SQLite-connected desktop app

Install Node.js 22.13 or later, then run in this folder:

```powershell
npm.cmd install
npm.cmd start
```

Electron opens the existing TaxGuard interface. The footer says **Saved to SQLite on this computer**. Clients, required forms, filing records and deadline schedules read from SQLite on launch and write transactionally when saved. Preferences such as the color theme remain browser preferences.

Both Electron and the localhost browser now use **database/taxguard.db**. Start Apache in XAMPP and open **http://localhost/Taxguard/**. Restart Electron after this update. Returning focus to a window reloads records when no modal is open; refreshing also reloads them. Stale saves are rejected to protect changes made in another window.

The browser posts JSON to `api.php`, which runs the fixed `desktop/api.cjs` gateway using Node.js and the same SQLite validation as Electron. No extra Node server is needed. The default Node executable is `C:\Program Files\nodejs\node.exe`; configure `TAXGUARD_NODE_PATH` in Apache's environment if installed elsewhere. Apache blocks direct access to the database and desktop source directories. The API accepts only local, same-origin JSON requests.

The previous Electron database in `%APPDATA%/taxguard-desktop/taxguard.db` is left intact but is no longer active. Separately added records in that file or old browser storage are not automatically migrated over the shared database. The company login table is preserved, but authentication is not yet connected.

## Migrate browser records

1. Open the updated site in the same browser/profile and URL where the records were saved.
2. Open Settings and choose **Export records**. Keep the downloaded JSON file private; it contains client records.
3. Start the desktop app, open Settings, and choose **Import browser records**.
4. Select the export. The import validates and commits the entire file or leaves the database unchanged.

Import is available only while the desktop client list is empty. The shared database is now seeded once with six sample clients and 133 sample filings for 2024–2026. Seeding matches existing TINs, allocates unused IDs and preserves existing records. Reopening does not duplicate or reset samples. Sample schedules are not verified current BIR deadlines.

GitHub Pages remains a separate browser-storage demo: it cannot run PHP or access this computer's SQLite file. Do not publish a working database containing real company records to a static website or public repository.

## Verification

```powershell
npm.cmd test
npm.cmd run test:desktop
npm.cmd run test:browser
```

Database tests and the desktop smoke test use temporary databases. The browser smoke test reads the localhost interface without adding or editing records and requires Apache running. The app uses a sandboxed renderer and exposes only specific record operations; no SQL or arbitrary filesystem API is exposed to the page.

Building a distributable Windows installer and the company login screen are separate steps. Before packaging, choose a writable installed database location; set `TAXGUARD_DB_PATH` consistently for Electron and Apache if relocating it.
