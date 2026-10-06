import { randomUUID } from "crypto";
import { query } from "./postgres.js";
import { createWorkOrder, updateWorkOrder, getWorkOrder } from "./database-pg.js";

const OWNER_EMAIL = "Hussein.Anwar@iemaadex.com";
const CC_EMAILS = ["Mohamed.Hassan@iemaadex.com", "Jahangeer.Mohammed@iemaadex.com"];
const CONTRACTORS = [
  { name: "Jodoud Al Khaleej", email: "jodoudalkhaleej.co.sa@gmail.com" },
  { name: "Raghad Alafq", email: "raghadalafq@gmail.com" }
];
const CAMPUS_BY_SITE = {
  "Uqlat Al Soqour": ["Samer.Abdulmalik@iemaadex.com", "bader.almasrahi@iemaadex.com"],
  "Wadi Beddah": ["Meshal.Alghamdi@iemaadex.com"],
  "Al Hadar": ["Amr.Mohamed@iemaadex.com", "Mostafa.Magdy@iemaadex.com"],
  "Al Quwayiyah": ["Amr.Mohamed@iemaadex.com", "Mostafa.Magdy@iemaadex.com"],
  "Al Sabiyah": ["shezad.khan@iemaadex.com"],
  "Al Hulayfa": ["nouman.khan@iemaadex.com"]
};

const appUrl = () => String(process.env.APP_URL || process.env.PUBLIC_APP_URL || "https://fleet-erp-kn0c.onrender.com").replace(/\/$/, "");

function clean(v) { return String(v ?? "").trim(); }

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id BIGSERIAL PRIMARY KEY,
      request_no TEXT UNIQUE,
      site TEXT,
      category TEXT,
      priority TEXT,
      description TEXT NOT NULL,
      requester_user_id BIGINT,
      requester_name TEXT,
      requester_email TEXT,
      status TEXT NOT NULL DEFAULT 'New',
      work_order_id BIGINT,
      executor_type TEXT,
      executor_name TEXT,
      executor_email TEXT,
      completion_token TEXT UNIQUE,
      confirmation_token TEXT UNIQUE,
      contractor_notified_at TIMESTAMPTZ,
      email_status TEXT NOT NULL DEFAULT 'Not Sent',
      email_sent_at TIMESTAMPTZ,
      email_error TEXT,
      acknowledged_at TIMESTAMPTZ,
      acknowledgement_token TEXT UNIQUE,
      completed_at TIMESTAMPTZ,
      requester_confirmed_at TIMESTAMPTZ,
      requester_confirmation TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS maintenance_request_id BIGINT`);
  await query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS operational_status TEXT DEFAULT 'Open'`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'Not Sent'`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS email_error TEXT`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS acknowledgement_token TEXT UNIQUE`);
  await query(`CREATE INDEX IF NOT EXISTS idx_maintenance_requests_status ON maintenance_requests(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_maintenance_requests_work_order ON maintenance_requests(work_order_id)`);
  await query(`UPDATE maintenance_requests SET acknowledgement_token=COALESCE(NULLIF(acknowledgement_token,''), gen_random_uuid()::text), completion_token=COALESCE(NULLIF(completion_token,''), gen_random_uuid()::text) WHERE acknowledgement_token IS NULL OR acknowledgement_token='' OR completion_token IS NULL OR completion_token=''`);
}

async function sendEmail({ to, cc = [], subject, html }) {
  const apiKey = clean(process.env.RESEND_API_KEY);
  const from = clean(process.env.EMAIL_FROM || process.env.INSPECTION_EMAIL_FROM || OWNER_EMAIL);
  const recipients = (Array.isArray(to) ? to : [to]).map(clean).filter(Boolean);
  if (!apiKey || !from || !recipients.length) {
    return { sent: false, reason: "Email service is not configured (RESEND_API_KEY / EMAIL_FROM)." };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, cc: cc.map(clean).filter(Boolean), subject, html })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email provider error: ${response.status} ${body}`);
  }
  return { sent: true };
}

function button(url, text, color = "#0f766e") {
  return `<a href="${url}" style="display:inline-block;padding:11px 18px;background:${color};color:#fff;text-decoration:none;border-radius:7px;font-weight:700;margin:4px">${text}</a>`;
}

