// Single source of truth for reconciling the ERP odometer with the field sheet.
//
// The two systems both accept daily odometer readings, so the same vehicle/day can
// arrive twice. The rule is "latest dated reading wins": whichever side carries the
// newer observation date is authoritative. When both sides share a date but disagree,
// neither value is applied and the row is surfaced as a mismatch for review instead of
// being overwritten by an arbitrary winner.

export const KM_STATUS = {
  SUBMITTED: "Submitted",
  MISMATCH: "KM Mismatch",
  ERP_ONLY: "ERP Only",
  SHEET_ONLY: "Sheet Only",
  MISSING: "Missing",
  EXEMPT: "Exempt"
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// Normalise any accepted date representation to a comparable day key (YYYY-MM-DD).
// Timestamps and Date objects collapse to their calendar day so a 09:00 ERP entry and
// a same-day sheet row count as the same observation date.
export function toDayKey(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

// Compare two observed readings for one vehicle and decide what the odometer should be.
//
// erp   : { km, date }  reading entered into the ERP (driver portal / Reading button)
// sheet : { km, date }  reading arriving from the Google Sheet
//
// Returns { km, source, status, variance, authoritative } where `authoritative` is the
// value safe to persist to vehicles.current_km (null when the sides disagree on a shared
// date, because in that case the existing value must be left untouched).
export function resolveLatestKm({ erp = null, sheet = null } = {}) {
  const erpKm = erp ? toNumber(erp.km) : null;
  const sheetKm = sheet ? toNumber(sheet.km) : null;
  const erpDay = erp ? toDayKey(erp.date) : null;
  const sheetDay = sheet ? toDayKey(sheet.date) : null;

  const hasErp = erpKm !== null;
  const hasSheet = sheetKm !== null;

  if (!hasErp && !hasSheet) {
    return { km: null, source: null, status: KM_STATUS.MISSING, variance: null, authoritative: null };
  }
  if (hasErp && !hasSheet) {
    return { km: erpKm, source: "ERP", status: KM_STATUS.ERP_ONLY, variance: null, authoritative: erpKm };
  }
  if (!hasErp && hasSheet) {
    return { km: sheetKm, source: "Sheet", status: KM_STATUS.SHEET_ONLY, variance: null, authoritative: sheetKm };
  }

  if (erpKm === sheetKm) {
    return { km: sheetKm, source: "ERP + Sheet", status: KM_STATUS.SUBMITTED, variance: 0, authoritative: sheetKm };
  }

  // Disagreement. The newer observation date decides; a tie is never auto-resolved.
  const erpIsNewer = erpDay && sheetDay ? erpDay > sheetDay : false;
  const sheetIsNewer = erpDay && sheetDay ? sheetDay > erpDay : false;

  if (sheetIsNewer) {
    return { km: sheetKm, source: "Sheet", status: KM_STATUS.MISMATCH, variance: sheetKm - erpKm, authoritative: sheetKm };
  }
  if (erpIsNewer) {
    return { km: erpKm, source: "ERP", status: KM_STATUS.MISMATCH, variance: sheetKm - erpKm, authoritative: erpKm };
  }

  // Same day (or an undated side that cannot outrank a dated one): keep what is already
  // stored and raise the difference for a human. Never silently pick a winner here.
  return { km: null, source: null, status: KM_STATUS.MISMATCH, variance: sheetKm - erpKm, authoritative: null };
}
