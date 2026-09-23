// Independent schedulers.
//
// Daily KM and Periodic Maintenance scheduling must never depend on the Google
// Sheet synchronization. Each service below runs on its own timer and its own
// overlap guard, so a Sheet outage or a disabled Sheet sync cannot stop Daily
// KM compliance or maintenance checks.
//
// Google Sheet synchronization remains available but is fully optional; set
// GOOGLE_SHEET_SYNC_DISABLED=true to disable only the Sheet import.

import { reconcileAndNotify, checkMaintenanceDue } from "./kmDailyNotifications.js";

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

const KM_INTERVAL_MS = Math.max(
  Number(process.env.KM_DAILY_RECONCILE_INTERVAL_MS || 5 * 60 * 1000),
  60 * 1000
);
const MAINTENANCE_INTERVAL_MS = Math.max(
  Number(process.env.MAINTENANCE_CHECK_INTERVAL_MS || 30 * 60 * 1000),
  60 * 1000
);
const SHEET_INTERVAL_MS = Math.max(
  Number(process.env.GOOGLE_SHEET_SYNC_INTERVAL_MS || 5 * 60 * 1000),
  60 * 1000
);

const state = {
  started: false,
  kmTimer: null,
  kmCutoffTimer: null,
  maintenanceTimer: null,
  sheetTimer: null,
  sheetEnabled: process.env.GOOGLE_SHEET_SYNC_DISABLED !== "true"
};

function millisUntilNextRiyadhHour(hour) {
  const now = Date.now();
  const riyadhNow = new Date(now + RIYADH_OFFSET_MS);

  const targetUtcLike = Date.UTC(
    riyadhNow.getUTCFullYear(),
    riyadhNow.getUTCMonth(),
    riyadhNow.getUTCDate(),
    hour, 0, 0, 0
  );

  let delay = targetUtcLike - riyadhNow.getTime();
  if (delay <= 0) {
    const tomorrow = new Date(targetUtcLike);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    delay = tomorrow.getTime() - riyadhNow.getTime();
  }

  return Math.max(1000, delay);
}

function guard(name, inProgressRef, fn) {
  return async () => {
    if (inProgressRef.value) {
      console.log(`[Scheduler:${name}] Previous run still in progress; skipping.`);
      return;
    }
    inProgressRef.value = true;
    try {
      const result = await fn();
      console.log(`[Scheduler:${name}]`, JSON.stringify(result));
    } catch (error) {
      console.error(`[Scheduler:${name}]`, error.message);
    } finally {
      inProgressRef.value = false;
    }
  };
}

// --- Daily KM -------------------------------------------------------------

async function runDailyKmReconcile() {
  const result = await reconcileAndNotify();
  // Retire legacy submission rows from the Sheet flow on the same pass.
  const { closeStaleDailyKmTickets } = await import("./dailyKm.js");
  const extra = await closeStaleDailyKmTickets(
    result.today,
    ["Daily Vehicle Submission"]
  );
  return { ...result, legacyStaleClosed: extra };
}

export function startDailyKmScheduler() {
  if (state.kmTimer) return;

  const inProgress = { value: false };
  const tick = guard("DailyKM", inProgress, runDailyKmReconcile);

  tick();
  state.kmTimer = setInterval(tick, KM_INTERVAL_MS);

  // Explicit 07:00 Riyadh run so the cutoff transition is immediate.
  const scheduleCutoff = () => {
    state.kmCutoffTimer = setTimeout(async () => {
      await tick();
      scheduleCutoff();
    }, millisUntilNextRiyadhHour(7));
  };
  scheduleCutoff();

  console.log(
    `[Scheduler:DailyKM] enabled (${Math.round(KM_INTERVAL_MS / 60000)} min interval; 07:00 Riyadh cutoff)`
  );
  return tick;
}

// --- Periodic Maintenance -------------------------------------------------

export function startMaintenanceScheduler() {
  if (state.maintenanceTimer) return;

  const inProgress = { value: false };
  const tick = guard("Maintenance", inProgress, checkMaintenanceDue);

  tick();
  state.maintenanceTimer = setInterval(tick, MAINTENANCE_INTERVAL_MS);

  console.log(
    `[Scheduler:Maintenance] enabled (${Math.round(MAINTENANCE_INTERVAL_MS / 60000)} min interval)`
  );
  return tick;
}

// --- Google Sheet sync (optional) ----------------------------------------

export function startSheetSyncScheduler() {
  if (!state.sheetEnabled) {
    console.log("[Scheduler:SheetSync] disabled (GOOGLE_SHEET_SYNC_DISABLED=true)");
    return null;
  }
  if (state.sheetTimer) return state.sheetTimer;

  const inProgress = { value: false };
  const tick = guard("SheetSync", inProgress, async () => {
    const { runGoogleSheetSyncOnce } = await import("./googleSheetSync.js");
    return runGoogleSheetSyncOnce();
  });

  tick();
  state.sheetTimer = setInterval(tick, SHEET_INTERVAL_MS);

  console.log(
    `[Scheduler:SheetSync] enabled (${Math.round(SHEET_INTERVAL_MS / 60000)} min interval)`
  );
  return tick;
}

// --- Bootstrap ------------------------------------------------------------

export function startSchedulers() {
  if (state.started) return state;
  state.started = true;

  startDailyKmScheduler();
  startMaintenanceScheduler();
  startSheetSyncScheduler();

  return state;
}

// Backwards-compatible entry point used by the previous startup path. Daily KM
// and maintenance now run independently of the Sheet sync.
export function startGoogleSheetVehicleSync() {
  return startSchedulers();
}

export function stopSchedulers() {
  for (const key of ["kmTimer", "kmCutoffTimer", "maintenanceTimer", "sheetTimer"]) {
    if (state[key]) {
      clearInterval(state[key]);
      clearTimeout(state[key]);
      state[key] = null;
    }
  }
  state.started = false;
}

export const schedulerState = state;
