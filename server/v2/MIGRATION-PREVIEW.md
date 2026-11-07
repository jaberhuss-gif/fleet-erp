# ERP V2 Migration Preview

Status: DESIGN/PREVIEW ONLY. No FMMS records are inserted and no legacy database is modified.

## Source
FMMS Database(1).xlsx:
- Data
- Parts
- Purchases
- ProjectManagement
- DevTasks
- MonthlySavings

## Destination
Dedicated PostgreSQL database selected by V2_DATABASE_URL, schema fleet_erp_v2.

## Planned mapping

| FMMS | V2 | Rule |
|---|---|---|
| Data | maintenance_work_orders | one WO row per non-empty WO No |
| Parts | maintenance_parts | link by WO No; total = quantity × unit price |
| Purchases / Work Order | maintenance_purchases | link by Reference ID |
| ProjectManagement | projects | project row retained; blank Start Date excluded from financial activity |
| DevTasks | project_tasks | link by Project ID |
| Purchases / Development Project | project_purchases | link by Reference ID |
| MonthlySavings | validation only | never imported as calculated truth |

## Classification
- KEEP: valid, uniquely identifiable source record.
- REPAIR: valid record with a resolvable missing/format issue.
- LEGACY: historical/reference record not used by active workflow.
- DO_NOT_MIGRATE: duplicate, test, invalid or unresolvable record.

## Financial rules
- Maintenance salary: 2,200 SAR/month.
- Development salary: 2,200 SAR/month.
- Actual = Contractor WO + Contractor Development + Parts WO + Parts Development + salary.
- Savings = Baseline - Actual.
- Savings % = Total Savings / Total Baseline × 100.
- Blank Project Start Date = no development activity for financial reporting.

## Important
The preview must be reviewed before the first INSERT/UPDATE migration operation.