function siteCc(site) {
  return CAMPUS_BY_SITE[clean(site)] || [];
}

async function getRequestByToken(token) { const r=await query(`SELECT * FROM maintenance_requests WHERE completion_token=$1 OR confirmation_token=$1`, [token]); return r.rows[0] || null; }

async function getRequest(id) {
  const r = await query(`SELECT * FROM maintenance_requests WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

async function notifyNewRequest(reqRow) {
  const cc = [...CC_EMAILS, ...siteCc(reqRow.site)];
  return sendEmail({
    to: OWNER_EMAIL,
    cc,
    subject: `NEW BUILDING MAINTENANCE REQUEST — ${reqRow.request_no}`,
    html: `
      <h2>🛠️ New Building Maintenance Request</h2>
      <p><b>Request:</b> ${reqRow.request_no}</p>
      <p><b>Site:</b> ${reqRow.site || "-"}</p>
      <p><b>Type:</b> ${reqRow.category || "-"}</p>
      <p><b>Priority:</b> ${reqRow.priority || "-"}</p>
      <p><b>Requested by:</b> ${reqRow.requester_name || "-"}</p>
      <p><b>Problem:</b><br>${reqRow.description.replace(/</g,"&lt;").replace(/\n/g,"<br>")}</p>
      <p>This request is waiting for Fleet / Building Maintenance review and assignment.</p>
    `
  });
}

async function notifyAssignment(reqRow) {
  const recipients = reqRow.executor_email ? [reqRow.executor_email] : [];
  const acknowledgeUrl = `${appUrl()}/api/maintenance-requests/public/${reqRow.acknowledgement_token}/acknowledge`;
  const completeUrl = `${appUrl()}/api/maintenance-requests/public/${reqRow.completion_token}/work-completed`;
  return sendEmail({
    to: recipients,
    cc: [OWNER_EMAIL, ...CC_EMAILS],
    subject: `BUILDING MAINTENANCE — ${reqRow.request_no} ASSIGNED`,
    html: `
      <h2>🛠️ Building Maintenance Work Assigned</h2>
      <p><b>Request:</b> ${reqRow.request_no}</p>
      <p><b>Site:</b> ${reqRow.site || "-"}</p>
      <p><b>Problem:</b> ${reqRow.description}</p>
      <p><b>Assigned to:</b> ${reqRow.executor_name}</p>
      <p>First confirm that you received this work assignment:</p>
      ${button(acknowledgeUrl, "📩 ACKNOWLEDGE RECEIPT", "#2563eb")}
      <p>After completing the repair, use the button below:</p>
      ${button(completeUrl, "✅ WORK COMPLETED")}
    `
  });
}

async function notifyRequesterReady(reqRow) {
  if (!reqRow.requester_email) return { sent: false, reason: "Requester email is not available." };
  const yes = `${appUrl()}/api/maintenance-requests/public/${reqRow.confirmation_token}/confirm?answer=yes`;
  const no = `${appUrl()}/api/maintenance-requests/public/${reqRow.confirmation_token}/confirm?answer=no`;
  return sendEmail({
    to: [reqRow.requester_email],
    cc: [OWNER_EMAIL],
    subject: `BUILDING MAINTENANCE — ${reqRow.request_no} READY FOR CONFIRMATION`,
    html: `
      <h2>🛠️ Maintenance Work Completed</h2>
      <p>Your building maintenance request <b>${reqRow.request_no}</b> has been reported as completed.</p>
      <p><b>Site:</b> ${reqRow.site || "-"}</p>
      <p><b>Problem:</b> ${reqRow.description}</p>
      <p>Please confirm whether everything is now OK:</p>
      ${button(yes, "✅ YES — Everything is OK", "#15803d")}
      ${button(no, "❌ NO — Problem Not Fixed", "#b91c1c")}
    `
  });
}

export function contractorOptions() { return CONTRACTORS; }

export function mountBuildingMaintenanceRequestRoutes(app) {
  app.post("/api/maintenance-requests", async (req, res) => {
    try {
      await ensureSchema();
      const { site, category, description, priority } = req.body || {};
      if (!clean(description)) return res.status(400).json({ success:false, error:"Maintenance description is required" });
      const requesterName = clean(req.user?.full_name || req.user?.username || "Employee");
      const requesterEmail = clean(req.user?.email);
      const token = randomUUID();
      const confirmationToken = randomUUID();
      const acknowledgementToken = randomUUID();
      const result = await query(`
        INSERT INTO maintenance_requests
          (request_no, site, category, priority, description, requester_user_id, requester_name, requester_email, status, completion_token, confirmation_token, acknowledgement_token)
        VALUES
          ('MR-' || LPAD(nextval('maintenance_requests_id_seq')::text, 5, '0'), $1,$2,$3,$4,$5,$6,$7,'New',$8,$9,$10)
        RETURNING *
      `, [clean(site), clean(category) || "General Maintenance", clean(priority) || "Medium", clean(description), req.user?.id || null, requesterName, requesterEmail, token, confirmationToken, acknowledgementToken]);
      const row = result.rows[0];
      const email = await notifyNewRequest(row).catch(e => ({sent:false, reason:e.message}));
      res.status(201).json({ success:true, request:row, email });
    } catch (e) {
      console.error("Building maintenance request:", e);
      res.status(400).json({success:false,error:e.message});
    }
  });

  app.get("/api/maintenance-requests/executors", async (req,res) => {
    try {
      await ensureSchema();
      const r=await query(`SELECT id, full_name, username, email FROM users WHERE COALESCE(is_active,1)=1 ORDER BY full_name, username`);
      res.json({success:true,employees:r.rows,contractors:CONTRACTORS});
    } catch(e){res.status(500).json({success:false,error:e.message});}
  });

  app.get("/api/maintenance-requests", async (req,res) => {
    try {
      await ensureSchema();
      const r = await query(`SELECT * FROM maintenance_requests ORDER BY created_at DESC, id DESC`);
      res.json({success:true, requests:r.rows, contractors:CONTRACTORS});
    } catch(e) { res.status(500).json({success:false,error:e.message}); }
  });

  app.get("/api/maintenance-requests/:id", async (req,res) => {
    try { await ensureSchema(); const row=await getRequest(req.params.id); if(!row)return res.status(404).json({success:false,error:"Request not found"}); res.json({success:true,request:row}); }
    catch(e){res.status(500).json({success:false,error:e.message});}
  });

  app.post("/api/maintenance-requests/:id/assign", async (req,res) => {
    try {
      await ensureSchema();
      const row = await getRequest(req.params.id);
      if (!row) return res.status(404).json({success:false,error:"Request not found"});
      const executorType = clean(req.body?.executorType);
      const executorName = clean(req.body?.executorName);
      const executorEmail = clean(req.body?.executorEmail);
      if (!["Contractor","Our Employee"].includes(executorType)) return res.status(400).json({success:false,error:"Select Contractor or Our Employee"});
      if (!executorName) return res.status(400).json({success:false,error:"Executor name is required"});
      if (executorType === "Contractor" && !executorEmail) return res.status(400).json({success:false,error:"Contractor email is required"});
      const isContractor = executorType === "Contractor";
      const acknowledgementToken = row.acknowledgement_token || randomUUID();
      const completionToken = row.completion_token || randomUUID();
      await query(`UPDATE maintenance_requests SET acknowledgement_token=$1, completion_token=$2 WHERE id=$3`, [acknowledgementToken, completionToken, row.id]);
      const order = await createWorkOrder({
        site: row.site, category: row.category, priority: row.priority, description: row.description,
        assignedTo: executorName, isContractor, contractorName: isContractor ? executorName : "",
        performedBy: executorName, status: "In Progress", finalCost: 0,
        reportedDate: row.created_at
      });
      await query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS maintenance_request_id BIGINT`);
      await query(`UPDATE work_orders SET maintenance_request_id=$1, operational_status='In Progress' WHERE id=$2`, [row.id, order.id]);
      const updated = await query(`
        UPDATE maintenance_requests
        SET status='In Progress', work_order_id=$1, executor_type=$2, executor_name=$3, executor_email=$4, contractor_notified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id=$5 RETURNING *
      `, [order.id, executorType, executorName, executorEmail || null, row.id]);
      const updatedRow=updated.rows[0];
      // Assignment creates the WO only. The Maintenance Manager sends the contractor email manually via Outlook.
      // This keeps the approved workflow: Manager -> Contractor -> Acknowledge -> Work Completed -> Campus YES/NO -> Manager closes financially.
      const email = {sent:false, manual:true, reason:"Ready to send manually via Outlook."};
      res.json({success:true,request:updatedRow,workOrder:order,email});
    } catch(e){res.status(400).json({success:false,error:e.message});}
  });

  app.post("/api/maintenance-requests/:id/resend-email", async (req,res) => {
    try {
      await ensureSchema();
      const row = await getRequest(req.params.id);
      if (!row) return res.status(404).json({success:false,error:"Request not found"});
      if (!row.work_order_id || !row.executor_email || !row.executor_name) {
        return res.status(400).json({success:false,error:"This request has no assigned executor/email."});
      }
      let email;
      try {
        email = await notifyAssignment(row);
        const updated = await query(`UPDATE maintenance_requests
          SET email_status='Sent', email_sent_at=CURRENT_TIMESTAMP, email_error=NULL, updated_at=CURRENT_TIMESTAMP
          WHERE id=$1 RETURNING *`, [row.id]);
        return res.json({success:true,request:updated.rows[0],email});
      } catch (e) {
        const updated = await query(`UPDATE maintenance_requests
          SET email_status='Failed', email_error=$1, updated_at=CURRENT_TIMESTAMP
          WHERE id=$2 RETURNING *`, [e.message, row.id]);
        return res.status(502).json({success:false,request:updated.rows[0],email:{sent:false,reason:e.message},error:e.message});
      }
    } catch(e) {
      res.status(400).json({success:false,error:e.message});
    }
  });

  app.post("/api/maintenance-requests/:id/work-completed", async (req,res) => {
    try {
      await ensureSchema();
      const token=clean(req.body?.token);
      const row=await getRequest(req.params.id);
      if(!row || !token || token!==row.completion_token) return res.status(403).json({success:false,error:"Invalid completion link"});
      if(!row.work_order_id) return res.status(400).json({success:false,error:"Work Order is not assigned"});
      await updateWorkOrder(row.work_order_id,{status:"Awaiting Confirmation",completedDate:new Date()});
      const updated=await query(`UPDATE maintenance_requests SET status='Awaiting Confirmation', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[row.id]);
      const updatedRow=updated.rows[0];
      const email=await notifyRequesterReady(updatedRow).catch(e=>({sent:false,reason:e.message}));
      res.json({success:true,request:updatedRow,email});
    } catch(e){res.status(400).json({success:false,error:e.message});}
  });

  app.post("/api/maintenance-requests/:id/confirm", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequest(req.params.id);
      const token=clean(req.body?.token);
      const answer=clean(req.body?.answer).toLowerCase();
      if(!row || !token || token!==row.confirmation_token) return res.status(403).json({success:false,error:"Invalid confirmation link"});
      if(!["yes","no"].includes(answer)) return res.status(400).json({success:false,error:"Answer must be yes or no"});
      const status=answer==="yes" ? "Operationally Completed" : "Reopened";
      await query(`UPDATE maintenance_requests SET status=$1, requester_confirmed_at=CURRENT_TIMESTAMP, requester_confirmation=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[status,answer,row.id]);
      if(row.work_order_id){
        await updateWorkOrder(row.work_order_id,{status: answer==="yes" ? "Operationally Completed" : "In Progress"});
        await query(`UPDATE work_orders SET operational_status=$1 WHERE id=$2`,[answer==="yes" ? "Completed" : "In Progress",row.work_order_id]);
      }
      if(answer==="no") await sendEmail({to:[OWNER_EMAIL],cc:CC_EMAILS,subject:`BUILDING MAINTENANCE — ${row.request_no} NOT FIXED`,html:`<h2>❌ Maintenance needs more work</h2><p><b>${row.request_no}</b> was not confirmed by the requester.</p><p>${row.description}</p>`}).catch(()=>{});
      res.json({success:true,status});
    } catch(e){res.status(400).json({success:false,error:e.message});}
  });

  app.get("/api/maintenance-requests/public/:token", async (req,res) => {
    try {
      await ensureSchema();
      const r=await query(`SELECT request_no,site,description,status,requester_name FROM maintenance_requests WHERE completion_token=$1 OR confirmation_token=$1`,[clean(req.params.token)]);
      if(!r.rows[0]) return res.status(404).json({success:false,error:"Link expired or invalid"});
      res.json({success:true,request:r.rows[0]});
    } catch(e){res.status(500).json({success:false,error:e.message});}
  });

  app.get("/api/maintenance-requests/public/:token/acknowledge", async (req,res) => {
    try {
      await ensureSchema();
      const row=await query(`SELECT * FROM maintenance_requests WHERE acknowledgement_token=$1`,[clean(req.params.token)]);
      if(!row.rows[0]) return res.status(403).send("<h2>Invalid acknowledgement link</h2>");
      const r=row.rows[0];
      await query(`UPDATE maintenance_requests SET acknowledged_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[r.id]);
      res.send("<html><body style='font-family:Arial;padding:40px'><h2>📩 Assignment Acknowledged</h2><p>Thank you. Fleet / Building Maintenance has been notified that you received the work assignment.</p></body></html>");
    } catch(e){res.status(500).send("<h2>Error processing acknowledgement</h2>");}
  });

  app.get("/api/maintenance-requests/public/:token/work-completed", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequestByToken(req.params.token);
      if(!row || row.completion_token !== clean(req.params.token)) return res.status(403).send("<h2>Invalid completion link</h2>");
      if(!row.work_order_id) return res.status(400).send("<h2>Work Order is not assigned yet.</h2>");
      await updateWorkOrder(row.work_order_id,{status:"Awaiting Confirmation",completedDate:new Date()});
      const updated=await query(`UPDATE maintenance_requests SET status='Awaiting Confirmation', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[row.id]);
      await notifyRequesterReady(updated.rows[0]).catch(()=>{});
      res.send("<html><body style='font-family:Arial;padding:40px'><h2>✅ Work Completed</h2><p>The requester has been asked to confirm that everything is OK.</p></body></html>");
    } catch(e){res.status(500).send("<h2>Error processing completion</h2>");}
  });

  app.get("/api/maintenance-requests/public/:token/confirm", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequestByToken(req.params.token);
      const answer=clean(req.query.answer).toLowerCase();
      if(!row || row.confirmation_token !== clean(req.params.token)) return res.status(403).send("<h2>Invalid confirmation link</h2>");
      if(!["yes","no"].includes(answer)) return res.status(400).send("<h2>Invalid answer</h2>");
      const status=answer==="yes" ? "Operationally Completed" : "Reopened";
      await query(`UPDATE maintenance_requests SET status=$1, requester_confirmed_at=CURRENT_TIMESTAMP, requester_confirmation=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[status,answer,row.id]);
      if(row.work_order_id){
        await updateWorkOrder(row.work_order_id,{status: answer==="yes" ? "Operationally Completed" : "In Progress"});
        await query(`UPDATE work_orders SET operational_status=$1 WHERE id=$2`,[answer==="yes" ? "Completed" : "In Progress",row.work_order_id]);
      }
      if(answer==="no") await sendEmail({to:[OWNER_EMAIL],cc:CC_EMAILS,subject:`BUILDING MAINTENANCE — ${row.request_no} NOT FIXED`,html:`<h2>❌ Maintenance needs more work</h2><p><b>${row.request_no}</b> was not confirmed by the requester.</p><p>${row.description}</p>`}).catch(()=>{});
      res.send(answer==="yes"
        ? "<html><body style='font-family:Arial;padding:40px'><h2>✅ Thank you</h2><p>The request is confirmed as fixed. Final cost remains open for Fleet / Building Maintenance.</p></body></html>"
        : "<html><body style='font-family:Arial;padding:40px'><h2>❌ Not fixed</h2><p>Fleet / Building Maintenance has been notified to continue the work.</p></body></html>");
    } catch(e){res.status(500).send("<h2>Error processing confirmation</h2>");}
  });
}
