      if (String(req.user?.role || "").trim().toLowerCase() !== "driver") {
        return res.status(403).json({ success: false, error: "Driver only" });
      }

      // Vehicle Master is the single source of truth for driver assignment.
      // Resolve the logged-in Driver account to the Driver Master record, then
      // return only vehicles linked through vehicles.driver_id / drivers.vehicle_id.
      const userResult = await query(
        `SELECT id, username, full_name, phone
         FROM users
         WHERE id = $1 AND role = 'Driver'
         LIMIT 1`,
        [req.user?.id]
      );
      const user = userResult.rows[0] || req.user || {};
      const names = [user.full_name, user.username]
        .filter(Boolean)
        .map(v => String(v).trim().toLowerCase())
        .filter(Boolean);
      const phones = [user.phone]
        .filter(Boolean)
        .map(v => String(v).replace(/\D/g, ""))
        .filter(Boolean);

      const r = await query(
        `SELECT DISTINCT
            v.id, v.plate, v.plate_number, v.plate_code, v.driver, v.location
         FROM vehicles v
         INNER JOIN drivers d ON d.id = v.driver_id
         WHERE LOWER(TRIM(COALESCE(v.plate, ''))) <> 'test 123'
           AND (
             LOWER(TRIM(COALESCE(d.name, ''))) = ANY($1::text[])
             OR LOWER(TRIM(COALESCE(v.driver, ''))) = ANY($1::text[])
             OR REGEXP_REPLACE(COALESCE(d.phone, ''), '[^0-9]', '', 'g') = ANY($2::text[])
             OR REGEXP_REPLACE(COALESCE(v.driver, ''), '[^0-9]', '', 'g') = ANY($2::text[])
           )
         ORDER BY v.plate_number, v.plate_code, v.id`,
        [names, phones]
      );

      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");