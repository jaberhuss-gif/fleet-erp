});

app.put("/api/tickets/:id/close-with-notes", async (req, res) => {
  try { res.json({ success: true, ticket: closeTicketWithNotes(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/tickets/by-reporter/:name", async (req, res) => {
  try { res.json({ success: true, tickets: listTicketsByReporter(req.params.name) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/tickets/stats/:name", async (req, res) => {
  try { res.json({ success: true, ...getReporterStats(req.params.name) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== FINANCIAL REPORT =====
app.get("/api/reports/financial", async (req, res) => {
  try { res.json({ success: true, ...await getFinancialReportPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

if (process.env.ERP_V2_ENABLED === "true") {
  try { await mountV2(app); } catch (e) { console.error("[ERP V2] startup failed:", e.message); }
}

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', async (req, res) => { res.sendFile(path.join(__dirname, '../client/dist/index.html')); });

app.listen(PORT, () => {
  console.log("");
  console.log("======================================");
  console.log("FLEET ERP SERVER");
  console.log("======================================");
  console.log("http://localhost:" + PORT);
  console.log("Vehicle APIs: /api/vehicles, /api/tickets, /api/dashboard");
  console.log("Building APIs: /api/sites, /api/work-orders, /api/projects, /api/purchases");
  console.log("======================================");
});



