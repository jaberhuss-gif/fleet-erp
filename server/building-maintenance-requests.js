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
      city TEXT,
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
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS city TEXT`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS executor_whatsapp TEXT`);
  await query(`ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  // Hide only the four explicitly identified demonstration tickets from this intake register.
  // Their linked work orders and all other modules/data remain untouched.
  await query(`UPDATE maintenance_requests SET archived_at=CURRENT_TIMESTAMP WHERE request_no IN ('MR-00008','MR-00006','MR-00004','MR-00002','MR-00010','MR-00012','MR-00014') AND archived_at IS NULL`);
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

async function sendEmail() {
  // Company email is sent manually by the owner from Outlook. Never send via AgentMail.
  return { sent: false, reason: "Automatic email sending is disabled. Open the company email draft and send it manually." };
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
  app.get("/api/maintenance-requests/config/contacts", async (req,res) => {
    try {
      await ensureSchema();
      await query(`
        CREATE TABLE IF NOT EXISTS maintenance_workflow_contacts (
          id BIGSERIAL PRIMARY KEY,
          contact_role TEXT NOT NULL,
          full_name TEXT NOT NULL,
          city TEXT,
          site TEXT,
          work_type TEXT,
          email TEXT,
          phone TEXT,
          whatsapp TEXT,
          notes TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const r=await query("SELECT * FROM maintenance_workflow_contacts ORDER BY active DESC, contact_role, full_name");
      res.json({success:true,contacts:r.rows});
    } catch(e){res.status(500).json({success:false,error:e.message});}
  });

  app.post("/api/maintenance-requests/config/contacts", async (req,res) => {
    try {
      await ensureSchema();
      await query(`
        CREATE TABLE IF NOT EXISTS maintenance_workflow_contacts (
          id BIGSERIAL PRIMARY KEY,
          contact_role TEXT NOT NULL,
          full_name TEXT NOT NULL,
          city TEXT,
          site TEXT,
          work_type TEXT,
          email TEXT,
          phone TEXT,
          whatsapp TEXT,
          notes TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const d=req.body||{};
      const role=clean(d.contact_role), name=clean(d.full_name);
      if(!role||!name) return res.status(400).json({success:false,error:"Role and full name are required / المسمى والاسم مطلوبان"});
      const values=[role,name,clean(d.city),clean(d.site),clean(d.work_type),clean(d.email),clean(d.phone),clean(d.whatsapp),clean(d.notes),d.active!==false];
      let r;
      if(d.id) {
        r=await query(`UPDATE maintenance_workflow_contacts SET contact_role=$1,full_name=$2,city=$3,site=$4,work_type=$5,email=$6,phone=$7,whatsapp=$8,notes=$9,active=$10,updated_at=CURRENT_TIMESTAMP WHERE id=$11 RETURNING *`,[...values,d.id]);
      } else {
        r=await query(`INSERT INTO maintenance_workflow_contacts(contact_role,full_name,city,site,work_type,email,phone,whatsapp,notes,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,values);
      }
      res.status(d.id?200:201).json({success:true,contact:r.rows[0]});
    } catch(e){res.status(400).json({success:false,error:e.message});}
  });

  app.delete("/api/maintenance-requests/config/contacts/:id", async (req,res) => {
    try {
      await ensureSchema();
      await query("DELETE FROM maintenance_workflow_contacts WHERE id=$1",[req.params.id]);
      res.json({success:true});
    } catch(e){res.status(400).json({success:false,error:e.message});}
  });

  app.post("/api/maintenance-requests", async (req, res) => {
    try {
      await ensureSchema();
      const { site, city, category, description, priority } = req.body || {};
      if (!clean(description)) return res.status(400).json({ success:false, error:"Maintenance description is required" });
      const requesterName = clean(req.user?.full_name || req.user?.username || "Employee");
      const requesterEmail = clean(req.user?.email);
      const token = randomUUID();
      const confirmationToken = randomUUID();
      const acknowledgementToken = randomUUID();
      const result = await query(`
        INSERT INTO maintenance_requests
          (request_no, site, city, category, priority, description, requester_user_id, requester_name, requester_email, status, completion_token, confirmation_token, acknowledgement_token)
        VALUES
          ('MR-' || LPAD(nextval('maintenance_requests_id_seq')::text, 5, '0'), $1,$2,$3,$4,$5,$6,$7,$8,'New',$9,$10,$11)
        RETURNING *
      `, [clean(site), clean(city), clean(category) || "General Maintenance", clean(priority) || "Medium", clean(description), req.user?.id || null, requesterName, requesterEmail, token, confirmationToken, acknowledgementToken]);
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
      const r = await query(`SELECT * FROM maintenance_requests WHERE archived_at IS NULL ORDER BY created_at DESC, id DESC`);
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

  app.put("/api/maintenance-requests/:id", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequest(req.params.id);
      if(!row) return res.status(404).json({success:false,error:"Request not found"});
      if(row.archived_at) return res.status(409).json({success:false,error:"Archived requests cannot be edited."});
      const site=clean(req.body?.site), city=clean(req.body?.city), category=clean(req.body?.category)||"General Maintenance";
      const priority=clean(req.body?.priority)||"Medium", description=clean(req.body?.description);
      if(!site || !description) return res.status(400).json({success:false,error:"Site and description are required."});
      const before={site:row.site,city:row.city,category:row.category,priority:row.priority,description:row.description};
      const updated=await query(`UPDATE maintenance_requests SET site=$1,city=$2,category=$3,priority=$4,description=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$6 RETURNING *`,[site,city,category,priority,description,row.id]);
      if(row.work_order_id) {
        await query(`UPDATE work_orders SET site=$1,category=$2,priority=$3,description=$4 WHERE id=$5`,[site,category,priority,description,row.work_order_id]);
      }
      const actor=clean(req.user?.full_name||req.user?.username||"Fleet / Building Maintenance");
      await auditEvent(row.id,"REQUEST_EDITED", "Fleet / Building Maintenance", actor, {before,after:{site,city,category,priority,description},status_at_edit:row.status,work_order_id:row.work_order_id});
      res.json({success:true,request:updated.rows[0]});
    } catch(e) { res.status(400).json({success:false,error:e.message}); }
  });

  app.post("/api/maintenance-requests/:id/archive", async (req,res) => {
    try {
      await ensureSchema();
      const row = await getRequest(req.params.id);
      if (!row || row.archived_at) return res.status(404).json({success:false,error:"Request not found or already removed."});
      if (row.status !== "New" || row.work_order_id || row.closed_at) {
        return res.status(409).json({success:false,error:"Only new, unassigned maintenance requests can be removed. / يمكن شطب الطلبات الجديدة غير المعينة فقط."});
      }
      const actor = clean(req.user?.full_name || req.user?.username || "Fleet / Building Maintenance");
      const updated = await query(
        `UPDATE maintenance_requests SET archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND archived_at IS NULL RETURNING id, request_no`,
        [row.id]
      );
      if (!updated.rows[0]) return res.status(404).json({success:false,error:"Request not found or already removed."});
      await auditEvent(row.id, "REQUEST_ARCHIVED", "Fleet / Building Maintenance", actor, {request_no: row.request_no, reason:"Removed from maintenance register by user"});
      res.json({success:true,request_no:row.request_no,message:"Request removed from the register. Audit history is retained."});
    } catch(e) {
      res.status(400).json({success:false,error:e.message});
    }
  });

  app.post("/api/maintenance-requests/:id/assign", async (req,res) => {
    try {
      await ensureSchema();
      const row = await getRequest(req.params.id);
      if (!row) return res.status(404).json({success:false,error:"Request not found"});
      if (row.status !== "New" || row.closed_at) return res.status(409).json({success:false,error:"This request cannot be reassigned after the workflow has started or after financial closure."});
      const executorType = clean(req.body?.executorType);
      const executorName = clean(req.body?.executorName);
      let executorEmail = clean(req.body?.executorEmail);
      const executorWhatsapp = clean(req.body?.executorWhatsapp);
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
        SET status='Assigned', work_order_id=$1, executor_type=$2, executor_name=$3, executor_email=$4, executor_whatsapp=$5, contractor_notified_at=NULL, acknowledged_at=NULL, completed_at=NULL, requester_confirmed_at=NULL, requester_confirmation=NULL, final_amount=NULL, closed_at=NULL, closed_by=NULL, closing_notes=NULL, email_status='Draft Ready', email_sent_at=NULL, email_error=NULL, updated_at=CURRENT_TIMESTAMP
        WHERE id=$6 RETURNING *
      `, [order.id, executorType, executorName, executorEmail || null, executorWhatsapp || null, row.id]);
      const updatedRow=updated.rows[0];
      await auditEvent(row.id, "ASSIGNED", executorType, executorName, {work_order_id: order.id, executor_email: executorEmail || null});

      // No third-party mail sending: the UI opens a company Outlook draft for manual review/send.
      await auditEvent(row.id, "ASSIGNMENT_EMAIL_DRAFT_READY", "Fleet / Building Maintenance", clean(req.user?.full_name || req.user?.username || "Fleet / Building Maintenance"), {to: executorEmail || null});
      res.json({success:true,request:updatedRow,workOrder:order,email:{sent:false,draftReady:true,reason:"Company email draft must be reviewed and sent manually."}});
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
      let executorEmail = clean(row.executor_email);
      if (!executorEmail && row.executor_type === "Our Employee" && row.executor_name) {
        executorEmail = await resolveEmployeeEmail(row.executor_name);
        if (executorEmail) {
          await query(`UPDATE maintenance_requests SET executor_email=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [executorEmail, row.id]);
          row.executor_email = executorEmail;
        }
      }
      if (!executorEmail && !maintenanceTestMode()) {
        return res.status(400).json({success:false,error:"Assigned employee has no email address in the ERP users table."});
      }
      const updated = await query(`UPDATE maintenance_requests SET email_status='Draft Ready', email_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [row.id]);
      await auditEvent(row.id, "ASSIGNMENT_EMAIL_DRAFT_REOPENED", "Fleet / Building Maintenance", clean(req.user?.full_name || req.user?.username || "Fleet / Building Maintenance"), {to: row.executor_email || null});
      return res.json({success:true,request:updated.rows[0],email:{sent:false,draftReady:true,reason:"Open the company Outlook draft and send manually."}});
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
            if (row.status === "Closed" || row.closed_at) return res.status(409).json({success:false,error:"This work order is financially closed and cannot be modified again."});
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
      if (row.status !== "Assigned" || row.completed_at || row.closed_at) return res.status(409).send("<h2>This assignment is no longer awaiting acknowledgement.</h2>");
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
      if (row.status !== "Assigned" || row.completed_at || row.closed_at) return res.status(409).send("<h2>This assignment is no longer awaiting acknowledgement.</h2>");
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
      if(!["Assigned","Acknowledged"].includes(row.status)) return res.status(409).send("<h2>This request is not available for completion.</h2>");
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
      if(!["Assigned","Acknowledged"].includes(row.status)) return res.status(409).send("<h2>This request is not available for completion.</h2>");
      if(row.completed_at || row.status==="Awaiting Confirmation" || row.status==="Operationally Completed") {
        return res.send("<html><body style='font-family:Arial;padding:40px'><h2>✅ Work Already Reported Completed</h2><p>This work has already been reported as completed.</p></body></html>");
      }
      await updateWorkOrder(row.work_order_id,{status:"Awaiting Confirmation",completedDate:new Date()});
      const updated=await query(`UPDATE maintenance_requests SET status='Awaiting Confirmation', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[row.id]);
      await auditEvent(row.id, "WORK_COMPLETED", row.executor_type || "Contractor", row.executor_name, {work_order_id: row.work_order_id});
      // Campus notification is prepared manually by Fleet; no automatic email/WhatsApp is sent here.
      res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>✅ Work Completed</h2><p><b>Request:</b> ${row.request_no}</p><p>The requester has been asked to confirm that everything is OK.</p><p>تم تسجيل إكمال العمل وإرسال طلب التأكيد إلى مقدم الطلب.</p></body></html>`);
    } catch(e){res.status(500).send("<h2>Error processing completion</h2>");}
  });

  app.get("/api/maintenance-requests/public/:token/confirm", async (req,res) => {
    try {
      await ensureSchema();
      const row=await getRequestByToken(req.params.token);
      if(!row || row.confirmation_token !== clean(req.params.token)) return res.status(403).send("<h2>Invalid confirmation link</h2>");
      if (row.status !== "Awaiting Confirmation" || !row.completed_at) return res.status(409).send("<h2>This request is not awaiting final confirmation.</h2>");
      res.set("Cache-Control","no-store, no-cache, must-revalidate, private");
      if(row.requester_confirmation) {
        return res.send(`<html><body style="font-family:Arial;padding:40px;max-width:720px;margin:auto"><h2>Maintenance Confirmation Already Recorded</h2><p><b>Request:</b> ${row.request_no}</p><p><b>Answer:</b> ${row.requester_confirmation==="yes" ? "YES — Everything is OK" : "NO — Problem Not Fixed"}</p></body></html>`);
      }
      res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campus Maintenance Confirmation</title></head><body style="font-family:Arial,sans-serif;background:#f3f6fa;padding:24px;color:#1f2937"><main style="max-width:680px;margin:auto;background:#fff;padding:28px;border-radius:14px;box-shadow:0 4px 18px #0001"><h2 style="color:#17365d">🏢 Campus Manager — Maintenance Confirmation / تأكيد الكامبوس</h2><p><b>Request / رقم الطلب:</b> ${row.request_no}</p><p><b>Site / الموقع:</b> ${String(row.site||"-").replace(/</g,"&lt;")}</p><p><b>Problem / المشكلة:</b><br>${String(row.description||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</p><hr><p>Please confirm the result of the repair. / يرجى تأكيد نتيجة الصيانة.</p><div style="display:flex;gap:12px;flex-wrap:wrap"><button id="yes" style="padding:13px 18px;background:#15803d;color:#fff;border:0;border-radius:8px;font-weight:700">✅ YES — Fixed / نعم، تم الإصلاح</button><button id="no" style="padding:13px 18px;background:#b91c1c;color:#fff;border:0;border-radius:8px;font-weight:700">❌ NO — Still faulty / لا، المشكلة مستمرة</button></div><p id="result" role="status" style="margin-top:18px"></p><script>
(function(){
 const token=${JSON.stringify(clean(req.params.token))};
 const yes=document.getElementById('yes'), no=document.getElementById('no'), result=document.getElementById('result');
 function submit(answer){
   yes.disabled=true; no.disabled=true; result.textContent='Submitting… / جارٍ الحفظ…';
   // Submit as a normal browser POST so the confirmation page navigates to the
   // server's final receipt page instead of remaining on the original form.
   const form=document.createElement('form');
   form.method='POST';
   form.action='/api/maintenance-requests/public/'+encodeURIComponent(token)+'/confirm?answer='+answer;
   const input=document.createElement('input');
   input.type='hidden'; input.name='answer'; input.value=answer;
   form.appendChild(input); document.body.appendChild(form); form.submit();
 }
 yes.addEventListener('click',()=>submit('yes')); no.addEventListener('click',()=>submit('no'));
})();
</script></main></body></html>`);
    } catch(e){res.status(500).send("<h2>Error loading confirmation page</h2>");}
  });

  app.post("/api/maintenance-requests/public/:token/confirm", async (req,res) => {
    try {
      await ensureSchema();
      // The unguessable, per-request confirmation token authorizes this one-time campus response.
      const row=await getRequestByToken(req.params.token);
      const answer=clean(req.body?.answer || req.query?.answer).toLowerCase();
      if(!row || row.confirmation_token !== clean(req.params.token)) return res.status(403).send("<h2>Invalid confirmation link</h2>");
      if (row.status !== "Awaiting Confirmation" || !row.completed_at) return res.status(409).send("<h2>This request is not awaiting final confirmation.</h2>");
      if(!["yes","no"].includes(answer)) return res.status(400).send("<h2>Invalid answer</h2>");
      if(row.requester_confirmation) return res.status(409).json({success:false,error:"Campus confirmation has already been recorded."});
      const status=answer==="yes" ? "Operationally Completed" : "Reopened";
      await query(`UPDATE maintenance_requests SET status=$1, requester_confirmed_at=CURRENT_TIMESTAMP, requester_confirmation=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[status,answer,row.id]);
      if(row.work_order_id){
        await updateWorkOrder(row.work_order_id,{status: answer==="yes" ? "Operationally Completed" : "In Progress"});
        await query(`UPDATE work_orders SET operational_status=$1 WHERE id=$2`,[answer==="yes" ? "Completed" : "In Progress",row.work_order_id]);
      }
      await auditEvent(row.id, answer==="yes" ? "CAMPUS_CONFIRMED" : "CAMPUS_REJECTED", "Campus link", "Campus Manager", {answer});
      res.send(answer==="yes"
        ? "<html><body style='font-family:Arial;padding:40px;max-width:720px;margin:auto'><h2>✅ Confirmation Submitted</h2><p>تم تأكيد أن أعمال الصيانة تمت بنجاح.</p><p>You can close this window.</p><p>يمكنك إغلاق هذه الصفحة الآن.</p></body></html>"
        : "<html><body style='font-family:Arial;padding:40px;max-width:720px;margin:auto'><h2>❌ Not Fixed</h2><p>تم إبلاغ إدارة الصيانة بضرورة متابعة العمل.</p><p>You can close this window.</p><p>يمكنك إغلاق هذه الصفحة الآن.</p></body></html>");
    } catch(e){res.status(500).send("<h2>Error processing confirmation</h2>");}
  });
}
