import express from 'express';
import multer from 'multer';
import { query } from './postgres.js';
import { createWorkOrder } from './database-pg.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/api/intake/email/parse', upload.single('email'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No email file' });
    const content = req.file.buffer.toString('utf-8');
    const parsed = parseEmail(content);
    res.json({ success: true, email: { fileName: req.file.originalname, ...parsed }, issues: parsed.issues });
  } catch (err) {
    console.error('[Email Parse]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/intake/email/save', async (req, res) => {
  try {
    const { email, issues, createdBy } = req.body;
    if (!issues || !issues.length) return res.status(400).json({ error: 'No issues' });
    const emailResult = await query(`INSERT INTO email_uploads (file_name, from_email, from_name, subject, body, received_date, site, detected_issues, attachments_count, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [
      email.fileName || '', email.from || '', email.fromName || '',
      email.subject || '', email.body || '', email.receivedDate || new Date(),
      email.site || '', JSON.stringify(issues), 0, createdBy || 'system'
    ]);
    const emailId = emailResult.rows[0].id;
    const results = { workOrders: 0, errors: [] };
    for (const issue of issues) {
      try {
        const woRow = await createWorkOrder({
          woNo: 'WO-' + Date.now() + '-' + issue.no,
          site: issue.site || email.site || '',
          category: issue.category || 'General',
          description: issue.name || '',
          priority: issue.priority || 'Medium',
          finalCost: Number(issue.price) || 0,
          contractorName: issue.contractor || '',
          isContractor: issue.contractor ? 1 : 0,
          contractorCost: Number(issue.price) || 0,
          reportedDate: email.receivedDate || new Date(),
          status: 'Open',
          month: issue.year + '-' + String(issue.month).padStart(2, '0'),
          year: String(issue.year)
        });
        results.workOrders++;
        await query(`INSERT INTO email_upload_items (email_id, item_no, item_name, description, priority, category, quantity, price, site, type, month, year, work_order_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
          emailId, issue.no || null, issue.name || '', issue.description || '',
          issue.priority || 'Medium', issue.category || 'General',
          Number(issue.quantity) || 1, Number(issue.price) || 0,
          issue.site || '', issue.type || 'work_order',
          issue.month || null, issue.year || null, woRow?.id || null
        ]);
      } catch (itemErr) {
        results.errors.push({ item: issue.name, error: itemErr.message });
      }
    }
    res.json({ success: true, emailId, created: results });
  } catch (err) {
    console.error('[Email Save]', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PARSER محسّن لملفات .eml و .msg و .txt
// ============================================================
function parseEmail(content) {
  const result = { 
    from: '', 
    fromName: '', 
    subject: '', 
    body: '', 
    receivedDate: new Date().toISOString(), 
    issues: [] 
  };
  
  // تنظيف: تحويل \r\n إلى \n
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // فصل Headers عن Body (أول سطر فاضي)
  const headerBodySplit = normalized.indexOf('\n\n');
  const headers = headerBodySplit > 0 ? normalized.slice(0, headerBodySplit) : normalized;
  const body = headerBodySplit > 0 ? normalized.slice(headerBodySplit + 2) : '';
  
  // دالة مساعدة لاستخراج Headers (تدعم folded headers)
  function getHeader(name) {
    const regex = new RegExp('^' + name + ':\\s*([\\s\\S]*?)(?=\\n[A-Za-z][A-Za-z0-9-]*:\\s|\\n\\n|$)', 'im');
    const match = headers.match(regex);
    if (!match) return '';
    // دمج الأسطر المطوية (اللي تبدأ بـ space/tab)
    return match[1].replace(/\n\s+/g, ' ').trim();
  }
  
  // ============ FROM ============
  const fromRaw = getHeader('From');
  if (fromRaw) {
    const emailMatch = fromRaw.match(/<([^>]+)>/);
    const nameMatch = fromRaw.match(/^"?([^"<]+?)"?\s*</);
    result.from = emailMatch ? emailMatch[1].trim() : fromRaw.replace(/^<|>$/g, '').trim();
    result.fromName = nameMatch ? nameMatch[1].trim().replace(/^"|"$/g, '') : '';
  }
  
  // ============ SUBJECT (مع MIME decode) ============
  let subject = getHeader('Subject');
  if (subject) {
    // فك تشفير MIME encoded words: =?UTF-8?B?...?= أو =?UTF-8?Q?...?=
    subject = subject.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (match, charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          return Buffer.from(text, 'base64').toString('utf-8');
        } else {
          // Q encoding
          const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (m, hex) => 
            String.fromCharCode(parseInt(hex, 16))
          );
          return Buffer.from(decoded, 'binary').toString('utf-8');
        }
      } catch { return text; }
    });
    result.subject = subject;
  }
  
  // ============ DATE ============
  const dateRaw = getHeader('Date');
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!isNaN(d.getTime())) result.receivedDate = d.toISOString();
  }
  
  // ============ BODY ============
  let rawBody = body.trim();
  
  // إذا ما لقينا Body، نستخدم كل المحتوى بعد Headers
  if (!rawBody) {
    rawBody = normalized;
  }
  
  // إذا كان Body بصيغة multipart، نحاول نستخرج الجزء النصي
  if (rawBody.includes('Content-Type: text/plain') || rawBody.includes('Content-Type: text/html')) {
    // نجرب نلقط الجزء text/plain أولاً
    const textPlainMatch = rawBody.match(/Content-Type:\s*text\/plain[^\n]*\n(?:[^\n]*\n)*?\n([\s\S]*?)(?=\n--|$)/i);
    if (textPlainMatch) {
      rawBody = textPlainMatch[1];
    } else {
      // نجرب HTML
      const htmlMatch = rawBody.match(/Content-Type:\s*text\/html[^\n]*\n(?:[^\n]*\n)*?\n([\s\S]*?)(?=\n--|$)/i);
      if (htmlMatch) {
        // إزالة وسوم HTML
        rawBody = htmlMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
      }
    }
  }
  
  // فك تشفير MIME encoded words في Body أيضاً
  rawBody = rawBody.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (match, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf-8');
      } else {
        const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (m, hex) => 
          String.fromCharCode(parseInt(hex, 16))
        );
        return Buffer.from(decoded, 'binary').toString('utf-8');
      }
    } catch { return text; }
  });
  
  result.body = rawBody.trim();
  
  // ============ استخراج المشاكل ============
  result.issues = extractIssues(result.body);
  
  return result;
}

