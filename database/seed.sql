PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO forms (code,name,description,frequency) VALUES
('1701-Q','Quarterly income tax · Individuals','Quarterly Income Tax Return for Individuals, Estates and Trusts','Quarterly'),
('1702-Q','Quarterly income tax · Corporations','Quarterly Income Tax Return for Corporations and Other Non-Individual Taxpayers','Quarterly'),
('2550-Q','Quarterly value-added tax','Quarterly Value-Added Tax Return','Quarterly'),
('2551-Q','Quarterly percentage tax','Quarterly Percentage Tax Return','Quarterly'),
('1601-C','Monthly withholding · Compensation','Monthly Remittance Return of Income Taxes Withheld on Compensation','Monthly'),
('0619-E','Monthly creditable withholding · Expanded','Monthly Remittance Form of Creditable Income Taxes Withheld (Expanded)','Monthly'),
('1601-EQ','Quarterly creditable withholding · Expanded','Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)','Quarterly'),
('1601-FQ','Quarterly final withholding tax return','Quarterly Remittance Return of Final Income Taxes Withheld','Quarterly'),
('0605','Payment form / Annual registration','Payment Form / Registration-Related Payments','Annual'),
('1701','Annual income tax · Individuals','Annual Income Tax Return for Individuals, Estates and Trusts','Annual'),
('1702','Annual income tax · Corporations','Annual Income Tax Return for Corporations, Partnerships and Other Non-Individual Taxpayers','Annual'),
('1604-C','Annual withholding info return · Compensation','Annual Information Return of Income Taxes Withheld on Compensation','Annual'),
('1604-E','Annual withholding info return · Expanded','Annual Information Return of Creditable Income Taxes Withheld','Annual');
