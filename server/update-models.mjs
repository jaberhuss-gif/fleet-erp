import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'fleet.db'));

console.log('Before update:');
const before = db.prepare("SELECT make, model, year, COUNT(*) as count FROM vehicles GROUP BY make, model, year").all();
console.log(before);

// Update ALL vehicles to Land Cruiser 2013
const result = db.prepare(`
  UPDATE vehicles 
  SET make = 'Toyota', model = 'Land Cruiser', year = 2013, updated_at = CURRENT_TIMESTAMP
`).run();

console.log('');
console.log('Updated vehicles: ' + result.changes);

console.log('');
console.log('After update:');
const after = db.prepare("SELECT make, model, year, COUNT(*) as count FROM vehicles GROUP BY make, model, year").all();
console.log(after);

// Show sample
console.log('');
console.log('Sample vehicles:');
const sample = db.prepare("SELECT plate_number || ' ' || plate_code as plate, make, model, year, driver FROM vehicles LIMIT 5").all();
console.log(sample);

db.close();