// ============================================================
// استخراج المشاكل من نص الإيميل
// ============================================================
function extractIssues(body) {
  const issues = [];
  const lines = body.split(/\n/).map(l => l.trim()).filter(l => l);
  
  const keywords = [
    'damaged', 'broken', 'not working', 'issue', 'problem',
    'leak', 'cracked', 'urgent', 'repair', 'maintenance',
    'failed', 'faulty', 'needs', 'requires',
    'تالف', 'مكسور', 'لا يعمل', 'مشكلة', 'عطل', 'تسريب',
    'متضرر', 'بحاجة', 'يحتاج', 'عاجل', 'صيانة', 'إصلاح'
  ];
  
  let itemNo = 1;
  
  for (const line of lines) {
    if (line.length < 10) continue;
    
    // تجاهل التحيات والختام
    if (/^(Dear|Hi|Hello|Best|Regards|Thanks|Sincerely|أهلاً|مرحباً|مع تحياتي)/i.test(line)) continue;
    
    // تجاهل السطور اللي ما فيها حروف
    if (!/[a-zA-Z\u0600-\u06FF]/.test(line)) continue;
    
    const hasKeyword = keywords.some(k => line.toLowerCase().includes(k.toLowerCase()));
    const startsWithBullet = /^[-•*\d][\.\)]?\s/.test(line);
    
    if (hasKeyword || startsWithBullet) {
      const cleanName = line.replace(/^[-•*\d][\.\)]?\s*/, '').trim();
      
      if (cleanName.length >= 5) {
        issues.push({
          no: itemNo++,
          name: cleanName,
          description: cleanName,
          priority: /urgent|عاجل|critical/i.test(line) ? 'Urgent' : 'Medium',
          category: detectCategory(cleanName),
          quantity: 1,
          price: 0,
          site: '',
          type: 'work_order',
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear()
        });
      }
    }
  }
  
  return issues;
}

// ============================================================
// تصنيف تلقائي للفئة
// ============================================================
function detectCategory(text) {
  const t = text.toLowerCase();
  if (/(electric|light|socket|switch|wire|cable|كهر|لمب|مفتاح|سلك)/i.test(t)) return 'Electrical';
  if (/(plumb|water|pipe|leak|drain|faucet|سباك|ماء|تسريب|صرف|صنبور)/i.test(t)) return 'Plumbing';
  if (/(ac|a\/c|air condition|cool|hvac|تكييف|مكيف|تبريد)/i.test(t)) return 'HVAC';
  if (/(carpent|door|window|wood|نجار|باب|شباك|خشب)/i.test(t)) return 'Carpentry';
  if (/(floor|tile|crack|بلاط|أرضية|تشق)/i.test(t)) return 'General';
  if (/(paint|دهان|طلاء)/i.test(t)) return 'Painting';
  if (/(clean|نظاف|تنظيف)/i.test(t)) return 'Cleaning';
  return 'General';
}

export default router;