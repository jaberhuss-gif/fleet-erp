CREATE TABLE IF NOT EXISTS fleet_erp_v2.vehicle_alerts (
 id BIGSERIAL PRIMARY KEY,
 vehicle_id BIGINT NOT NULL REFERENCES fleet_erp_v2.vehicles(id) ON DELETE CASCADE,
 alert_type TEXT NOT NULL,
 severity TEXT NOT NULL CHECK (severity IN ('Critical','High','Medium','Low')),
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 alert_date DATE NOT NULL DEFAULT CURRENT_DATE,
 responsible_role TEXT,
 status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Acknowledged','Closed')),
 due_date DATE,
 closed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(vehicle_id, alert_type, alert_date)
);
CREATE INDEX IF NOT EXISTS idx_v2_vehicle_alerts_vehicle_status ON fleet_erp_v2.vehicle_alerts(vehicle_id,status);
CREATE INDEX IF NOT EXISTS idx_v2_vehicle_alerts_open ON fleet_erp_v2.vehicle_alerts(status,severity);
CREATE INDEX IF NOT EXISTS idx_v2_vehicle_alerts_date ON fleet_erp_v2.vehicle_alerts(alert_date);
