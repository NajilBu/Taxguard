from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = r'C:\xampp\htdocs\Taxguard\TaxGuard_User_Manual.docx'
d = Document()
s = d.sections[0]
s.top_margin = Inches(.7); s.bottom_margin = Inches(.65)
s.left_margin = Inches(.75); s.right_margin = Inches(.75)
for name, size in [('Title',30),('Heading 1',19),('Heading 2',13)]:
    st=d.styles[name]; st.font.name='Aptos'; st.font.size=Pt(size)
    st.font.bold=True; st.font.color.rgb=RGBColor(0,0,0)
st=d.styles['Normal']; st.font.name='Aptos'; st.font.size=Pt(10)
st.font.color.rgb=RGBColor(35,48,65); st.paragraph_format.space_after=Pt(6)

def shade(cell,fill):
    x=cell._tc.get_or_add_tcPr(); z=OxmlElement('w:shd')
    z.set(qn('w:fill'),fill); x.append(z)
def border(cell):
    x=cell._tc.get_or_add_tcPr(); b=OxmlElement('w:tcBorders'); x.append(b)
    for edge in ('top','left','bottom','right'):
        z=OxmlElement('w:'+edge); z.set(qn('w:val'),'single')
        z.set(qn('w:sz'),'4'); z.set(qn('w:color'),'D9D9D9'); b.append(z)
