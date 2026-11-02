// Creates (or resets the password of) an application user.
// Usage: node --env-file=.env.local scripts/create-user.mjs <email> "<full name>" <Admin|"Claims Officer">
// The password is read from the ICMS_NEW_PASSWORD environment variable or prompted for,
// so it never appears in shell history or source code.
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline/promises";
import mysql from "mysql2/promise";

const [email, fullName, role = "Claims Officer"] = process.argv.slice(2);
if (!email || !fullName || !["Admin", "Claims Officer"].includes(role)) {
  console.error('Usage: node --env-file=.env.local scripts/create-user.mjs <email> "<full name>" <Admin|"Claims Officer">');
  process.exit(1);
}

let password = process.env.ICMS_NEW_PASSWORD;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question("Password (min 8 chars, letters + numbers): ");
  rl.close();
}
if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error("Password must be at least 8 characters and contain letters and numbers.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
});
await connection.execute(
  `INSERT INTO APP_USER (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash), role = VALUES(role), is_active = 1`,
  [fullName, email.toLowerCase(), hash, role]
);
await connection.end();
console.log(`User ${email.toLowerCase()} saved with role ${role}.`);
