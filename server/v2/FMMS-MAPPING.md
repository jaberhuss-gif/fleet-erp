# FMMS -> ERP V2 mapping

This document is the controlled import map. It does not import or alter legacy data.

## FMMS sheets
- Data -> maintenance_work_orders
- Parts -> maintenance_parts
- Purchases -> maintenance_purchases or project_purchases depending on Type
- ProjectManagement -> projects
- DevTasks -> project_tasks
- MonthlySavings -> validation/reference only, not the source of truth

## Rules
1. Data rows with a WO number become maintenance work orders.
2. Parts are linked by WO No and calculated as Quantity * Unit Price.
3. Purchases with Type = Work Order are linked to the maintenance WO by Reference ID.
4. Purchases with Type = Development Project are linked to the project by Reference ID.
5. ProjectManagement rows with blank Start Date are stored only if needed as reference; they do not count as development activity in financial reporting.
6. A project counts financially only when Start Date is not blank.
7. Contractor names are stored explicitly. Blank contractor means internal/company work; it is not silently converted to a fake contractor.
8. MonthlySavings values are used to validate the V2 calculation during migration. They are not copied as calculated totals.
9. Base64 images are not part of financial calculation and are not required for the first V2 migration.
10. Current legacy PostgreSQL remains untouched.

## Financial validation
For each report month:
Actual = Contractor WO + Contractor Development + Parts WO + Parts Development + Maintenance salary + Development salary.

Salary:
- Maintenance = 2,200 SAR/month
- Development = 2,200 SAR/month

Savings = Baseline - Actual.

Savings % = Total Savings / Total Baseline * 100.

The number of months is the number of actual report months represented by the selected data, never hard-coded to zero.

## Duplicate prevention
- daily_vehicle_submission: UNIQUE(vehicle_id, submission_date)
- daily_km_compliance: UNIQUE(vehicle_id, compliance_date)
- km_readings: UNIQUE(vehicle_id, reading_date)
- vehicle plate: UNIQUE(plate_number, plate_code)
- work order number: UNIQUE(wo_no)
- project number: UNIQUE(project_no)
