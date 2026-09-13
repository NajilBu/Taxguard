# TaxGuard 0.8.0

TaxGuard tracks clients, required BIR forms, filing records, and deadlines in a local SQLite database. The Electron desktop app and the XAMPP localhost interface use `database/taxguard.db`. The localhost interface requires Apache and the Node gateway in `api.php`; the desktop app runs with Electron. GitHub Pages is a separate browser-storage demo and cannot access the local SQLite database.

## Run and verify

Install Node.js 22.13 or later, then run:

```powershell
npm.cmd install
npm.cmd start
```

For the localhost interface, start Apache in XAMPP and open `http://localhost/Taxguard/`. If Node is not installed at `C:\Program Files\nodejs\node.exe`, set `TAXGUARD_NODE_PATH` in Apache's environment. Refresh the page or return focus to the desktop window to load changes made in the other interface. Stale saves are rejected.

Run the automated checks:

```powershell
npm.cmd test
npm.cmd run test:desktop -- --allocation-test
npm.cmd run test:browser
```

The browser smoke test requires Apache. The tests use temporary databases; they should not be used as a substitute for checking the interface with a small test client.

## Check the main workflows

1. **Client profile:** Add a client, confirm registration details, review suggested forms, and save the approved form selection. Suggestions add forms only; review existing assignments and special cases manually.
2. **Filing and status:** Record a filing and confirm the client progress, tracker, and dashboard update. Status is calculated from applicable filing periods and recorded submissions.
3. **Years:** Switch tax years and confirm recurring forms roll forward while prior filings remain in their original years. A client's year history starts with their first filing year.
4. **PULLOUT:** Pull a test client out, check that historical filings remain accessible, then pull them in again. Unfiled service-gap periods stay excluded.
5. **Excel transfer:** In Settings, export selected clients and filing years. Import the workbook, select clients and years in the preview, and confirm that only that scope is imported. Existing clients with the same TIN and filings with the same key are retained.
6. **Reports and documents:** Open each report's setup dialog to select clients and years. Check preview, PDF and Excel output, and attach a test document to a client or filing.
7. **Backup:** Save a full SQLite backup from Settings and verify the chosen file location. Restore only from a trusted TaxGuard backup.

## Deadline rules and limits

Weekend due dates move to the next working day. Holidays and BIR extensions can be entered manually in the deadline directory; official changes are not fetched automatically. Manual form deadline overrides remain exact. Confirm filing schedules against current BIR sources before relying on them.

Selective Excel export and import cover client profiles and their filing records. Full SQLite backup and restore cover the complete workspace, including accounts, documents, company profile, and calendar adjustments. Do not commit `database/taxguard.db` if it contains real company records.
