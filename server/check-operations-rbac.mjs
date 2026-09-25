// Asserts that every endpoint the Operations page calls is gated by one of the
// four Operations modules, and that no Operations route is left ungated.
import { getPermissionForRequest } from "./rbac.js";

const ALLOWED = new Set(["building", "projects", "warehouse", "purchase_requests"]);

// Every request the Operations page issues, with the method it uses.
const routes = [
  ["GET", "/api/sites"],
  ["GET", "/api/work-orders"],
  ["POST", "/api/work-orders"],
  ["PUT", "/api/work-orders/1"],
  ["DELETE", "/api/work-orders/1"],
  ["GET", "/api/projects"],
  ["POST", "/api/projects"],
  ["PUT", "/api/projects/1"],
  ["DELETE", "/api/projects/1"],
  ["GET", "/api/purchases"],
  ["POST", "/api/purchases"],
  ["DELETE", "/api/purchases/1"],
  ["GET", "/api/purchase-requests"],
  ["POST", "/api/purchase-requests"],
  ["PUT", "/api/purchase-requests/1"],
  ["GET", "/api/inventory"],
  ["GET", "/api/inventory/low-stock"],
  ["POST", "/api/inventory"],
  ["PUT", "/api/inventory/1"],
  ["DELETE", "/api/inventory/1"],
  ["POST", "/api/inventory/stock-in"],
  ["POST", "/api/inventory/stock-out"],
  ["POST", "/api/inventory/transfer"],
  ["GET", "/api/stock-transactions"],
  ["DELETE", "/api/stock-transactions/1"]
];

let pass = 0;
let fail = 0;

for (const [method, url] of routes) {
  const perm = getPermissionForRequest({ originalUrl: url, path: url, method });
  if (!perm) {
    console.log(`  FAIL  ${method.padEnd(6)} ${url.padEnd(34)} -> ungated (no module)`);
    fail++;
    continue;
  }
  // A route counts as covered when its module is an Operations module or, for
  // shared reference reads, when an Operations module is accepted as an
  // alternative (the site list is consumed by all four Operations modules).
  const accepted = [perm.module, ...(perm.altModules || [])].filter(m => ALLOWED.has(m));
  const ok = accepted.length > 0;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${method.padEnd(6)} ${url.padEnd(34)} -> ${perm.module} / ${perm.action}${accepted.length > 1 || (accepted[0] !== perm.module) ? ` (alt: ${accepted.join(",")})` : ""}`);
  ok ? pass++ : fail++;
}

console.log(`\nOperations RBAC mapping: PASS ${pass} / FAIL ${fail}`);

// A route outside Operations must not resolve to an Operations module, so the
// new tab cannot widen anyone's access.
const outside = [
  ["GET", "/api/vehicles"],
  ["GET", "/api/users"],
  ["GET", "/api/backup"]
];
let guardOk = true;
for (const [method, url] of outside) {
  const perm = getPermissionForRequest({ originalUrl: url, path: url, method });
  const leaked = perm && ALLOWED.has(perm.module);
  if (leaked) {
    console.log(`  FAIL  ${method} ${url} leaked into ${perm.module}`);
    guardOk = false;
  }
}
console.log(guardOk ? "  PASS  non-Operations routes do not map to Operations modules" : "  FAIL  leak detected");

process.exit(fail === 0 && guardOk ? 0 : 1);
