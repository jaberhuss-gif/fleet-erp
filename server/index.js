import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.use(cors());
app.use(express.json());

// ??? ???????? ????????? ????? ????? ??? 5000 ??
app.get("/api/gm/dashboard", async (req, res) => {
  try {
    const { rows: vehicles } = await pool.query(`
      SELECT v.*,
             COALESCE(oh.oil_change_km, v.last_oil_km) AS last_oil_km,
             COALESCE(oh.oil_change_date, v.last_oil_change_date) AS last_oil_change_date
      FROM vehicles v
      LEFT JOIN LATERAL (
        SELECT oil_change_km, oil_change_date
        FROM oil_changes
        WHERE vehicle_id = v.id
          AND COALESCE(notes,'') NOT ILIKE '%Google Sheet%'
        ORDER BY oil_change_date DESC NULLS LAST, id DESC
        LIMIT 1
      ) oh ON true
      ORDER BY v.id ASC
    `);

    let urgentCount = 0;
    let warningCount = 0;
    let safeCount = 0;

    const processedVehicles = vehicles.map(v => {
      const current = Number(v.current_km || 0);
      const last = Number(v.last_oil_km || 0);
      const diff = current - last;

      let status = "Safe";
      if (diff >= 5000 || last === 0) {
        status = "Urgent Overdue";
        urgentCount++;
      } else if (diff >= 4500) {
        status = "Warning";
        warningCount++;
      } else {
        safeCount++;
      }

      return {
        ...v,
        km_since_oil: diff,
        status: status
      };
    });

    res.json({
      success: true,
      fleetStats: {
        total: vehicles.length,
        safe: safeCount,
        warning: warningCount,
        urgentOverdue: urgentCount,
        vehicles: processedVehicles
      },
      workOrdersSummary: { total: 0, open: 0, closed: 0 },
      financialAnalytics: {
        totalSavingsSAR: 154000,
        savingsPercentage: 18
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`?? Fleet ERP Server running on port ${PORT}`);
});
