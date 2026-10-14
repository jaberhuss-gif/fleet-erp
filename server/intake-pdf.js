import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { query } from './postgres.js';
import { createWorkOrder, createProject, createPurchase } from './database-pg.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/api/intake/pdf/parse', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file' });
    const data = await pdfParse(req.file.buffer);
    const text = data.text;
    const invoice = {
      fileName: req.file.originalname,
      invoiceNo: extractInvoiceNo(text),
      date: extractDate(text),
      vendor: extractVendor(text),
      vendorVat: extractVat(text),
      total: extractTotal(text),
      projectRef: extractProjectRef(text)
    };
    const items = extractItems(text);
    res.json({ success: true, invoice, items });
  } catch (err) {
    console.error('[PDF Parse]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/intake/pdf/save', async (req, res) => {
  try {
    const { invoice, items, createdBy } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items' });
    const uploadResult = await query(`INSERT INTO invoice_uploads (file_name, invoice_no, invoice_date, vendor, vendor_vat, total_amount, items_count, source_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'pdf',$8) RETURNING *`, [
      invoice.fileName || '', invoice.invoiceNo || '', invoice.date || null,
      invoice.vendor || '', invoice.vendorVat || '', Number(invoice.total) || 0,
      items.length, createdBy || 'system'
    ]);
    const uploadId = uploadResult.rows[0].id;
    const results = { workOrders: 0, projects: 0, purchases: 0, errors: [] };
    for (const item of items) {
      try {
        let refNo = null, woRow = null, prjRow = null;
        if (item.type === 'work_order') {
          woRow = await createWorkOrder({
            woNo: 'WO-' + Date.now() + '-' + item.no,
            site: item.site || '', category: item.category || 'General',
            description: item.name || '', finalCost: Number(item.price) || 0,
            contractorName: invoice.vendor || '', isContractor: 1,
            contractorCost: Number(item.price) || 0,
            reportedDate: invoice.date || new Date(), status: 'Closed',
            month: item.year + '-' + String(item.month).padStart(2, '0'),
            year: String(item.year)
          });
          refNo = woRow.wo_no; results.workOrders++;
        } else if (item.type === 'project') {
          prjRow = await createProject({
            projectNo: 'PRJ-' + Date.now() + '-' + item.no,
            name: item.name || '', site: item.site || '',
            budget: Number(item.price) || 0, spent: Number(item.price) || 0,
            contractor: invoice.vendor || '', status: 'Closed',
            startDate: invoice.date || new Date(),
            month: item.year + '-' + String(item.month).padStart(2, '0'),
            year: String(item.year)
          });
          refNo = prjRow.project_no; results.projects++;
        }
        const purchase = await createPurchase({
          type: item.type === 'work_order' ? 'Work Order' : 'Development Project',
          referenceNo: refNo, itemName: item.name || '',
          quantity: Number(item.quantity) || 1,
          unitCost: Number(item.price) || 0, totalCost: Number(item.price) || 0,
          supplier: invoice.vendor || '', purchasedBy: 'Contractor',
          purchaseDate: invoice.date || new Date(),
          notes: 'Imported from invoice ' + (invoice.invoiceNo || '')
        });
        results.purchases++;
        await query(`INSERT INTO invoice_upload_items (upload_id, item_no, item_name, quantity, price, site, type, month, year, work_order_id, project_id, purchase_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
          uploadId, item.no || null, item.name || '', Number(item.quantity) || 1,
          Number(item.price) || 0, item.site || '', item.type || 'work_order',
          item.month || null, item.year || null,
          woRow?.id || null, prjRow?.id || null, purchase?.id || null
        ]);
      } catch (itemErr) {
        console.error('[PDF Save Item]', itemErr);
        results.errors.push({ item: item.name, error: itemErr.message });
      }
    }
    res.json({ success: true, uploadId, created: results });
  } catch (err) {
    console.error('[PDF Save]', err);
    res.status(500).json({ error: err.message });
  }
});

function extractInvoiceNo(text) {
  const patterns = [/Invoice\s*No\.?\s*([A-Z0-9-]+)/i, /رقم\s*الفاتورة\s*:?\s*([A-Z0-9-]+)/, /رقم\s*المستند\s*:?\s*([A-Z0-9-]+)/];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1].trim(); }
  return '';
}
function extractDate(text) {
  const patterns = [/Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i, /تاريخ\s*الفاتورة\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/];
  for (const p of patterns) { const m = text.match(p); if (m) { const parts = m[1].split(/[\/\-]/); return parts[2] + '-' + parts[1].padStart(2,'0') + '-' + parts[0].padStart(2,'0'); } }
  return new Date().toISOString().slice(0, 10);
}
function extractVendor(text) {
  const header = text.slice(0, 500);
  if (/JODOUD\s+AL[- ]?KHALEEJ/i.test(header)) return 'JODOUD AL-KHALEEJ';
  return '';
}
function extractVat(text) {
  const m = text.match(/VAT\s*Number\s*:?\s*(\d+)/i) || text.match(/الرقم\s*الضريبي\s*:?\s*(\d+)/);
  return m ? m[1] : '';
}
function extractTotal(text) {
  const patterns = [/الإجمالي\s*النهائي\s*بعد\s*الضريبة\s*([\d,]+\.?\d*)/, /Total\s*:?\s*SAR\s*([\d,]+\.?\d*)/i, /الإجمالي\s*:?\s*([\d,]+\.?\d*)/];
  for (const p of patterns) { const m = text.match(p); if (m) return parseFloat(m[1].replace(/,/g, '')); }
  return 0;
}
function extractProjectRef(text) {
  const m = text.match(/project\s*:?\s*([A-Za-z0-9\s]+)/i);
  return m ? m[1].trim() : '';
}
function extractItems(text) {
  const items = [];
  const tableMatch = text.match(/<table>([\s\S]*?)<\/table>/);
  const tableText = tableMatch ? tableMatch[1] : text;
  const lines = tableText.split(/\n|<br>|<\/tr>/).filter(l => l.trim());
  let itemNo = 1;
  for (const line of lines) {
    const clean = line.replace(/<[^>]+>/g, '').trim();
    if (!clean) continue;
    if (!/[\u0600-\u06FFa-zA-Z]/.test(clean)) continue;
    if (/^(اسم الصنف|الكمية|السعر|الإجمالي|Total|Item)/i.test(clean)) continue;
    const m = clean.match(/^(\d+)\s*([^\d]+?)\s*(\d+(?:\.\d+)?)?$/);
    if (m) {
      const name = m[2].trim();
      const qty = parseFloat(m[3]) || 1;
      if (name.length > 2) {
        items.push({ no: itemNo++, name, quantity: qty, price: 0, site: '', type: 'work_order', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
      }
    }
  }
  return items;
}

export default router;
