import { toWhatsAppRecipient } from "./phone.js";

const DEFAULT_GRAPH_VERSION = "v23.0";

function getConfig() {
  return {
    enabled: process.env.WHATSAPP_ENABLED === "true",
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || "fleet_daily_km_reminder",
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US",
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION
  };
}

// The Cloud API needs E.164 digits with no plus. Driver numbers are hand-entered, so
// resolve them through the shared normaliser rather than trusting the stored string.
function normalizePhone(phone) {
  return toWhatsAppRecipient(phone);
}

export function isWhatsAppEnabled() {
  const config = getConfig();
  return config.enabled && Boolean(config.token) && Boolean(config.phoneNumberId);
}

export async function sendWhatsAppTemplate({ phone, templateName, language, bodyParameters = [] }) {
  const config = getConfig();

  if (!config.enabled) {
    return {
      sent: false,
      provider: "whatsapp-disabled",
      response: "WHATSAPP_ENABLED is not true"
    };
  }

  if (!config.token || !config.phoneNumberId) {
    return {
      sent: false,
      provider: "whatsapp-not-configured",
      response: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured"
    };
  }

  const recipient = normalizePhone(phone);
  if (!recipient) {
    return {
      sent: false,
      provider: "whatsapp-invalid-recipient",
      response: `Recipient phone number is not a valid mobile number: ${phone || "(empty)"}`
    };
  }

  const template = templateName || config.templateName;
  const locale = language || config.language;
  const parameters = bodyParameters.map((value) => ({
    type: "text",
    text: String(value ?? "")
  }));

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: template,
      language: { code: locale },
      components: parameters.length
        ? [{ type: "body", parameters }]
        : undefined
    }
  };

  const response = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp HTTP ${response.status}: ${text.slice(0, 1000)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  return {
    sent: true,
    provider: "whatsapp-cloud-api",
    messageId: parsed?.messages?.[0]?.id || null,
    response: JSON.stringify(parsed).slice(0, 2000)
  };
}

// Daily KM reminder. The template body parameters match the approved
// `fleet_daily_km_reminder` template: driver name, plate, odometer.
export async function sendDailyKmReminderWhatsApp({ driverName, phone, plate, currentKm }) {
  return sendWhatsAppTemplate({
    phone,
    bodyParameters: [
      driverName || "Driver",
      plate || "your vehicle",
      Number(currentKm || 0).toLocaleString("en-US")
    ]
  });
}
