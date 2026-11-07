# Fleet ERP V2
V2 is isolated from the legacy ERP and uses V2_DATABASE_URL only.

Safety:
- No legacy DATABASE_URL access.
- No automatic migration of legacy records.
- FMMS workbook remains a reference until an explicit import is designed.
- Unique keys prevent duplicate daily KM and daily vehicle submissions.

Financial rules:
- Maintenance salary = 2200 SAR/month.
- Development salary = 2200 SAR/month.
- Actual = Contractor WO/Dev + Parts WO/Dev + salary.
- Savings = Baseline - Actual.
- Savings % = Total Savings / Total Baseline * 100.
- Months are actual report months.
- Projects with blank Start Date are excluded from development activity.

Deployment:
Create a separate PostgreSQL database and set V2_DATABASE_URL. The current DATABASE_URL is never used by V2.