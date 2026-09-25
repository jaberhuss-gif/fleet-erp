// Verifies the WhatsApp path builds the right recipient and payload without contacting
// Meta. A stub server stands in for graph.facebook.com. Temporary; deleted after the run.
import http from "http";

process.env.WHATSAPP_ENABLED = "true";
process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
process.env.WHATSAPP_TEMPLATE_NAME = "fleet_daily_km_reminder";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en_US";

let captured = null;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    captured = { url: req.url, auth: req.headers.authorization, payload: JSON.parse(body) };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messages: [{ id: "wamid.TEST123" }] }));
  });
});

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (String(actual) === String(expected)) pass += 1;
  else { fail += 1; console.log(`FAIL ${name}: expected ${expected}, got ${actual}`); }
}

async function main() {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  // Redirect the Graph call to the local stub.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) =>
    realFetch(String(url).replace("https://graph.facebook.com", `http://127.0.0.1:${port}`), opts);

  const { sendDailyKmReminderWhatsApp, sendWhatsAppTemplate, isWhatsAppEnabled } =
    await import("./whatsapp.js");

  check("enabled when fully configured", isWhatsAppEnabled(), true);

  // A driver number stored WITHOUT the leading zero must still resolve.
  const res = await sendDailyKmReminderWhatsApp({
    driverName: "Umer Hassan",
    phone: "581960526",
    plate: "1709 BUA",
    currentKm: 289177
  });

  check("send reported success", res.sent, true);
  check("message id captured", res.messageId, "wamid.TEST123");
  check("recipient normalised to E.164", captured.payload.to, "966581960526");
  check("template name", captured.payload.template.name, "fleet_daily_km_reminder");
  check("language", captured.payload.template.language.code, "en_US");
  check("bearer token", captured.auth, "Bearer test-token");

  const params = captured.payload.template.components[0].parameters;
  check("param count", params.length, 3);
  check("param driver name", params[0].text, "Umer Hassan");
  check("param plate", params[1].text, "1709 BUA");
  check("param odometer formatted", params[2].text, "289,177");

  // A driver number with the leading zero must resolve to the same recipient.
  await sendDailyKmReminderWhatsApp({
    driverName: "Mehtab", phone: "0509145107", plate: "1560 EHR", currentKm: 130571
  });
  check("leading-zero number resolves identically", captured.payload.to, "966509145107");

  // A junk number must not be sent.
  const bad = await sendWhatsAppTemplate({ phone: "nonsense", bodyParameters: ["a"] });
  check("invalid recipient rejected", bad.sent, false);
  check("invalid recipient provider", bad.provider, "whatsapp-invalid-recipient");

  // Disabled configuration must short-circuit.
  process.env.WHATSAPP_ENABLED = "false";
  const off = await sendDailyKmReminderWhatsApp({ driverName: "X", phone: "0509145107", plate: "P", currentKm: 1 });
  check("disabled short-circuits", off.sent, false);
  check("disabled provider", off.provider, "whatsapp-disabled");
  check("isWhatsAppEnabled false", isWhatsAppEnabled(), false);

  console.log(`\nPASS: ${pass} FAIL: ${fail}`);
  server.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("ERROR", e.message); process.exit(1); });