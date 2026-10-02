# TaxGuard 0.9.1

TaxGuard tracks clients, required BIR forms, filing records, and deadlines in a local SQLite database. During development, the Electron app and XAMPP localhost interface use `database/taxguard.db`. A packaged desktop installation creates its database in Electron's application-data directory. The localhost interface requires Apache and the Node gateway in `api.php`; the desktop app runs with Electron. GitHub Pages is a separate browser-storage demo and cannot access the local SQLite database.

## Run and verify

Install Node.js 22.13 or later, then run:

```powershell
npm.cmd install
npm.cmd start
```

For the localhost interface, start Apache in XAMPP and open `http://localhost/Taxguard/`. If Node is not installed at `C:\Program Files\nodejs\node.exe`, set `TAXGUARD_NODE_PATH` in Apache's environment. Refresh the page or return focus to the desktop window to load changes made in the other interface. Stale saves are rejected.

On a new database, TaxGuard displays **Set Up TaxGuard** before sign-in. Enter the company name and create the first administrator account. TaxGuard does not create or display a default password. Existing databases retain their existing accounts.

New and changed passwords are stored as salted `scrypt` hashes. When an existing account with the older SHA-256 format signs in successfully, TaxGuard upgrades that hash automatically; an unsuccessful login never changes it.

Successful sign-in creates a random backend session token scoped to either the desktop app or localhost browser. Tokens are stored only as SHA-256 hashes, expire after 30 minutes of inactivity, and are revoked on sign-out. Client, filing, report, document, import, export, and backup operations require a valid session; the workspace does not load protected data before authentication.

Administrator accounts manage users, the company profile, custom client fields, form and calendar configuration, imports, and backup restoration. Staff, Tax Associate, and Auditor accounts can work with client and filing records, documents, reports, exports, and backup creation. These permissions are enforced by the backend as well as the interface.

The SQLite schema is upgraded through numbered migrations. TaxGuard checks database integrity at startup, creates a timestamped `.pre-migration-vN-to-vN-...db` safety copy before upgrading an existing database, and applies each migration in a transaction. Databases and backups from newer unsupported schema versions or with failed integrity checks are rejected with a recovery message instead of being modified.

Successful record changes are written to an append-only application audit log with the authenticated username, role, UTC timestamp, action, and a compact change summary. Passwords, profile-image data, document contents, and full client records are not copied into the log. Administrators can search the audit viewer in Settings by user, action, and date; other roles cannot access it.

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
