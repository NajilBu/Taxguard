# TaxGuard 0.9.2

TaxGuard 0.9.2 prepares the local compliance workspace for release with stronger authentication, safer data handling, complete client lifecycle tools, and cleaner packaging.

## Highlights

- First-run administrator setup replaces bundled default credentials.
- Salted scrypt password hashes, backend sessions, inactivity expiry, sign-out revocation, and role-based permissions protect workspace access.
- Client profiles support yearly form assignments, automatic recurring-year inheritance, pullout and pull-in service history, custom fields, and profile photos.
- Compliance tracking includes weekend-adjusted deadlines, holiday and extension rules, deadline risk groups, five-year history, filing documents, and scoped report previews.
- Excel import and export select clients and filing-year ranges; full SQLite backup and restore preserve the complete workspace.
- Database migrations create safety copies, verify integrity, and reject unsupported or damaged databases.
- Successful changes are recorded in an administrator audit log without copying passwords or uploaded file contents.

## Release hardening

- Uploaded PDF and image files are checked against their declared file type.
- Internal SQLite and filesystem details are removed from user-facing errors.
- The release package excludes development databases, sample records, tests, logs, migration backups, and build utilities.
- A packaged installation creates its database in the operating system's application-data directory.
- Hardware acceleration is disabled because TaxGuard does not depend on GPU rendering and must start reliably on office workstations.

## Operational notes

- TaxGuard records filing activity but does not prepare or transmit returns to BIR.
- Weekend deadlines move to the next working day. Holidays and official BIR extensions must be entered and sourced by an administrator.
- Confirm statutory schedules against current official BIR guidance before operational use.
- Keep exported workbooks, SQLite backups, and attached filing documents private because they can contain taxpayer information.

## Verification

- Automated unit and integration suite: 51 tests.
- Production dependency audit: no known vulnerabilities in the locally available audit data.
- Release package regression checks prevent live databases and development artifacts from being included.
