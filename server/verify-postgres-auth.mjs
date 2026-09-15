import bcrypt from "bcryptjs";
import { query } from "./postgres.js";

const result = await query(`
  SELECT id, username, password, full_name, role, is_active
  FROM users
  WHERE username IN ('owner', 'gm')
  ORDER BY username
`);

console.log("\n===== POSTGRES AUTH CHECK =====");

for (const user of result.rows) {
  console.log(`User: ${user.username}`);
  console.log(`Role: ${user.role}`);
  console.log(`Active: ${user.is_active}`);
  console.log(`Password hash exists: ${!!user.password}`);
}

console.log("\n===== HASH FORMAT CHECK =====");

for (const user of result.rows) {
  console.log(`${user.username}: ${user.password?.startsWith("$2") ? "bcrypt OK" : "NOT bcrypt"}`);
}

console.log("\nNo password was changed.");

process.exit(0);
