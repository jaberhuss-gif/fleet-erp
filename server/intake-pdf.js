import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { query } from './postgres.js';
import { createWorkOrder, createProject, createPurchase } from './database-pg.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ============================================================
// 1. PARSE PDF
// ============================================================
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

// ============================================================
// 2. SAVE
// ============================================================
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
            site: item.site || '',
            category: item.category || detectCategory(item.name || ''),
            description: item.name || '',
            finalCost: Number(item.price) || 0,
            contractorName: invoice.vendor || '',
            isContractor: 1,
            contractorCost: Number(item.price) || 0,
            reportedDate: invoice.date || new Date(),
            status: 'Closed',
            month: item.year + '-' + String(item.month).padStart(2, '0'),
            year: String(item.year)
          });
          refNo = woRow.wo_no;
          results.workOrders++;
        } else if (item.type === 'project') {
          prjRow = await createProject({
            projectNo: 'PRJ-' + Date.now() + '-' + item.no,
            name: item.name || '',
            site: item.site || '',
            budget: Number(item.price) || 0,
            spent: Number(item.price) || 0,
            contractor: invoice.vendor || '',
            status: 'Closed',
            startDate: invoice.date || new Date(),
            month: item.year + '-' + String(item.month).padStart(2, '0'),
            year: String(item.year)
          });
          refNo = prjRow.project_no;
          results.projects++;
        }
        
        const purchase = await createPurchase({
          type: item.type === 'work_order' ? 'Work Order' : 'Development Project',
          referenceNo: refNo,
          itemName: item.name || '',
          quantity: Number(item.quantity) || 1,
          unitCost: Number(item.price) || 0,
          totalCost: Number(item.price) || 0,
          supplier: invoice.vendor || '',
          purchasedBy: 'Contractor',
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

// ============================================================
// دوال الاستخراج
// ============================================================

function extractInvoiceNo(text) {
  const patterns = [
    /Invoice\s*No\.?\s*:?\s*([A-Z0-9\-\/]+)/i,
    /رقم\s*الفاتورة\s*:?\s*([A-Z0-9\-\/]+)/,
    /رقم\s*المستند\s*:?\s*([A-Z0-9\-\/]+)/,
    /(\d{2}-\d{3}-\d{6})/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return '';
}

function extractDate(text) {
  const patterns = [
    /Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /تاريخ\s*الفاتورة\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
    /(\d{2}\/\d{2}\/\d{4})/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const parts = m[1].split(/[\/\-]/);
      if (parts.length === 3) {
        // DD/MM/YYYY
        return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
      }
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function extractVendor(text) {
  const header = text.slice(0, 800);
  if (/JODOUD\s+AL[- ]?KHALEEJ/i.test(header) || /جدود\s*الخليج/i.test(header) || /جودو\s*الخليج/i.test(header)) {
    return 'JODOUD AL-KHALEEJ';
  }
  return '';
}

function extractVat(text) {
  const m = text.match(/VAT\s*Number\s*:?\s*(\d+)/i) ||
            text.match(/الرقم\s*الضريبي\s*:?\s*(\d+)/);
  return m ? m[1] : '';
}

function extractTotal(text) {
  const patterns = [
    /الإجمالي\s*النهائي\s*بعد\s*الضريبة\s*([\d,]+\.?\d*)/,
    /Total\s*:?\s*SAR\s*([\d,]+\.?\d*)/i,
    /الإجمالي\s*:?\s*([\d,]+\.?\d*)/,
    /SAR\s*([\d,]+\.?\d*)\s*$/m
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
  }
  return 0;
}

function extractProjectRef(text) {
  const m = text.match(/project\s*:?\s*([A-Za-z0-9\s]+)/i);
  return m ? m[1].trim() : '';
}

// ============================================================
// extractItems — النسخة المحسّنة
// ============================================================
function extractItems(text) {
  const items = [];
  const seen = new Set();
  
  // تنظيف النص
  let cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // 1. استخراج الجداول
  const tables = cleanText.match(/<table>[\s\S]*?<\/table>/gi);
  let workingText = tables && tables.length ? tables.join('\n') : cleanText;
  
  // 2. إزالة وسوم HTML
  workingText = workingText.replace(/<br\s*\/?>/gi, '\n').replace(/<\/tr>/gi, '\n').replace(/<[^>]+>/g, ' ');
  
  // 3. نقسم على أسطر
  const lines = workingText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  // ============================================================
  // النمط 1: فاتورة Jodoud — "1AC Feron1auto250.000.00250.00287.50"
  // ============================================================
  for (const line of lines) {
    // تجاهل العناوين
    if (/^(#|رقم الصنف|اسم الصنف|الموقع|الكمية|السعر|خصم|الصافي|الاجمالي|إجمالي|Total|Subtotal|Invoice|Date|VAT|CR)/i.test(line)) continue;
    
    // نمط: رقم + اسم + كمية + "auto" + أسعار
    // مثال: "1AC Feron1auto250.000.00250.00287.50"
    const autoMatch = line.match(/^(\d{1,3})\s*([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF0-9\s\/\-\.\(\)&]{1,80}?)\s*(\d{1,4})\s*auto\s*([\d.]+)/i);
    if (autoMatch) {
      const name = autoMatch[2].trim().replace(/\s+/g, ' ');
      const qty = parseInt(autoMatch[3], 10) || 1;
      
      // تنظيف اسم البند
      let cleanName = name.replace(/auto$/i, '').trim();
      
      if (cleanName.length >= 3 && !seen.has(cleanName.toLowerCase())) {
        seen.add(cleanName.toLowerCase());
        items.push({
          no: items.length + 1,
          name: cleanName,
          quantity: qty,
          price: 0,
          site: '',
          type: 'work_order',
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear()
        });
      }
      continue;
    }
  }
  
  // ============================================================
  // النمط 2: فاتورة عادية — "1 لمبة جبس مقاس 20 4"
  // ============================================================
  if (items.length === 0) {
    for (const line of lines) {
      if (/^(#|رقم|اسم|الموقع|الكمية|السعر|خصم|الصافي|الاجمالي|إجمالي|Total|Subtotal|Invoice|Date|VAT|CR|الإجمالي|الضريبة)/i.test(line)) continue;
      
      // نمط: رقم + اسم (حروف عربية أو إنجليزية) + رقم
      const m = line.match(/^(\d{1,3})\s*([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF0-9\s\/\-\.\(\)&]{2,80}?)\s+(\d{1,5})(?:\s|$)/);
      if (m) {
        const name = m[2].trim().replace(/\s+/g, ' ');
        const qty = parseInt(m[3], 10) || 1;
        
        if (name.length >= 3 && name.length <= 100 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          items.push({
            no: items.length + 1,
            name: name,
            quantity: qty,
            price: 0,
            site: '',
            type: 'work_order',
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear()
          });
        }
      }
    }
  }
  
  // ============================================================
  // النمط 3: كلمات مفتاحية عربية (لمبة، تركيب، تنظيف...)
  // ============================================================
  if (items.length === 0) {
    const arabicPatterns = [
      /^(\d{1,3})\s*(لمبة[^\d\n]{2,40})/i,
      /^(\d{1,3})\s*(تركيب[^\d\n]{2,40})/i,
      /^(\d{1,3})\s*(تنظيف[^\d\n]{2,40})/i,
      /^(\d{1,3})\s*(مرحة[^\d\n]{2,40})/i,
      /^(\d{1,3})\s*(سماعة[^\d\n]{2,40})/i,
      /^(\d{1,3})\s*(فش[^\d\n]{2,40})/i,
      /^(\d{1,3})\s*(أجرة[^\d\n]{2,40})/i
    ];
    
    for (const line of lines) {
      for (const pattern of arabicPatterns) {
        const m = line.match(pattern);
        if (m) {
          const name = m[2].trim().replace(/\s+/g, ' ');
          if (name.length >= 3 && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            items.push({
              no: items.length + 1,
              name: name,
              quantity: parseInt(m[1], 10) || 1,
              price: 0,
              site: '',
              type: 'work_order',
              month: new Date().getMonth() + 1,
              year: new Date().getFullYear()
            });
          }
        }
      }
    }
  }
  
  return items;
}

function detectCategory(name) {
  const t = (name || '').toLowerCase();
  if (/(electric|light|socket|switch|wire|cable|كهر|لمب|مفتاح|سلك|لمبة)/i.test(t)) return 'Electrical';
  if (/(plumb|water|pipe|leak|drain|faucet|سباك|ماء|تسريب|صرف|صنبور|مجرى|مجاري)/i.test(t)) return 'Plumbing';
  if (/(ac|a\/c|air condition|cool|hvac|تكييف|مكيف|تبريد|فيرون|feron)/i.test(t)) return 'HVAC';
  if (/(carpent|door|window|wood|نجار|باب|شباك|خشب)/i.test(t)) return 'Carpentry';
  if (/(floor|tile|crack|بلاط|أرضية|تشق|سيراميك)/i.test(t)) return 'General';
  if (/(paint|دهان|طلاء|صبغ)/i.test(t)) return 'Painting';
  if (/(clean|نظاف|تنظيف)/i.test(t)) return 'Cleaning';
  return 'General';
}

export default router;