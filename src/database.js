import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool, types } = pg;

// Keep PostgreSQL DATE values as YYYY-MM-DD strings so calendar dates never shift by timezone.
types.setTypeParser(1082, value => value);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hasPgParts = Boolean(process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE);
if (!hasPgParts && !process.env.DATABASE_URL) {
  throw new Error('Database configuration is required (PGHOST/PGUSER/PGDATABASE or DATABASE_URL)');
}

const poolConfig = hasPgParts ? {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
} : {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

export const pool = new Pool({
  ...poolConfig,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function initializeDatabase() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8');
  await pool.query(sql);
}

export async function query(text, params = []) {
  return pool.query(text, params);
}
