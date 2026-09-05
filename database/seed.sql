PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO forms (code,name,description,frequency) VALUES
('1701-Q','Quarterly income tax · Individuals','Quarterly Income Tax Return for Individuals, Estates and Trusts','Quarterly'),
('2550-Q','Quarterly value-added tax','Quarterly Value-Added Tax Return','Quarterly'),
('2551-Q','Quarterly percentage tax','Quarterly Percentage Tax Return','Quarterly'),
('1601-C','Monthly withholding · Compensation','Monthly Remittance Return of Income Taxes Withheld on Compensation','Monthly'),
('1701','Annual income tax · Individuals','Annual Income Tax Return for Individuals, Estates and Trusts','Annual'),
('1702','Annual income tax · Corporations','Annual Income Tax Return for Corporations, Partnerships and Other Non-Individual Taxpayers','Annual');
