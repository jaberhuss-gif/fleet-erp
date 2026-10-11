import { query } from "./postgres.js";

/* ============================================================
   INVOICE SCHEMA (Phase 2)
   Idempotent — safe to run on every startup.
   ============================================================ */
export async function ensureInvoiceSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      invoice_no TEXT UNIQUE,
      invoice_date DATE,
      contractor_name TEXT,
      site TEXT,
      subtotal NUMERIC(14,2) DEFAULT 0,
      vat NUMERIC(14,2) DEFAULT 0,
      vat_percent NUMERIC(5,2) DEFAULT 15,
      total NUMERIC(14,2) DEFAULT 0,
      source_file TEXT,
      source_type TEXT DEFAULT 'PDF',
      imported_by TEXT,
      imported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'Imported',
      notes TEXT,
      archived_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      line_no INTEGER,
      description TEXT,
      unit TEXT,
      quantity NUMERIC(14,3) DEFAULT 1,
      unit_price NUMERIC(14,2) DEFAULT 0,
      discount_percent NUMERIC(5,2) DEFAULT 0,
      net_amount NUMERIC(14,2) DEFAULT 0,
      total_with_vat NUMERIC(14,2) DEFAULT 0,
      confirmed_amount NUMERIC(14,2) DEFAULT 0,
      matched_request_id BIGINT,
      matched_request_item_id BIGINT,
      matched_work_order_id BIGINT,
      matched_project_id BIGINT,
      match_status TEXT DEFAULT 'Unmatched',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS maintenance_request_items (
      id SERIAL PRIMARY KEY,
      request_id BIGINT NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
      line_no INTEGER,
      description TEXT NOT NULL,
      category TEXT,
      status TEXT DEFAULT 'Open',
      actual_amount NUMERIC(14,2) DEFAULT 0,
      confirmed_amount NUMERIC(14,2) DEFAULT 0,
      invoice_item_id BIGINT REFERENCES invoice_items(id) ON DELETE SET NULL,
      notes TEXT,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS invoice_id INTEGER,
      ADD COLUMN IF NOT EXISTS invoice_no TEXT,
      ADD COLUMN IF NOT EXISTS invoice_date DATE,
      ADD COLUMN IF NOT EXISTS invoice_subtotal NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS invoice_vat NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS invoice_vat_percent NUMERIC(5,2) DEFAULT 15,
      ADD COLUMN IF NOT EXISTS source_file TEXT,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deleted_by TEXT
  `);

  await query(`
    ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS invoice_id INTEGER,
      ADD COLUMN IF NOT EXISTS invoice_no TEXT,
      ADD COLUMN IF NOT EXISTS invoice_date DATE,
      ADD COLUMN IF NOT EXISTS invoice_subtotal NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS invoice_vat NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS invoice_vat_percent NUMERIC(5,2) DEFAULT 15,
      ADD COLUMN IF NOT EXISTS source_file TEXT,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deleted_by TEXT
  `);

  await query(`
    ALTER TABLE work_order_items
      ADD COLUMN IF NOT EXISTS price NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cost NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Not Started',
      ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS confirmed_amount NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS invoice_line_no INTEGER,
      ADD COLUMN IF NOT EXISTS item_no TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_with_vat NUMERIC(14,2) DEFAULT 0
  `);

  await query(`
    ALTER TABLE project_items
      ADD COLUMN IF NOT EXISTS invoice_line_no INTEGER,
      ADD COLUMN IF NOT EXISTS confirmed_amount NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS item_no TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_with_vat NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS quotation_cost NUMERIC(14,2) DEFAULT 0
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_invoices_no ON invoices(invoice_no)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_invoice_items_match ON invoice_items(match_status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_mri_request ON maintenance_request_items(request_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_mri_status ON maintenance_request_items(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_wo_items_wo ON work_order_items(work_order_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pi_project ON project_items(project_id)`);
}
