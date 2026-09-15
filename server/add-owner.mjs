import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'fleet.db'));

const username = 'owner';
const password = 'owner123';
const fullName = 'System Owner';
const role = 'Owner';

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  db.prepare('UPDATE users SET password = ?, role = ?, full_name = ? WHERE username = ?')
    .run(bcrypt.hashSync(password, 10), role, fullName, username);
  console.log('✅ Owner user UPDATED');
} else {
  db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)')
    .run(username, bcrypt.hashSync(password, 10), fullName, role);
  console.log('✅ Owner user CREATED');
}

console.log('Login: owner / owner123');
db.close();
