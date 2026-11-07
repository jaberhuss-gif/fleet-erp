// Temporary verification for kmSource.resolveLatestKm. Deleted after the run.
import { resolveLatestKm, toDayKey, KM_STATUS } from "./kmSource.js";

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`FAIL: ${name}\n   expected ${e}\n   actual   ${a}`);
  }
}

// --- toDayKey -------------------------------------------------------------
check("daykey: date only", toDayKey("2026-09-24"), "2026-09-24");
check("daykey: timestamp", toDayKey("2026-09-24T14:05:27.121Z"), "2026-09-24");
check("daykey: pg timestamp", toDayKey("2026-09-24 14:05:27.12154+00"), "2026-09-24");
check("daykey: empty", toDayKey(""), null);
check("daykey: null", toDayKey(null), null);
check("daykey: Date", toDayKey(new Date("2026-09-24T03:00:00Z")), "2026-09-24");

// --- both sides agree -----------------------------------------------------
check("agree: same date same km",
  resolveLatestKm({ erp: { km: 130371, date: "2026-09-24" }, sheet: { km: 130371, date: "2026-09-24" } }),
  { km: 130371, source: "ERP + Sheet", status: KM_STATUS.SUBMITTED, variance: 0, authoritative: 130371 });

// --- sheet newer wins (user's real 2 drivers) -----------------------------
check("sheet newer: 1560 EHR",
  resolveLatestKm({ erp: { km: 130371, date: "2026-09-22" }, sheet: { km: 130343, date: "2026-09-24" } }),
  { km: 130343, source: "Sheet", status: KM_STATUS.MISMATCH, variance: -28, authoritative: 130343 });

check("erp newer: 4479 JUA",
  resolveLatestKm({ erp: { km: 192368, date: "2026-09-24" }, sheet: { km: 289260, date: "2026-09-23" } }),
  { km: 192368, source: "ERP", status: KM_STATUS.MISMATCH, variance: 96892, authoritative: 192368 });

// --- same day disagreement: never auto-resolved ---------------------------
check("same day disagree: no authority",
  resolveLatestKm({ erp: { km: 286411, date: "2026-09-24" }, sheet: { km: 286419, date: "2026-09-24" } }),
  { km: null, source: null, status: KM_STATUS.MISMATCH, variance: 8, authoritative: null });

// --- one side only --------------------------------------------------------
check("erp only",
  resolveLatestKm({ erp: { km: 5000, date: "2026-09-24" } }),
  { km: 5000, source: "ERP", status: KM_STATUS.ERP_ONLY, variance: null, authoritative: 5000 });

check("sheet only",
  resolveLatestKm({ sheet: { km: 6000, date: "2026-09-24" } }),
  { km: 6000, source: "Sheet", status: KM_STATUS.SHEET_ONLY, variance: null, authoritative: 6000 });

check("neither",
  resolveLatestKm({}),
  { km: null, source: null, status: KM_STATUS.MISSING, variance: null, authoritative: null });

// --- the 3,058,876 anomaly: sheet is newer, so it must win ---------------
check("2349 EUA corrupted odometer corrected by newer sheet",
  resolveLatestKm({ erp: { km: 3058876, date: "2026-09-22" }, sheet: { km: 309079, date: "2026-09-24" } }),
  { km: 309079, source: "Sheet", status: KM_STATUS.MISMATCH, variance: -2749797, authoritative: 309079 });

// --- undated side never outranks a dated one ------------------------------
check("undated erp vs dated sheet keeps stored value",
  resolveLatestKm({ erp: { km: 100, date: null }, sheet: { km: 200, date: "2026-09-24" } }),
  { km: null, source: null, status: KM_STATUS.MISMATCH, variance: 100, authoritative: null });

console.log(`\nPASS: ${pass} FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);