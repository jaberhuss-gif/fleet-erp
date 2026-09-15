import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'fleet.db'));

// Real driver data - matches plate to driver
const driversData = [
  { plate: '1709 BUA', name: 'Umer Hassan', phone: '581960526' },
  { plate: '1706 BUA', name: 'Fahad', phone: '0558701125' },
  { plate: '2349 EUA', name: 'Jibu Mutumba', phone: '0537991162' },
  { plate: '6183 ZUA', name: 'Asad Ullah', phone: '0534399041' },
  { plate: '4463 JUA', name: 'Abdul Ghuffar', phone: '0552719412' },
  { plate: '1722 BUA', name: 'Muhammad Siddique', phone: '0539147838' },
  { plate: '2158 EUA', name: 'Riaz Ahmad', phone: '0534810761' },
  { plate: '1543 BUA', name: 'Mathab Akhtar', phone: '0509145107' },
  { plate: '1738 BUA', name: 'Naveed Jamal', phone: '0553715514' },
  { plate: '4431 JUA', name: 'Oluwaseun Isreal Adesegun', phone: '0576381685' },
  { plate: '4430 JUA', name: 'Said Muhammad', phone: '0546072027' },
  { plate: '4538 LUA', name: 'Shah Saood', phone: '053397109' },
  { plate: '1737 BUA', name: 'Zahid Ali', phone: '0539620670' },
  { plate: '2295 EUA', name: 'Mohamed Arif', phone: '0506522709' },
  { plate: '1713 BUA', name: 'Akhtar Nawab', phone: '0581430290' },
  { plate: '4533 LUA', name: 'Hamid Ullah', phone: '0539579754' },
  { plate: '2287 EUA', name: 'Yasir Tahseen', phone: '0550029861' },
  { plate: '4481 JUA', name: 'Kamran Zarkhan', phone: '0543099005' },
  { plate: '5456 TKA', name: 'Mathab Akhtar', phone: '0509145107' },
  { plate: '1357 JER', name: 'Sohail Akhtar', phone: '0530013676' },
  { plate: '1560 EHR', name: 'Amir Hassan', phone: '0539571970' },
  { plate: '4534 LUA', name: 'Nafees Naseem', phone: '0536389031' },
  { plate: '4479 JUA', name: 'Muhammad Ahsan', phone: '0558399511' },
  { plate: '1369 JER', name: 'Muhammad Ibrahim', phone: '0590342314' },
  { plate: '2110 EUA', name: 'Mohammad Shahbaz', phone: '0505260991' },
  { plate: '1716 BUA', name: 'Farhan Razzaq', phone: '0510965334' },
  { plate: '4532 LUA', name: 'Asif Jan', phone: '0559583127' },
  { plate: '1715 BUA', name: 'Umar Zada', phone: '0537248930' },
  { plate: '4435 JUA', name: 'Zia Uddin', phone: '0559076373' },
  { plate: '4541 LUA', name: 'Nafees Naseem', phone: '0536389031' },
  { plate: '2344 EUA', name: 'M. Nouman', phone: '536654857' },
  { plate: '2687 EUA', name: 'Shazad', phone: '548797996' },
  { plate: '2290 EUA', name: 'Zahidullah', phone: '596537147' },
  { plate: '3296 DER', name: 'Umar Zada', phone: '537248930' },
  { plate: '4980 JUA', name: 'Ayaz Ullah', phone: '562744737' },
  { plate: '1712 BUA', name: 'Muhammad Ibrahim', phone: '590342314' }
];

// Ensure drivers table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
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

// Clear existing drivers
db.prepare('DELETE FROM drivers').run();
console.log('Cleared existing drivers');
console.log('');

let created = 0;
let notFound = 0;

for (const d of driversData) {
  // Find vehicle by plate
  const vehicle = db.prepare(`
    SELECT id FROM vehicles 
    WHERE plate_number || ' ' || plate_code = ?
  `).get(d.plate);

  if (!vehicle) {
    console.log(`⚠️  Vehicle not found: ${d.plate} (${d.name})`);
    notFound++;
    continue;
  }

  try {
    db.prepare(`
      INSERT INTO drivers (name, phone, vehicle_id, status, nationality)
      VALUES (?, ?, ?, 'Active', '')
    `).run(d.name, d.phone, vehicle.id);

    // Also update vehicle's driver field to match
    db.prepare('UPDATE vehicles SET driver = ?, phone = ? WHERE id = ?')
      .run(d.name, d.phone, vehicle.id);

    console.log(`✅ ${d.plate} — ${d.name}`);
    created++;
  } catch (e) {
    console.log(`❌ ${d.plate}: ${e.message}`);
  }
}

console.log('');
console.log('========================================');
console.log(`Drivers created: ${created}`);
console.log(`Vehicles not found: ${notFound}`);
console.log('========================================');

db.close();
