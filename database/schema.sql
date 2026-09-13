PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS company_login (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  company_name TEXT NOT NULL DEFAULT 'EOO Tax & Accounting',
  role TEXT NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin','Staff','Tax Associate','Auditor')),
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  profile_photo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tin TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('VAT','NVAT')),
  status TEXT NOT NULL DEFAULT 'Active',
  pulled_out_at TEXT,
  service_history_json TEXT NOT NULL DEFAULT '[]',
  custom_fields_json TEXT NOT NULL DEFAULT '{}',
  start_of_filing TEXT NOT NULL,
  remarks TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forms (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  frequency TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_forms (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE RESTRICT,
  PRIMARY KEY (client_id, form_id)
);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  period TEXT NOT NULL,
  due_date TEXT NOT NULL,
  UNIQUE (form_id, tax_year, period)
);

CREATE TABLE IF NOT EXISTS filings (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE RESTRICT,
  deadline_id INTEGER REFERENCES deadlines(id) ON DELETE SET NULL,
  filing_date TEXT,
  reference_number TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filing_key TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_client_documents_client ON client_documents(client_id);

CREATE TABLE IF NOT EXISTS calendar_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('holiday','extension')),
  rule_date TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  form_code TEXT NOT NULL DEFAULT '',
  tax_year INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT '',
  adjusted_due TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_deadlines_year ON deadlines(tax_year);
CREATE INDEX IF NOT EXISTS idx_filings_client ON filings(client_id);
CREATE INDEX IF NOT EXISTS idx_filings_status ON filings(status);
