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

function parseEmail(content) {
  const result = { from: '', fromName: '', subject: '', body: '', receivedDate: new Date().toISOString(), issues: [] };
  const fromMatch = content.match(/From:\s*(.+?)(?:\n|$)/i);
  if (fromMatch) {
    const fromStr = fromMatch[1].trim();
    const emailMatch = fromStr.match(/<(.+?)>/);
    const nameMatch = fromStr.match(/^([^<]+)/);
    result.from = emailMatch ? emailMatch[1] : fromStr;
    result.fromName = nameMatch ? nameMatch[1].trim() : '';
  }
  const subjMatch = content.match(/Subject:\s*(.+?)(?:\n|$)/i);
  if (subjMatch) result.subject = subjMatch[1].trim();
  const dateMatch = content.match(/Date:\s*(.+?)(?:\n|$)/i);
  if (dateMatch) { const d = new Date(dateMatch[1]); if (!isNaN(d.getTime())) result.receivedDate = d.toISOString(); }
  const bodyStart = content.indexOf('\n\n');
  result.body = bodyStart > 0 ? content.slice(bodyStart).trim() : content;
  result.issues = extractIssues(result.body);
  return result;
}

function extractIssues(body) {
  const issues = [];
  const lines = body.split(/\n/).map(l => l.trim()).filter(l => l);
  const keywords = ['damaged','broken','not working','issue','problem','leak','cracked','urgent','repair','maintenance','failed','faulty','needs','requires','تالف','مكسور','لا يعمل','مشكلة','عطل','تسريب','متضرر','بحاجة','يحتاج','عاجل','صيانة','إصلاح'];
  let itemNo = 1;
  for (const line of lines) {
    if (line.length < 10) continue;
    if (/^(Dear|Hi|Hello|Best|Regards|Thanks|Sincerely|أهلاً|مرحباً|مع تحياتي)/i.test(line)) continue;
    const hasKeyword = keywords.some(k => line.toLowerCase().includes(k.toLowerCase()));
    const startsWithBullet = /^[-•*\d][\.\)]?\s/.test(line);
    if (hasKeyword || startsWithBullet) {
      const cleanName = line.replace(/^[-•*\d][\.\)]?\s*/, '').trim();
      if (cleanName.length >= 5) {
        issues.push({
          no: itemNo++, name: cleanName, description: cleanName,
          priority: /urgent|عاجل|critical/i.test(line) ? 'Urgent' : 'Medium',
          category: detectCategory(cleanName),
          quantity: 1, price: 0, site: '', type: 'work_order',
          month: new Date().getMonth() + 1, year: new Date().getFullYear()
        });
      }
    }
  }
  return issues;
}

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
