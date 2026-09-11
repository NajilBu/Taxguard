# Form allocation in 0.6.0

In the client editor, confirm registration for the selected filing year, review suggested additions, apply them to the draft, and save. Applying suggestions does not save or remove existing forms. Filed forms and periods cannot be removed. The name, TIN, start date, status and remarks remain master-record fields.

SQLite stores explicit yearly profiles separately from legacy client assignments. When a signed-in user opens an unconfigured future year, requirements are inherited from the latest earlier profile and saved as a separate yearly snapshot. Existing target-year profiles are never overwritten. Legacy clients without an earlier yearly profile continue to use their default assignments.

No rollover button is required. Recurring forms carry forward without copying filings or duplicating clients. Recorded 8% and OSD elections reset to unconfirmed: annual individual returns and percentage-tax forms are withheld pending review in Edit client. Inactive clients and fiscal-year profiles require review before requirements are carried. Existing filed forms and periods remain visible. Review notices persist with the yearly snapshot until the client profile is reviewed and saved.

Year history in client details lists configured years and years containing filings, plus the selected year. Opening a year shows that year's saved requirements and filings. Automatic creation happens on opening an unconfigured later year, including the current year after signing in; it does not require a background process or running the app at midnight.

Suggestions support calendar-year individual business and ordinary regular-rate corporate profiles. Unconfirmed, special and fiscal-year income treatments require manual selection. VAT/NVAT alone does not establish all tax obligations. The engine does not assess eligibility for an 8% election; the operator confirms it. Annual-return alternatives, including 1701-MS, require review rather than duplicate assignment. Historical VAT years before 2023 need a monthly-declaration review.

Expanded withholding suggestions restrict 0619-E to the first two months of each quarter, retaining any already-filed periods. Existing unreviewed assignments and custom deadline schedules are preserved. Holiday, extension and filing-channel deadline adjustments are outside this stage.

## Rule references

- [BIR RMO 20-2019](https://bir-cdn.bir.gov.ph/BIR/pdf/RMO_NO.20-2019_digest.pdf): individual annual-return distinctions.
- [BIR RMO 23-2018](https://bir-cdn.bir.gov.ph/local/pdf/RMO%20NO.23-2018.pdf): confirmed annual 8% election and percentage-tax treatment.
- [BIR 1702-RT help](https://efps.bir.gov.ph/EFPSWeb_war/forms2013Version/1702RT/1702RT_help.html): regular-rate annual corporate return.
- [BIR RMC 50-2018](https://bir-cdn.bir.gov.ph/local/pdf/RMC%20No%2050-2018.pdf): expanded withholding remittances and information returns.
- [BIR RMC 20-2026](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%2020-2026.pdf): annual-return alternatives for micro and small taxpayers.

Validation: allocation unit and SQLite persistence tests are in desktop/allocation.test.cjs. The desktop smoke test exercises review, apply, save, cancel, year switching, report data, and reload using an isolated database.
