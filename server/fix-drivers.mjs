import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'fleet.db'));

// Remove UNIQUE constraint from phone (recreate table)
console.log('Checking current schema...');
const cols = db.prepare("PRAGMA table_info(drivers)").all();
console.log('Current columns:', cols.map(c => c.name).join(', '));

// Save existing drivers
const existing = db.prepare('SELECT * FROM drivers').all();
console.log('Existing drivers:', existing.length);

// Drop and recreate without UNIQUE on phone
db.exec('DROP TABLE IF EXISTS drivers');
db.exec(`
  CREATE TABLE drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    license_no TEXT,
    license_expiry DATE,
    nationality TEXT,
    vehicle_id INTEGER,
    status TEXT DEFAULT 'Active',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
  );
`);

// Re-insert existing drivers
for (const d of existing) {
  db.prepare(`
    INSERT INTO drivers (name, phone, license_no, license_expiry, nationality, vehicle_id, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(d.name, d.phone, d.license_no, d.license_expiry, d.nationality, d.vehicle_id, d.status, d.notes);
}
console.log('Re-inserted:', existing.length);

// Now add the 2 missing drivers
const missing = [
  { plate: '5456 TKA', name: 'Mathab Akhtar', phone: '0509145107' },
  { plate: '4541 LUA', name: 'Nafees Naseem', phone: '0536389031' }
];

for (const d of missing) {
  const vehicle = db.prepare(`
    SELECT id FROM vehicles 
    WHERE plate_number || ' ' || plate_code = ?
  `).get(d.plate);

  if (vehicle) {
    db.prepare(`
      INSERT INTO drivers (name, phone, vehicle_id, status, nationality)
      VALUES (?, ?, ?, 'Active', '')
    `).run(d.name, d.phone, vehicle.id);

    db.prepare('UPDATE vehicles SET driver = ?, phone = ? WHERE id = ?')
      .run(d.name, d.phone, vehicle.id);

    console.log(`✅ Added: ${d.plate} — ${d.name}`);
  } else {
    console.log(`❌ Not found: ${d.plate}`);
  }
}

const total = db.prepare('SELECT COUNT(*) as c FROM drivers').get().c;
console.log('');
console.log('========================================');
console.log('Total drivers now: ' + total);
console.log('========================================');

db.close();
