# Form allocation in 0.6.0

In the client editor, confirm registration for the selected filing year, review suggested additions, apply them to the draft, and save. Applying suggestions does not save or remove existing forms. Filed forms and periods cannot be removed. The name, TIN, start date, status and remarks remain master-record fields.

SQLite stores explicit yearly profiles separately from legacy client assignments. Existing clients retain their legacy requirements in years without an explicit profile. New clients receive assignments only for the selected year; automatic rollover is a separate development stage. Registration elections are not copied to future years.

Suggestions support calendar-year individual business and ordinary regular-rate corporate profiles. Unconfirmed, special and fiscal-year income treatments require manual selection. VAT/NVAT alone does not establish all tax obligations. The engine does not assess eligibility for an 8% election; the operator confirms it. Annual-return alternatives, including 1701-MS, require review rather than duplicate assignment. Historical VAT years before 2023 need a monthly-declaration review.

Expanded withholding suggestions restrict 0619-E to the first two months of each quarter, retaining any already-filed periods. Existing unreviewed assignments and custom deadline schedules are preserved. Holiday, extension and filing-channel deadline adjustments are outside this stage.

## Rule references

- [BIR RMO 20-2019](https://bir-cdn.bir.gov.ph/BIR/pdf/RMO_NO.20-2019_digest.pdf): individual annual-return distinctions.
- [BIR RMO 23-2018](https://bir-cdn.bir.gov.ph/local/pdf/RMO%20NO.23-2018.pdf): confirmed annual 8% election and percentage-tax treatment.
- [BIR 1702-RT help](https://efps.bir.gov.ph/EFPSWeb_war/forms2013Version/1702RT/1702RT_help.html): regular-rate annual corporate return.
- [BIR RMC 50-2018](https://bir-cdn.bir.gov.ph/local/pdf/RMC%20No%2050-2018.pdf): expanded withholding remittances and information returns.
- [BIR RMC 20-2026](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%2020-2026.pdf): annual-return alternatives for micro and small taxpayers.

Validation: allocation unit and SQLite persistence tests are in desktop/allocation.test.cjs. The desktop smoke test exercises review, apply, save, cancel, year switching, report data, and reload using an isolated database.
