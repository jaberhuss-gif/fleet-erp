// Phone normalisation for driver reminders and wa.me links.
//
// Driver numbers are entered by hand in the sheet and in the ERP, so they arrive in
// several shapes: "0509145107", "509145107" (leading zero dropped by the spreadsheet),
// "+966 50 914 5107", "00966-50-914-5107". WhatsApp and wa.me both need one canonical
// form, otherwise a valid driver silently receives nothing.

// Saudi Arabia. Every driver in this fleet is a Saudi mobile number.
export const DEFAULT_COUNTRY_CODE = "966";
const LOCAL_MOBILE_LENGTH = 10; // 05XXXXXXXX

// Strip everything that is not a digit and resolve to the local 10-digit form
// (05XXXXXXXX). Returns null when the input cannot be a Saudi mobile number.
export function normalizeSaudiPhone(value) {
  let digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;

  // 00966XXXXXXXXX / 966XXXXXXXXX -> drop the country code.
  if (digits.startsWith("00966")) digits = digits.slice(5);
  else if (digits.startsWith("966")) digits = digits.slice(3);

  // A bare 9-digit number lost its leading zero (the common spreadsheet case).
  if (digits.length === 9 && digits.startsWith("5")) digits = "0" + digits;

  if (digits.length !== LOCAL_MOBILE_LENGTH || !digits.startsWith("05")) return null;

  return digits;
}

// E.164 without the plus, which is what the WhatsApp Cloud API expects in `to`.
export function toWhatsAppRecipient(value) {
  const local = normalizeSaudiPhone(value);
  if (!local) return null;
  return DEFAULT_COUNTRY_CODE + local.slice(1);
}

// The format wa.me links need: E.164 digits with no plus sign.
export function toWaMeNumber(value) {
  return toWhatsAppRecipient(value);
}

// The canonical stored form for the database, so the same person is one record.
export function toStoredPhone(value) {
  return normalizeSaudiPhone(value) || String(value ?? "").trim();
}

// Generic WhatsApp recipient normalisation. Preserves an explicit international
// country code; only assumes Saudi Arabia when a plain Saudi local mobile is supplied.
export function toWaMeInternational(value) {
  let raw = String(value ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (raw.startsWith("00") && digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("966") && digits.length >= 12) return digits;
  if (digits.length === 10 && digits.startsWith("05")) return "966" + digits.slice(1);
  if (digits.length === 9 && digits.startsWith("5")) return "966" + digits;
  return digits;
}
