import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "./postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env")
});

const JWT_SECRET = process.env.JWT_SECRET || "fleet-erp-default-secret-change-me";

if (!process.env.JWT_SECRET) {
  console.warn("⚠️ WARNING: JWT_SECRET is not set. Set it in the hosting environment variables for security.");
}

// ============================================================
// AUTHENTICATION — PostgreSQL
// ============================================================

export async function login(username, password) {
  const result = await query(`
    SELECT
      id,
      username,
      password,
      full_name,
      role,
      email,
      phone,
      is_active
    FROM users
    WHERE username = $1
      AND is_active = 1
    LIMIT 1
  `, [username]);

  const user = result.rows[0];

  if (!user) {
    throw new Error("Invalid credentials");
  }

  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      email: user.email,
      phone: user.phone
    }
  };
}

// ============================================================
// JWT VERIFICATION
// ============================================================

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ============================================================
// LIST USERS
// ============================================================

export async function listUsers() {
  const result = await query(`
    SELECT
      id,
      username,
      full_name,
      role,
      email,
      phone,
      is_active,
      created_at
    FROM users
    ORDER BY id
  `);

  return result.rows;
}

// ============================================================
// CREATE USER
// ============================================================

export async function createUser(data = {}) {
  const username = String(data.username || "").trim();

  if (!username) {
    throw new Error("Username is required");
  }

  const password = data.password || "changeme123";
  const fullName = data.fullName || "";
  const role = data.role || "Driver";
  const email = data.email || "";
  const phone = data.phone || "";

  const existing = await query(
    `SELECT id FROM users WHERE username = $1 LIMIT 1`,
    [username]
  );

  if (existing.rows.length > 0) {
    throw new Error("Username already exists");
  }

  const hash = await bcrypt.hash(password, 10);

  const result = await query(`
    INSERT INTO users (
      username,
      password,
      full_name,
      role,
      email,
      phone,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, 1)
    RETURNING
      id,
      username,
      full_name,
      role,
      email,
      phone,
      is_active,
      created_at
  `, [
    username,
    hash,
    fullName,
    role,
    email,
    phone
  ]);

  return result.rows[0];
}

// ============================================================
// DELETE USER
// ============================================================

export async function deleteUser(id) {
  const result = await query(
    `DELETE FROM users WHERE id = $1`,
    [id]
  );

  return result.rowCount > 0;
}

// ============================================================
// GLOBAL AUTH MIDDLEWARE COMPATIBILITY
// server.js already calls requireAuth() directly.
// Keep this here so authentication is available before routes run.
// ============================================================

globalThis.requireAuth = function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  req.user = decoded;
  next();
};
