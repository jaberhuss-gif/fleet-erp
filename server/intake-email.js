import express from 'express';
import multer from 'multer';
import { query } from './postgres.js';
import { createWorkOrder } from './database-pg.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ============================================================
// 1. PARSE EMAIL
// ============================================================
router.post('/api/intake/email/parse', upload.single('email'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No email file' });
    
    const fileName = (req.file.originalname || '').toLowerCase();
    let content;
    
    // التعامل مع .msg (Outlook binary) و .eml (text) و .txt
    if (fileName.endsWith('.msg')) {
      content = extractTextFromMSG(req.file.buffer);
    } else {
      content = req.file.buffer.toString('utf-8');
    }
    
    const parsed = parseEmail(content);
    
    res.json({
      success: true,
      email: { fileName: req.file.originalname, ...parsed },
      issues: parsed.issues
    });
  } catch (err) {
    console.error('[Email Parse]', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2. SAVE
// ============================================================
router.post('/api/intake/email/save', async (req, res) => {
  try {
    const { email, issues, createdBy } = req.body;
    if (!issues || !issues.length) return res.status(400).json({ error: 'No issues' });
    
    const emailResult = await query(
      `INSERT INTO email_uploads (file_name, from_email, from_name, subject, body, received_date, site, detected_issues, attachments_count, created_by) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        email.fileName || '',
        email.from || '',
        email.fromName || '',
        email.subject || '',
        email.body || '',
        email.receivedDate || new Date(),
        email.site || '',
        JSON.stringify(issues),
        0,
        createdBy || 'system'
      ]
    );
    
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
        
        await query(
          `INSERT INTO email_upload_items (email_id, item_no, item_name, description, priority, category, quantity, price, site, type, month, year, work_order_id) 
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            emailId,
            issue.no || null,
            issue.name || '',
            issue.description || '',
            issue.priority || 'Medium',
            issue.category || 'General',
            Number(issue.quantity) || 1,
            Number(issue.price) || 0,
            issue.site || '',
            issue.type || 'work_order',
            issue.month || null,
            issue.year || null,
            woRow?.id || null
          ]
        );
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
// استخراج النص من ملف Outlook .msg (binary format)
// ============================================================
function extractTextFromMSG(buffer) {
  try {
    let result = '';
    
    // 1. محاولة UTF-16LE (الصيغة الأساسية لـ .msg)
    const utf16 = buffer.toString('utf-16le');
    const cleaned16 = utf16
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/[^\x20-\x7E\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\n\r]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    if (cleaned16.length > 100) {
      result = cleaned16;
    } else {
      // 2. Fallback: UTF-8
      const utf8 = buffer.toString('utf-8');
      const cleaned8 = utf8
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
        .replace(/[^\x20-\x7E\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\n\r]/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      result = cleaned8;
    }
    
    // 3. إذا النص فاضي، نحاول latin1
    if (!result || result.length < 20) {
      const latin1 = buffer.toString('latin1');
      result = latin1
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }
    
    return result;
  } catch (err) {
    console.error('[MSG Extract]', err);
    return buffer.toString('utf-8').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, ' ');
  }
}

// ============================================================
// PARSER — يستخرج From, Subject, Body, Issues
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
  
  // محاولة استخراج Headers (إذا كان .eml أو نص فيه headers)
  const headerBodySplit = normalized.indexOf('\n\n');
  const headers = headerBodySplit > 0 ? normalized.slice(0, headerBodySplit) : '';
  const bodyPart = headerBodySplit > 0 ? normalized.slice(headerBodySplit + 2) : normalized;
  
  function getHeader(name) {
    if (!headers) return '';
    const regex = new RegExp('^' + name + ':\\s*([\\s\\S]*?)(?=\\n[A-Za-z][A-Za-z0-9-]*:\\s|\\n\\n|$)', 'im');
    const match = headers.match(regex);
    if (!match) return '';
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
    subject = decodeMIME(subject);
    result.subject = subject;
  } else {
    // إذا ما فيه headers، نبحث عن نمط "Subject: xxx" في كل النص
    const subjMatch = normalized.match(/Subject\s*:?\s*([^\n]{3,200})/i);
    if (subjMatch) result.subject = decodeMIME(subjMatch[1].trim());
  }
  
  // ============ DATE ============
  const dateRaw = getHeader('Date');
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!isNaN(d.getTime())) result.receivedDate = d.toISOString();
  } else {
    // نبحث في كل النص
    const dateMatch = normalized.match(/Date\s*:?\s*([^\n]{5,80})/i);
    if (dateMatch) {
      const d = new Date(dateMatch[1]);
      if (!isNaN(d.getTime())) result.receivedDate = d.toISOString();
    }
  }
  
  // ============ BODY ============
  let rawBody = bodyPart.trim();
  
  // إذا ما لقينا Body، نستخدم كل المحتوى
  if (!rawBody || rawBody.length < 20) {
    rawBody = normalized;
  }
  
  // إذا كان multipart، نستخرج text/plain أو text/html
  if (rawBody.includes('Content-Type: text/plain') || rawBody.includes('Content-Type: text/html')) {
    const textPlainMatch = rawBody.match(/Content-Type:\s*text\/plain[^\n]*\n(?:[^\n]*\n)*?\n([\s\S]*?)(?=\n--|$)/i);
    if (textPlainMatch) {
      rawBody = textPlainMatch[1];
    } else {
      const htmlMatch = rawBody.match(/Content-Type:\s*text\/html[^\n]*\n(?:[^\n]*\n)*?\n([\s\S]*?)(?=\n--|$)/i);
      if (htmlMatch) {
        rawBody = htmlMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
      }
    }
  }
  
  // فك MIME في Body
  rawBody = decodeMIME(rawBody);
  
  result.body = rawBody.trim();
  
  // ============ استخراج المشاكل ============
  result.issues = extractIssues(result.body);
  
  return result;
}

// ============================================================
// فك تشفير MIME encoded words
// ============================================================
function decodeMIME(text) {
  return text.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (match, charset, encoding, encodedText) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(encodedText, 'base64').toString('utf-8');
      } else {
        const decoded = encodedText.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (m, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        return Buffer.from(decoded, 'binary').toString('utf-8');
      }
    } catch { return match; }
  });
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
    'failed', 'faulty', 'needs', 'requires', 'dilapidated',
    'deteriorated', 'out of service', 'malfunction',
    'تالف', 'مكسور', 'لا يعمل', 'مشكلة', 'عطل', 'تسريب',
    'متضرر', 'بحاجة', 'يحتاج', 'عاجل', 'صيانة', 'إصلاح',
    'متدهور', 'تلف', 'عيب'
  ];
  
  let itemNo = 1;
  
  for (const line of lines) {
    if (line.length < 15) continue;
    
    // تجاهل التحيات
    if (/^(Dear|Hi|Hello|Best|Regards|Thanks|Sincerely|أهلاً|مرحباً|مع تحياتي|تحياتي)/i.test(line)) continue;
    
    // تجاهل Headers
    if (/^(From|To|Subject|Date|Cc|Bcc|Sent|Importance|Attachments?|Content-Type|MIME|Message-ID|Reply-To):/i.test(line)) continue;
    
    // تجاهل السطور اللي ما فيها حروف
    if (!/[a-zA-Z\u0600-\u06FF]/.test(line)) continue;
    
    // تجاهل روابط URL
    if (/^https?:\/\//i.test(line)) continue;
    
    const hasKeyword = keywords.some(k => line.toLowerCase().includes(k.toLowerCase()));
    const startsWithBullet = /^[-•*\u2022\u25CF\u25AA\u2023\u25A0\u2610\uF0B7]\s/.test(line);
    const numberedItem = /^\d+[\.\)]\s/.test(line);
    const endsWithPeriod = /\.\s*$/.test(line);
    
    // السطر لازم يبدأ بـ bullet/number أو فيه keyword + ينتهي بنقطة/فاصلة
    if ((hasKeyword && endsWithPeriod) || startsWithBullet || numberedItem || (hasKeyword && line.length > 30)) {
      const cleanName = line
        .replace(/^[-•*\u2022\u25CF\u25AA\u2023\u25A0\u2610\uF0B7]\s*/, '')
        .replace(/^\d+[\.\)]\s*/, '')
        .trim();
      
      if (cleanName.length >= 10 && cleanName.length <= 300) {
        issues.push({
          no: itemNo++,
          name: cleanName,
          description: cleanName,
          priority: /urgent|عاجل|critical|immediately|asap/i.test(line) ? 'Urgent' : 'Medium',
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
  const t = (text || '').toLowerCase();
  if (/(electric|light|socket|switch|wire|cable|outlet|كهر|لمب|مفتاح|سلك|إضاءة|مقبس)/i.test(t)) return 'Electrical';
  if (/(plumb|water|pipe|leak|drain|faucet|toilet|بلك|سباك|ماء|تسريب|صرف|صنبور|مرحاض|حمام)/i.test(t)) return 'Plumbing';
  if (/(ac|a\/c|air condition|cool|hvac|تكييف|مكيف|تبريد)/i.test(t)) return 'HVAC';
  if (/(carpent|door|window|wood|نجار|باب|شباك|خشب)/i.test(t)) return 'Carpentry';
  if (/(floor|tile|crack|ceiling|أرضية|بلاط|تشق|سقف|جدار|wall)/i.test(t)) return 'General';
  if (/(paint|دهان|طلاء|صبغ)/i.test(t)) return 'Painting';
  if (/(clean|نظاف|تنظيف)/i.test(t)) return 'Cleaning';
  return 'General';
}

export default router;