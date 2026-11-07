// Temporary verification for phone normalisation. Deleted after the run.
import { normalizeSaudiPhone, toWhatsAppRecipient, toStoredPhone } from "./phone.js";

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (String(actual) === String(expected)) pass += 1;
  else { fail += 1; console.log(`FAIL ${name}: expected ${expected}, got ${actual}`); }
}

// The real values from the production export.
check("production bare 9-digit (Umer Hassan)", normalizeSaudiPhone("581960526"), "0581960526");
check("production bare 9-digit (Fahad)", normalizeSaudiPhone("558701125"), "0558701125");
check("production bare 9-digit (Jibu)", normalizeSaudiPhone("537991162"), "0537991162");
check("already correct (Mehtab)", normalizeSaudiPhone("0509145107"), "0509145107");

// Other shapes that appear in hand-entered data.
check("spaced", normalizeSaudiPhone("050 914 5107"), "0509145107");
check("dashed", normalizeSaudiPhone("050-914-5107"), "0509145107");
check("plus country code", normalizeSaudiPhone("+966 50 914 5107"), "0509145107");
check("00 country code", normalizeSaudiPhone("00966509145107"), "0509145107");
check("966 prefix no plus", normalizeSaudiPhone("966509145107"), "0509145107");
check("parentheses", normalizeSaudiPhone("(050) 914-5107"), "0509145107");

// Rejections: a landline or junk must not be turned into a mobile.
check("landline rejected", normalizeSaudiPhone("0112345678"), null);
check("empty rejected", normalizeSaudiPhone(""), null);
check("null rejected", normalizeSaudiPhone(null), null);
check("too short rejected", normalizeSaudiPhone("12345"), null);

// WhatsApp recipient form (E.164 digits, no plus).
check("wa recipient bare", toWhatsAppRecipient("581960526"), "966581960526");
check("wa recipient correct", toWhatsAppRecipient("0509145107"), "966509145107");

// Canonical stored form.
check("stored form bare", toStoredPhone("581960526"), "0581960526");
check("stored form keeps unknown", toStoredPhone("not-a-phone"), "not-a-phone");

console.log(`\nPASS: ${pass} FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);