def table(headers,rows):
    t=d.add_table(rows=1,cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for i,value in enumerate(headers):
        c=t.rows[0].cells[i]; c.text=value; c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        shade(c,'123B5D'); border(c)
        for r in c.paragraphs[0].runs:
            r.font.bold=True; r.font.color.rgb=RGBColor(255,255,255); r.font.size=Pt(9)
    for row_index,values in enumerate(rows):
        cells=t.add_row().cells
        for i,value in enumerate(values):
            cells[i].text=str(value); cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            border(cells[i])
            if row_index%2: shade(cells[i],'F3F7FB')
            for p in cells[i].paragraphs:
                for r in p.runs: r.font.size=Pt(9)
    d.add_paragraph()
def num(text): d.add_paragraph(text,style='List Number')
def bullet(text): d.add_paragraph(text,style='List Bullet')

d.add_paragraph('TaxGuard User Manual',style='Title')
p=d.add_paragraph('Local compliance workspace operations')
p.runs[0].font.size=Pt(15); p.runs[0].font.color.rgb=RGBColor(39,102,219)
d.add_paragraph('Version 0.9.2 | October 2026')
p=d.add_paragraph(); p.add_run('Purpose. ').bold=True
p.add_run('This manual explains how a company team manages clients, filing obligations, supporting documents, reports, users, and local backups in TaxGuard.')
d.add_paragraph('TaxGuard records filing activity after a return is submitted through the normal external filing channel. It does not prepare or transmit tax returns to BIR.')
table(['Area','Current behavior'],[
 ('Access','Desktop app or local XAMPP browser interface.'),
 ('Storage','Local SQLite database shared by the development desktop and localhost interfaces.'),
 ('Accounts','First-run administrator setup, session expiry, and role-based access.'),
 ('Transfers','Client and filing Excel transfer; complete SQLite backup and restore.'),
 ('Deadlines','Weekend adjustment plus administrator-entered holidays and sourced extensions.')])

d.add_heading('1  First-time setup and sign-in',1)
for x in ['Open TaxGuard. A new database displays Set Up TaxGuard.',
          'Enter the company name and create the first administrator username and password.',
          'Sign in with the new account. TaxGuard does not provide a default password.']: num(x)
d.add_paragraph('Sessions expire after 30 minutes without activity and are revoked on sign-out. Sign-out clears the visible credential fields.')

d.add_heading('2  Roles and navigation',1)
table(['Role or area','Purpose'],[
 ('Administrator','Manage users, company profile, custom fields, schedules, calendar rules, imports, restore, and audit records.'),
 ('Staff roles','Work with clients, filings, documents, reports, exports, and backup creation.'),
 ('Overview','Review yearly totals, risk groups, progress by form, and recent filings.'),
 ('Client directory','Create, search, filter, edit, pull out, and pull in clients.'),
 ('Compliance tracker','Filter obligations and record or review filings.'),
 ('Deadline reference','Maintain form schedules, holidays, overrides, and extensions.'),
 ('Settings','Manage company details, users, fields, reports, transfers, backups, and audit records.')])

d.add_heading('3  Manage clients and yearly requirements',1)
for x in ['Open Client directory and choose Add client.',
          'Enter the name, unique TIN, business type, tax type, filing start date, and profile details.',
          'Select the required BIR forms and save after reviewing the confirmation.']: num(x)
d.add_paragraph('Recurring requirements carry into later years automatically. Year-specific registration choices can change without rewriting earlier history. Year history begins with the first applicable filing year; earlier empty years are omitted.')
d.add_heading('Pullout and resumed service',2)
d.add_paragraph('Pull out records the last service day. Historical filings remain while later unfiled periods are excluded. Pull in records the first resumed-service day and restores later obligations while retaining the service gap.')

d.add_heading('4  Maintain deadline references',1)
d.add_paragraph('Schedules define monthly, quarterly, and annual obligations. Period terms use controlled choices. Weekend dates move to the next working day. Administrators can add holidays and sourced BIR extensions, or apply an exact manual override.')
d.add_paragraph('TaxGuard does not fetch official circulars automatically. Verify schedules, holidays, and extensions against current official BIR guidance.')

d.add_heading('5  Record filings and documents',1)
for x in ['Open Compliance tracker, select the year, and filter to the obligation.',
          'Open the filing window from the row or client details.',
          'Enter the filing date, confirmation or reference number, and optional remarks.',
          'Optionally attach a PDF, PNG, JPEG, or WebP copy up to 5 MB.',
          'Review the confirmation and save. Dashboard and client progress update immediately.']: num(x)
d.add_paragraph('A due date in the next calendar year is filed from the correct filing year. Uploaded content must match its declared file type.')
table(['Status','Meaning'],[
 ('Complete','Every applicable obligation has a saved filing.'),
 ('Pending','At least one applicable filing is still due today or later.'),
 ('Incomplete','At least one applicable filing is overdue.'),
 ('N/A','No obligation applies for the selected year.'),
 ('Pulled out','Service ended; later unfiled periods are excluded.')])

d.add_heading('6  Search, risk radar, and history',1)
d.add_paragraph('Search by client name or TIN and filter by tax type, business type, status, form, or period. The risk radar groups unfiled obligations into overdue, due today, due within three days, and due within seven days. Selecting a card fills its five-row table; selecting a row opens its filing flow.')
d.add_paragraph('Year history shows applicable years and a consolidated five-year summary. Filing records and service history remain tied to their original years.')

d.add_heading('7  Reports and Excel transfer',1)
d.add_paragraph('Each report asks for a year range and client selection. Use the checklist header to select or clear clients, search the list, then open the preview. Reports support Excel and PDF output.')
for x in ['In Settings, choose Export data and select clients and a filing-year range.',
          'Choose the save location for the Excel workbook.',
          'For import, select a TaxGuard workbook and review the detected clients and years.',
          'Select the import scope. Existing matching TINs and filing keys are retained safely.']: num(x)
d.add_paragraph('Excel transfer includes client profiles and filing information. It excludes accounts and passwords.')

d.add_heading('8  Backup, restore, and audit',1)
d.add_paragraph('Backup saves a complete SQLite copy containing clients, filings, accounts, documents, company settings, calendar rules, and audit history. Restore only a trusted TaxGuard database. Integrity is verified and a recovery copy is created before replacement.')
d.add_paragraph('Successful changes enter an append-only audit log. Administrators can filter by user, action, and date. Passwords and uploaded document contents are excluded from summaries.')

d.add_heading('9  Company settings and custom fields',1)
d.add_paragraph('Administrators can change the company logo, name, and description. Custom client fields appear in records and the directory. User accounts can be added, edited, deactivated, and assigned a profile picture. Destructive changes require confirmation.')

d.add_heading('10  Operational safeguards',1)
for x in ['Keep Excel exports, backups, and filing documents private.',
          'Create regular full backups and periodically test restoration on a separate copy.',
          'Review the risk radar and overdue list routinely.',
          'Confirm official deadlines before operational use.',
          'Do not close the app during import, restore, or document save.']: bullet(x)
d.add_paragraph('TaxGuard 0.9.2 | Integrated multi-year compliance monitoring').alignment=WD_ALIGN_PARAGRAPH.CENTER
d.save(OUT)
print(OUT)
