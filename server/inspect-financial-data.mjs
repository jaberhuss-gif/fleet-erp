import { query } from "./postgres.js";

const checks = [
  ["WO contractor flags", `
    SELECT is_contractor, COUNT(*) AS count
    FROM work_orders
    GROUP BY is_contractor
    ORDER BY is_contractor
  `],
  ["WO months", `
    SELECT month, year, COUNT(*) AS count
    FROM work_orders
    GROUP BY month, year
    ORDER BY year, month
  `],
  ["Project contractors", `
    SELECT
      CASE
        WHEN contractor IS NULL OR TRIM(contractor) = '' THEN 'NO CONTRACTOR'
        ELSE contractor
      END AS contractor_group,
      COUNT(*) AS count,
      COALESCE(SUM(spent),0) AS spent
    FROM projects
    GROUP BY
      CASE
        WHEN contractor IS NULL OR TRIM(contractor) = '' THEN 'NO CONTRACTOR'
        ELSE contractor
      END
    ORDER BY count DESC
  `],
  ["Project months/sites", `
    SELECT month, year, site, COUNT(*) AS project_count, COALESCE(SUM(spent),0) AS spent
    FROM projects
    GROUP BY month, year, site
    ORDER BY year, month, site
  `],
  ["Purchase buyers", `
    SELECT purchased_by, COUNT(*) AS count, COALESCE(SUM(total_cost),0) AS total_cost
    FROM purchases
    GROUP BY purchased_by
    ORDER BY purchased_by
  `],
  ["Purchase months", `
    SELECT month, year, purchased_by, COUNT(*) AS count, COALESCE(SUM(total_cost),0) AS total_cost
    FROM purchases
    GROUP BY month, year, purchased_by
    ORDER BY year, month, purchased_by
  `]
];

for (const [title, sql] of checks) {
  const r = await query(sql);
  console.log("\n===== " + title + " =====");
  console.table(r.rows);
}
