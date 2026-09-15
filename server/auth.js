import 'dotenv/config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'fleet.db'));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is missing');

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default users
const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (count === 0) {
  const defaultUsers = [
    { username: 'gm', password: 'gm123', full_name: 'General Manager', role: 'GM' },
    { username: 'accountant', password: 'acc123', full_name: 'Accountant', role: 'Accountant' },
    { username: 'driver', password: 'drv123', full_name: 'Driver', role: 'Driver' },
    { username: 'manager', password: 'mgr123', full_name: 'Campus Manager', role: 'CampusManager' }
  ];
  const stmt = db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)');
  for (const u of defaultUsers) {
    stmt.run(u.username, bcrypt.hashSync(u.password, 10), u.full_name, u.role);
  }
  console.log('? Default users created');
}

const RESET_OWNER_PASSWORD = process.env.RESET_OWNER_PASSWORD;

if (RESET_OWNER_PASSWORD) {
  const ownerPasswordHash = bcrypt.hashSync(RESET_OWNER_PASSWORD, 10);

  const owner = db.prepare(
    'SELECT id FROM users WHERE username = ?'
  ).get('owner');

  if (owner) {
    db.prepare(
      'UPDATE users SET password = ?, role = ?, is_active = 1 WHERE username = ?'
    ).run(ownerPasswordHash, 'Owner', 'owner');

    console.log('Owner password reset completed');
  } else {
    db.prepare(`
      INSERT INTO users
      (username, password, full_name, role, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(
      'owner',
      ownerPasswordHash,
      'System Owner',
      'Owner'
    );

    console.log('Owner user created');
  }
}
export function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user) throw new Error('Invalid credentials');
  if (!bcrypt.compareSync(password, user.password)) throw new Error('Invalid credentials');
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  return {
    token,
    user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role }
  };
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

export function listUsers() {
  return db.prepare('SELECT id, username, full_name, role, email, phone, is_active, created_at FROM users').all();
}

export function createUser(data) {
  const hash = bcrypt.hashSync(data.password || 'changeme123', 10);
  const info = db.prepare('INSERT INTO users (username, password, full_name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)')
    .run(data.username, hash, data.fullName || '', data.role || 'Driver', data.email || '', data.phone || '');
  return db.prepare('SELECT id, username, full_name, role, email, phone, is_active FROM users WHERE id = ?').get(info.lastInsertRowid);
}

export function deleteUser(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

export default db;

