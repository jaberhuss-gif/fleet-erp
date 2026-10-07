import { randomUUID } from "crypto";
import { query } from "./postgres.js";
import { createWorkOrder, updateWorkOrder, getWorkOrder, closeWorkOrder } from "./database-pg.js";

const OWNER_EMAIL = "Hussein.Anwar@iemaadex.com";
const maintenanceTestMode = () => String(process.env.MAINTENANCE_EMAIL_TEST_MODE || "").toLowerCase() === "true";
const workflowRecipients = email => maintenanceTestMode() ? [clean(process.env.MAINTENANCE_TEST_EMAIL || OWNER_EMAIL)] : (email ? [email] : []);

async function resolveEmployeeEmail(name) {
  const n = clean(name);
  if (!n) return "";
  const r = await query("SELECT email FROM users WHERE COALESCE(is_active,1)=1 AND (LOWER(TRIM(full_name))=LOWER(TRIM($1)) OR LOWER(TRIM(username))=LOWER(TRIM($1))) AND COALESCE(TRIM(email),'')<>'' LIMIT 1", [n]);
  return clean(r.rows[0]?.email);
}
const CONTRACTORS = [
  { name: "Jodoud Al Khaleej", email: "jodoudalkhaleej.co.sa@gmail.com" },
  { name: "Raghad Alafq", email: "raghadalafq@gmail.com" }
];
const appUrl = () => String(process.env.APP_URL || process.env.PUBLIC_APP_URL || "https://fleet-erp-kn0c.onrender.com").replace(/\/$/, "");

function clean(v) { return String(v ?? "").trim(); }

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS maintenance_request_events (
      id BIGSERIAL PRIMARY KEY,
      request_id BIGINT NOT NULL,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL DEFAULT 'System',
      actor_name TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_mr_events_request ON maintenance_request_events(request_id, created_at)`);
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
      final_amount NUMERIC(14,2),
      closed_at TIMESTAMPTZ,
      closed_by TEXT,
      closing_notes TEXT,
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
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS final_amount NUMERIC(14,2)`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS closed_by TEXT`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS closing_notes TEXT`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS acknowledgement_token TEXT UNIQUE`);
  await query(`CREATE INDEX IF NOT EXISTS idx_maintenance_requests_status ON maintenance_requests(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_maintenance_requests_work_order ON maintenance_requests(work_order_id)`);
  await query(`UPDATE maintenance_requests SET acknowledgement_token=COALESCE(NULLIF(acknowledgement_token,''), gen_random_uuid()::text), completion_token=COALESCE(NULLIF(completion_token,''), gen_random_uuid()::text) WHERE acknowledgement_token IS NULL OR acknowledgement_token='' OR completion_token IS NULL OR completion_token=''`);
}


async function auditEvent(requestId, action, actorType, actorName, details = {}) {
  try {
    await query(
      `INSERT INTO maintenance_request_events
        (request_id, action, actor_type, actor_name, details)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [requestId, action, actorType || "System", actorName || "", JSON.stringify(details || {})]
    );
  } catch (e) {
    console.error("Maintenance audit event:", e.message);
  }
}

