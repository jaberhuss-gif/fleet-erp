CREATE TABLE IF NOT EXISTS invoice_uploads (
  id SERIAL PRIMARY KEY,
  file_name TEXT,
  invoice_no TEXT,
  invoice_date DATE,
  vendor TEXT,
  vendor_vat TEXT,
  total_amount NUMERIC,
  items_count INT DEFAULT 0,
  source_type TEXT DEFAULT 'pdf',
  raw_text TEXT,
  status TEXT DEFAULT 'Completed',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_upload_items (
  id SERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES invoice_uploads(id) ON DELETE CASCADE,
  item_no INT,
  item_name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 1,
  price NUMERIC DEFAULT 0,
  site TEXT,
  type TEXT,
  month INT,
  year INT,
  work_order_id BIGINT,
  project_id BIGINT,
  purchase_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_uploads (
  id SERIAL PRIMARY KEY,
  file_name TEXT,
  from_email TEXT,
  from_name TEXT,
  subject TEXT,
  body TEXT,
  received_date TIMESTAMPTZ,
  site TEXT,
  detected_issues JSONB DEFAULT '[]',
  attachments_count INT DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_upload_items (
  id SERIAL PRIMARY KEY,
  email_id BIGINT REFERENCES email_uploads(id) ON DELETE CASCADE,
  item_no INT,
  item_name TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'Medium',
  category TEXT,
  quantity NUMERIC DEFAULT 1,
  price NUMERIC DEFAULT 0,
  site TEXT,
  type TEXT,
  month INT,
  year INT,
  work_order_id BIGINT,
  project_id BIGINT,
  purchase_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_uploads_date ON invoice_uploads(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_upload_items_upload ON invoice_upload_items(upload_id);
CREATE INDEX IF NOT EXISTS idx_email_uploads_date ON email_uploads(received_date);
CREATE INDEX IF NOT EXISTS idx_email_upload_items_email ON email_upload_items(email_id);