async function sendEmail({ to, cc = [], subject, html }) {
  const recipients = (Array.isArray(to) ? to : [to]).map(clean).filter(Boolean);
  const ccRecipients = (Array.isArray(cc) ? cc : [cc]).map(clean).filter(Boolean);
  const apiKey = clean(process.env.AGENTMAIL_API_KEY);
  const inboxId = clean(process.env.AGENTMAIL_INBOX_ID || "hussien-2931@agentmail.to");
  if (!apiKey || !inboxId || !recipients.length) {
    return { sent: false, reason: "AgentMail is not configured (AGENTMAIL_API_KEY / AGENTMAIL_INBOX_ID)." };
  }
  const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: recipients,
      cc: ccRecipients,
      subject,
      html
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email provider error: ${response.status} ${body}`);
  }
  const result = await response.json().catch(() => ({}));
  return { sent: true, provider: "AgentMail", message_id: result.message_id || null, thread_id: result.thread_id || null };
}

function button(url, text, color = "#0f766e") {
  return `<a href="${url}" style="display:inline-block;padding:11px 18px;background:${color};color:#fff;text-decoration:none;border-radius:7px;font-weight:700;margin:4px">${text}</a>`;
}

async function getRequestByToken(token) { const r=await query(`SELECT * FROM maintenance_requests WHERE completion_token=$1 OR confirmation_token=$1`, [token]); return r.rows[0] || null; }

async function getRequest(id) {
  const r = await query(`SELECT * FROM maintenance_requests WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

async function notifyNewRequest(reqRow) {
  return sendEmail({
    to: OWNER_EMAIL,
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
  const recipients = workflowRecipients(reqRow.executor_email);
  if (!recipients.length) return { sent: false, reason: "Assigned executor email is not available." };
  const acknowledgeUrl = `${appUrl()}/api/maintenance-requests/public/${reqRow.acknowledgement_token}/acknowledge`;
  return sendEmail({
    to: recipients,
    subject: `BUILDING MAINTENANCE — ${reqRow.request_no} ASSIGNED`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:24px;color:#1f2937">
        <h2>BUILDING MAINTENANCE WORK ASSIGNMENT</h2>
        <p>Dear ${clean(reqRow.executor_name) || "Executor"},</p>
        <p><b>Request No.:</b> ${reqRow.request_no}</p>
        <p><b>Site:</b> ${reqRow.site || "-"}</p>
        <p><b>Category:</b> ${reqRow.category || "-"}</p>
        <p><b>Priority:</b> ${reqRow.priority || "-"}</p>
        <p><b>Description:</b><br>${clean(reqRow.description).replace(/</g,"&lt;").replace(/\n/g,"<br>")}</p>
        <div style="margin-top:28px;padding:18px;background:#eff6ff;border-radius:10px">
          <h3>STEP 1 — ACKNOWLEDGE RECEIPT</h3>
          <p>Please confirm that you received this work assignment.</p>
          ${button(acknowledgeUrl, "📩 ACKNOWLEDGE RECEIPT", "#2563eb")}
        </div>
        <p style="margin-top:28px">Regards,<br>Fleet / Building Maintenance</p>
      </div>
    `
  });
}

async function notifyCompletionReady(reqRow) {
  const recipients = reqRow.executor_email ? [reqRow.executor_email] : [];
  if (!recipients.length) return { sent: false, reason: "Assigned executor email is not available." };
  const completeUrl = `${appUrl()}/api/maintenance-requests/public/${reqRow.completion_token}/work-completed`;
  return sendEmail({
    to: recipients,
    subject: `BUILDING MAINTENANCE — ${reqRow.request_no} READY TO COMPLETE`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:24px;color:#1f2937">
        <h2>BUILDING MAINTENANCE — WORK IN PROGRESS</h2>
        <p><b>Request No.:</b> ${reqRow.request_no}</p>
        <p><b>Site:</b> ${reqRow.site || "-"}</p>
        <p>Your assignment has been acknowledged. After finishing the work, use the button below.</p>
        <div style="margin-top:28px;padding:18px;background:#f0fdf4;border-radius:10px">
          <h3>STEP 2 — WORK COMPLETED</h3>
          ${button(completeUrl, "✅ WORK COMPLETED", "#15803d")}
        </div>
        <p style="margin-top:28px">Regards,<br>Fleet / Building Maintenance</p>
      </div>
    `
  });
}

async function notifyRequesterReady(reqRow) {
  const recipients = workflowRecipients(reqRow.requester_email);
  if (!recipients.length) return { sent: false, reason: "Requester email is not available." };
  const yes = `${appUrl()}/api/maintenance-requests/public/${reqRow.confirmation_token}/confirm?answer=yes`;
  const no = `${appUrl()}/api/maintenance-requests/public/${reqRow.confirmation_token}/confirm?answer=no`;
  return sendEmail({
    to: recipients,
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
      await auditEvent(row.id, "REQUEST_CREATED", "Requester", requesterName, {site: row.site, category: row.category, priority: row.priority});
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
      // Keep the displayed request status synchronized with the workflow timestamps.
      // A recorded completion must never remain visually stuck at Acknowledged.
      await query(`
        UPDATE maintenance_requests
        SET status='Awaiting Confirmation', updated_at=CURRENT_TIMESTAMP
        WHERE completed_at IS NOT NULL
          AND requester_confirmation IS NULL
          AND status NOT IN ('Awaiting Confirmation','Operationally Completed','Reopened','Open','Closed')
      `);
      const r = await query(`SELECT * FROM maintenance_requests ORDER BY created_at DESC, id DESC`);
      res.json({success:true, requests:r.rows, contractors:CONTRACTORS});
    } catch(e) { res.status(500).json({success:false,error:e.message}); }
  });

  app.get("/api/maintenance-requests/:id/audit", async (req,res) => {
    try {
      await ensureSchema();
      const r = await query(`SELECT * FROM maintenance_request_events WHERE request_id=$1 ORDER BY created_at ASC, id ASC`, [req.params.id]);
      res.json({success:true,events:r.rows});
    } catch(e){res.status(500).json({success:false,error:e.message});}
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
      let executorEmail = clean(req.body?.executorEmail);
      if (executorType === "Our Employee" && executorName && !executorEmail) {
        executorEmail = await resolveEmployeeEmail(executorName);
      }
      if (executorType === "Our Employee" && !executorEmail) {
        return res.status(400).json({success:false,error:"Selected employee has no email address in the ERP users table."});
      }
      if (!["Contractor","Our Employee"].includes(executorType)) return res.status(400).json({success:false,error:"Select Contractor or Our Employee"});
      if (!executorName) return res.status(400).json({success:false,error:"Executor name is required"});
      if (executorType === "Contractor" && !executorEmail) return res.status(400).json({success:false,error:"Contractor email is required"});
      const isContractor = executorType === "Contractor";
      const acknowledgementToken = randomUUID();
      const completionToken = randomUUID();
      const confirmationToken = randomUUID();
      await query(`UPDATE maintenance_requests SET acknowledgement_token=$1, completion_token=$2, confirmation_token=$3 WHERE id=$4`, [acknowledgementToken, completionToken, confirmationToken, row.id]);
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
        SET status='Assigned', work_order_id=$1, executor_type=$2, executor_name=$3, executor_email=$4, contractor_notified_at=CURRENT_TIMESTAMP, acknowledged_at=NULL, completed_at=NULL, requester_confirmed_at=NULL, requester_confirmation=NULL, final_amount=NULL, closed_at=NULL, closed_by=NULL, closing_notes=NULL, email_status='Not Sent', email_sent_at=NULL, email_error=NULL, updated_at=CURRENT_TIMESTAMP
        WHERE id=$5 RETURNING *
      `, [order.id, executorType, executorName, executorEmail || null, row.id]);
      const updatedRow=updated.rows[0];
      await auditEvent(row.id, "ASSIGNED", executorType, executorName, {work_order_id: order.id, executor_email: executorEmail || null});

      // Assignment notification is automatic. In test mode it is routed only to MAINTENANCE_TEST_EMAIL.
      let email = {sent:false, reason:"Email was not attempted."};
      try {
        email = await notifyAssignment(updatedRow);
        if (!email.sent) throw new Error(email.reason || "AgentMail did not send the assignment email.");
        const emailed = await query(`UPDATE maintenance_requests
          SET email_status='Sent', email_sent_at=CURRENT_TIMESTAMP, email_error=NULL, updated_at=CURRENT_TIMESTAMP
          WHERE id=$1 RETURNING *`, [row.id]);
        await auditEvent(row.id, "ASSIGNMENT_EMAIL_SENT", "System", "Fleet ERP", {
          provider: email.provider || null,
          to: (maintenanceTestMode() ? [clean(process.env.MAINTENANCE_TEST_EMAIL || OWNER_EMAIL)] : [executorEmail]),
          message_id: email.message_id || null
        });
        res.json({success:true,request:emailed.rows[0],workOrder:order,email});
        return;
      } catch (e) {
        email = {sent:false, reason:e.message};
        await query(`UPDATE maintenance_requests
          SET email_status='Failed', email_error=$1, updated_at=CURRENT_TIMESTAMP
          WHERE id=$2`, [e.message, row.id]);
        await auditEvent(row.id, "ASSIGNMENT_EMAIL_FAILED", "System", "Fleet ERP", {error:e.message, to:executorEmail || null});
      }
      const failedRow = await getRequest(row.id);
      res.json({success:true,request:failedRow,workOrder:order,email});
    } catch(e){res.status(400).json({success:false,error:e.message});}
  });

  app.post("/api/maintenance-requests/:id/resend-email", async (req,res) => {
    try {
      await ensureSchema();
      const row = await getRequest(req.params.id);
      if (!row) return res.status(404).json({success:false,error:"Request not found"});
      if (row.status !== "Assigned" || row.acknowledged_at) {
        return res.status(400).json({success:false,error:"Assignment email can only be resent while the request is Assigned and awaiting acknowledgement."});
      }
      if (!row.work_order_id || !row.executor_name) {
        return res.status(400).json({success:false,error:"This request has no assigned executor/work order."});
      }
      if (!row.executor_email) {
        return res.status(400).json({success:false,error:"Assigned executor has no email address."});
      }
      let email;
      try {
        email = await notifyAssignment(row);
        if (!email.sent) throw new Error(email.reason || "AgentMail did not send the assignment email.");
        const updated = await query(`UPDATE maintenance_requests
          SET email_status='Sent', email_sent_at=CURRENT_TIMESTAMP, email_error=NULL, updated_at=CURRENT_TIMESTAMP
          WHERE id=$1 RETURNING *`, [row.id]);
        await auditEvent(row.id, "ASSIGNMENT_EMAIL_RESENT", "System", "Fleet ERP", {
          provider: email.provider || null,
          to: maintenanceTestMode() ? [clean(process.env.MAINTENANCE_TEST_EMAIL || OWNER_EMAIL)] : [row.executor_email],
          message_id: email.message_id || null
        });
        return res.json({success:true,request:updated.rows[0],email});
      } catch (e) {
        const updated = await query(`UPDATE maintenance_requests
          SET email_status='Failed', email_error=$1, updated_at=CURRENT_TIMESTAMP
          WHERE id=$2 RETURNING *`, [e.message, row.id]);
        await auditEvent(row.id, "ASSIGNMENT_EMAIL_RESEND_FAILED", "System", "Fleet ERP", {
          error: e.message,
          to: maintenanceTestMode() ? [clean(process.env.MAINTENANCE_TEST_EMAIL || OWNER_EMAIL)] : [row.executor_email]
        });
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
      const answer=clean(req.body?.answer || req.query?.answer).toLowerCase();
      if(!row || !token || token!==row.confirmation_token) return res.status(403).json({success:false,error:"Invalid confirmation link"});
      if(!["yes","no"].includes(answer)) return res.status(400).json({success:false,error:"Answer must be yes or no"});
      const status=answer==="yes" ? "Operationally Completed" : "Reopened";
      await query(`UPDATE maintenance_requests SET status=$1, requester_confirmed_at=CURRENT_TIMESTAMP, requester_confirmation=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[status,answer,row.id]);
      await auditEvent(row.id, answer==="yes" ? "CAMPUS_CONFIRMED" : "CAMPUS_REJECTED", "Campus", row.requester_name, {answer});
      if(row.work_order_id){
        await updateWorkOrder(row.work_order_id,{status: answer==="yes" ? "Operationally Completed" : "In Progress"});
        await query(`UPDATE work_orders SET operational_status=$1 WHERE id=$2`,[answer==="yes" ? "Completed" : "In Progress",row.work_order_id]);
      }
      if(answer==="no") await sendEmail({to:workflowRecipients(OWNER_EMAIL),subject:`BUILDING MAINTENANCE — ${row.request_no} NOT FIXED`,html:`<h2>❌ Maintenance needs more work</h2><p><b>${row.request_no}</b> was not confirmed by the requester.</p><p>${row.description}</p>`}).catch(()=>{});
      if(answer==="yes") await sendEmail({to:workflowRecipients(OWNER_EMAIL),subject:`BUILDING MAINTENANCE — ${row.request_no} CONFIRMED YES`,html:`<h2>✅ Campus Confirmed Maintenance</h2><p><b>${row.request_no}</b> was confirmed YES by the requester.</p><p><b>Site:</b> ${row.site || "-"}</p><p>The request is ready for final Amount and Close/Open control.</p>`}).catch(()=>{});
      res.json({success:true,status});
    } catch(e){res.status(400).json({success:false,error:e.message});}
  });


  app.post("/api/maintenance-requests/:id/financial-close", async (req,res) => {
    try {
      await ensureSchema();
      const row = await getRequest(req.params.id);
      if (!row) return res.status(404).json({success:false,error:"Request not found"});
      const rawAmount = clean(req.body?.amount);
      const amount = rawAmount === "" ? null : Number(rawAmount);
      const action = clean(req.body?.action).toLowerCase();
      const notes = clean(req.body?.notes);
      if (row.requester_confirmation !== "yes" || !["Operationally Completed","Open"].includes(row.status)) return res.status(400).json({success:false,error:"Campus must confirm YES before financial closing."});
      if (!["close","open"].includes(action)) return res.status(400).json({success:false,error:"Action must be close or open"});
      if (action === "close" && amount !== null && (!Number.isFinite(amount) || amount < 0)) return res.status(400).json({success:false,error:"Amount must be empty or a valid non-negative number."});
      if (action === "open") {
        const updated = await query(`UPDATE maintenance_requests SET status='Open', final_amount=$1, closing_notes=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *`,[amount !== null && Number.isFinite(amount) && amount >= 0 ? amount : null,notes,row.id]);
        await auditEvent(row.id, "REOPENED_BY_FLEET", "Fleet / Building Maintenance", clean(req.user?.full_name||req.user?.username||"Fleet / Building Maintenance"), {amount, notes});
        if (row.work_order_id) await updateWorkOrder(row.work_order_id,{status:"Open",closingNotes:notes});
        return res.json({success:true,request:updated.rows[0]});
      }
      const wo = row.work_order_id ? await closeWorkOrder(row.work_order_id,{finalCost:amount,contractorCost:row.executor_type==="Contractor"?amount:0,isContractor:row.executor_type==="Contractor",contractorName:row.executor_type==="Contractor"?row.executor_name:"",performedBy:row.executor_name||"",closingNotes:notes}) : null;
      const closedBy = clean(req.user?.full_name||req.user?.username||"Fleet / Building Maintenance");
      const updated = await query(`UPDATE maintenance_requests SET status='Closed', final_amount=$1, closed_at=CURRENT_TIMESTAMP, closed_by=$2, closing_notes=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,[amount,closedBy,notes,row.id]);
      await auditEvent(row.id, "CLOSED", "Fleet / Building Maintenance", closedBy, {amount, notes});
      res.json({success:true,request:updated.rows[0],workOrder:wo});
    } catch(e) { console.error("Maintenance financial close:",e); res.status(400).json({success:false,error:e.message}); }
  });

  app.get("/api/maintenance-requests/public/workflow/:token", async (req,res) => {
    try {
      await ensureSchema();
      const rowResult = await query(`SELECT * FROM maintenance_requests WHERE acknowledgement_token=$1`, [clean(req.params.token)]);
      const row = rowResult.rows[0];
      if (!row) return res.status(403).send("<h2>Invalid or expired work assignment link</h2>");
      res.set("Cache-Control","no-store, no-cache, must-revalidate, private");
      const esc = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      let actionHtml = "";
      if (!row.acknowledged_at) {
        actionHtml = `
          <h3>STEP 1 — Acknowledge Receipt</h3>
          <p>هل استلمت مهمة الصيانة هذه؟</p>
          <form method="POST" action="/api/maintenance-requests/public/${esc(req.params.token)}/acknowledge">
            <button type="submit" style="padding:14px 22px;background:#2563eb;color:#fff;border:0;border-radius:8px;font-weight:700;font-size:16px">📩 YES — Acknowledge Receipt</button>
          </form>`;
      } else if (!row.completed_at) {
        actionHtml = `
          <h3>STEP 2 — Work Completed</h3>
          <p>بعد إكمال الإصلاح، اضغط YES لتسجيل إكمال العمل.</p>
          <a href="/api/maintenance-requests/public/${esc(row.completion_token)}/work-completed" style="display:inline-block;padding:14px 22px;background:#15803d;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px">🔵 YES — Work Completed</a>`;
      } else {
        actionHtml = `<h3 style="color:#15803d">✅ Work Completed Recorded</h3><p>The requester has been asked to confirm that everything is OK.</p>`;
      }
      res.send(`<html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:30px"><div style="max-width:720px;margin:auto;background:#fff;padding:28px;border-radius:12px;box-shadow:0 2px 10px #ddd"><h2>🛠️ Building Maintenance Work Assignment</h2><p><b>Request:</b> ${esc(row.request_no)}</p><p><b>Site:</b> ${esc(row.site || "-")}</p><p><b>Assigned To:</b> ${esc(row.executor_name || "-")}</p><p><b>Problem:</b><br>${esc(row.description || "").replace(/\\n/g,"<br>")}</p><hr>${actionHtml}</div></body></html>`);
    } catch(e) {
      res.status(500).send("<h2>Error loading work assignment</h2>");
    }
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
      const r=await query(`SELECT * FROM maintenance_requests WHERE acknowledgement_token=$1`,[clean(req.params.token)]);
      if(!r.rows[0]) return res.status(403).send("<h2>Invalid acknowledgement link</h2>");
      const row=r.rows[0];
      res.set("Cache-Control","no-store, no-cache, must-revalidate, private");
      if(row.acknowledged_at) return res.send(`<html><body style="font-family:Arial;padding:40px"><h2>📩 Assignment Already Acknowledged</h2><p><b>Request:</b> ${row.request_no}</p><p>This assignment has already been acknowledged.</p></body></html>`);
      res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>📩 Building Maintenance — Acknowledge Receipt</h2><p><b>Request:</b> ${row.request_no}</p><p><b>Site:</b> ${row.site || "-"}</p><p><b>Assigned To:</b> ${row.executor_name || "-"}</p><p><b>Problem:</b><br>${String(row.description || "").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</p><h3>Have you received this work assignment?</h3><p>هل استلمت مهمة الصيانة هذه؟</p><form method="POST" action="/api/maintenance-requests/public/${clean(req.params.token)}/acknowledge"><button type="submit" style="padding:12px 20px;background:#2563eb;color:#fff;border:0;border-radius:7px;font-weight:700">📩 YES — Acknowledge Receipt</button></form></body></html>`);
    } catch(e){res.status(500).send("<h2>Error loading acknowledgement page</h2>");}
  });

  app.post("/api/maintenance-requests/public/:token/acknowledge", async (req,res) => {
    try {
      await ensureSchema();
      const r=await query(`SELECT * FROM maintenance_requests WHERE acknowledgement_token=$1`,[clean(req.params.token)]);
      if(!r.rows[0]) return res.status(403).send("<h2>Invalid acknowledgement link</h2>");
      const row=r.rows[0];
      if(row.acknowledged_at) return res.send("<html><body style='font-family:Arial;padding:40px'><h2>📩 Assignment Already Acknowledged</h2><p>This assignment has already been acknowledged.</p></body></html>");
      await query(`UPDATE maintenance_requests SET status='Acknowledged', acknowledged_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[row.id]);
      await auditEvent(row.id, "ACKNOWLEDGED", row.executor_type || "Executor", row.executor_name, {executor_email: row.executor_email});
      const completionEmail = await notifyCompletionReady(row).catch(e => ({sent:false, reason:e.message}));
      await auditEvent(row.id, completionEmail.sent ? "COMPLETION_EMAIL_SENT" : "COMPLETION_EMAIL_FAILED", "System", "Fleet ERP", {to: (maintenanceTestMode() ? clean(process.env.MAINTENANCE_TEST_EMAIL || OWNER_EMAIL) : row.executor_email) || null, reason: completionEmail.reason || null});
      res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>✅ Assignment Acknowledged</h2><p><b>Request:</b> ${row.request_no}</p><p>Thank you. Fleet / Building Maintenance has been notified that you received the work assignment.</p><p>تم تأكيد استلام مهمة الصيانة وتحديث النظام تلقائياً.</p></body></html>`);
    } catch(e){res.status(500).send("<h2>Error processing acknowledgement</h2>");}
  });

  app.get("/api/maintenance-requests/public/:token/work-completed", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequestByToken(req.params.token);
      if(!row || row.completion_token !== clean(req.params.token)) return res.status(403).send("<h2>Invalid completion link</h2>");
      res.set("Cache-Control","no-store, no-cache, must-revalidate, private");
      if(!row.work_order_id) return res.status(400).send("<h2>Work Order is not assigned yet.</h2>");
      if(row.completed_at || row.status==="Awaiting Confirmation" || row.status==="Operationally Completed") {
        return res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>✅ Work Already Reported Completed</h2><p><b>Request:</b> ${row.request_no}</p><p>This work has already been reported as completed.</p></body></html>`);
      }
      res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>🔧 Building Maintenance — Work Completed</h2><p><b>Request:</b> ${row.request_no}</p><p><b>Site:</b> ${row.site || "-"}</p><p><b>Assigned To:</b> ${row.executor_name || "-"}</p><p><b>Problem:</b><br>${String(row.description || "").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</p><h3>Have you completed the work?</h3><p>هل أكملت أعمال الصيانة؟</p><form method="POST" action="/api/maintenance-requests/public/${clean(req.params.token)}/work-completed"><button type="submit" style="padding:12px 20px;background:#15803d;color:#fff;border:0;border-radius:7px;font-weight:700">✅ YES — Work Completed</button></form></body></html>`);
    } catch(e){res.status(500).send("<h2>Error loading completion page</h2>");}
  });

  app.post("/api/maintenance-requests/public/:token/work-completed", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequestByToken(req.params.token);
      if(!row || row.completion_token !== clean(req.params.token)) return res.status(403).send("<h2>Invalid completion link</h2>");
      if(!row.work_order_id) return res.status(400).send("<h2>Work Order is not assigned yet.</h2>");
      if(row.completed_at || row.status==="Awaiting Confirmation" || row.status==="Operationally Completed") {
        return res.send("<html><body style='font-family:Arial;padding:40px'><h2>✅ Work Already Reported Completed</h2><p>This work has already been reported as completed.</p></body></html>");
      }
      await updateWorkOrder(row.work_order_id,{status:"Awaiting Confirmation",completedDate:new Date()});
      const updated=await query(`UPDATE maintenance_requests SET status='Awaiting Confirmation', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[row.id]);
      await auditEvent(row.id, "WORK_COMPLETED", row.executor_type || "Contractor", row.executor_name, {work_order_id: row.work_order_id});
      await notifyRequesterReady(updated.rows[0]).catch(()=>{});
      res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>✅ Work Completed</h2><p><b>Request:</b> ${row.request_no}</p><p>The requester has been asked to confirm that everything is OK.</p><p>تم تسجيل إكمال العمل وإرسال طلب التأكيد إلى مقدم الطلب.</p></body></html>`);
    } catch(e){res.status(500).send("<h2>Error processing completion</h2>");}
  });

  app.get("/api/maintenance-requests/public/:token/confirm", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequestByToken(req.params.token);
      if(!row || row.confirmation_token !== clean(req.params.token)) return res.status(403).send("<h2>Invalid confirmation link</h2>");
      res.set("Cache-Control","no-store, no-cache, must-revalidate, private");
      if(row.requester_confirmation) {
        return res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>Maintenance Confirmation Already Recorded</h2><p><b>Request:</b> ${row.request_no}</p><p><b>Answer:</b> ${row.requester_confirmation==="yes" ? "YES — Everything is OK" : "NO — Problem Not Fixed"}</p></body></html>`);
      }
      res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>🛠️ Building Maintenance — Final Confirmation</h2><p><b>Request:</b> ${row.request_no}</p><p><b>Site:</b> ${row.site || "-"}</p><p><b>Problem:</b><br>${String(row.description || "").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</p><h3>Is the maintenance work satisfactory?</h3><p>هل تم إصلاح المشكلة بشكل كامل؟</p><div style="display:flex;gap:12px;flex-wrap:wrap"><form method="POST" action="/api/maintenance-requests/public/${clean(req.params.token)}/confirm?answer=yes"><input type="hidden" name="answer" value="yes"><button type="submit" style="padding:12px 20px;background:#15803d;color:#fff;border:0;border-radius:7px;font-weight:700">✅ YES — Everything is OK</button></form><form method="POST" action="/api/maintenance-requests/public/${clean(req.params.token)}/confirm?answer=no"><input type="hidden" name="answer" value="no"><button type="submit" style="padding:12px 20px;background:#b91c1c;color:#fff;border:0;border-radius:7px;font-weight:700">❌ NO — Problem Not Fixed</button></form></div></body></html>`);
    } catch(e){res.status(500).send("<h2>Error loading confirmation page</h2>");}
  });

  app.post("/api/maintenance-requests/public/:token/confirm", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequestByToken(req.params.token);
      const answer=clean(req.body?.answer || req.query?.answer).toLowerCase();
      if(!row || row.confirmation_token !== clean(req.params.token)) return res.status(403).send("<h2>Invalid confirmation link</h2>");
      if(!["yes","no"].includes(answer)) return res.status(400).send("<h2>Invalid answer</h2>");
      if(row.requester_confirmation) return res.send("<html><body style='font-family:Arial;padding:40px'><h2>Maintenance Confirmation Already Recorded</h2></body></html>");
      const status=answer==="yes" ? "Operationally Completed" : "Reopened";
      await query(`UPDATE maintenance_requests SET status=$1, requester_confirmed_at=CURRENT_TIMESTAMP, requester_confirmation=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[status,answer,row.id]);
      if(row.work_order_id){
        await updateWorkOrder(row.work_order_id,{status: answer==="yes" ? "Operationally Completed" : "In Progress"});
        await query(`UPDATE work_orders SET operational_status=$1 WHERE id=$2`,[answer==="yes" ? "Completed" : "In Progress",row.work_order_id]);
      }
      if(answer==="no") await sendEmail({to:[OWNER_EMAIL],subject:`BUILDING MAINTENANCE — ${row.request_no} NOT FIXED`,html:`<h2>❌ Maintenance needs more work</h2><p><b>${row.request_no}</b> was not confirmed by the requester.</p><p>${row.description}</p>`}).catch(()=>{});
      res.send(answer==="yes"
        ? "<html><body style='font-family:Arial;padding:40px;max-width:720px;margin:auto'><h2>✅ Confirmation Submitted</h2><p>تم تأكيد أن أعمال الصيانة تمت بنجاح.</p><p>You can close this window.</p><p>يمكنك إغلاق هذه الصفحة الآن.</p></body></html>"
        : "<html><body style='font-family:Arial;padding:40px;max-width:720px;margin:auto'><h2>❌ Not Fixed</h2><p>تم إبلاغ إدارة الصيانة بضرورة متابعة العمل.</p><p>You can close this window.</p><p>يمكنك إغلاق هذه الصفحة الآن.</p></body></html>");
    } catch(e){res.status(500).send("<h2>Error processing confirmation</h2>");}
  });
}
