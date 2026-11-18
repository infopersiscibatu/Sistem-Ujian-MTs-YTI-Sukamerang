import pg from "pg";

const connectionString = process.env.DATABASE_URL || "";
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

export const pool = new pg.Pool({
  connectionString,
  ssl: connectionString && !isLocal ? { rejectUnauthorized: false } : false,
  max: 3,
  idleTimeoutMillis: 4000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
});

const RETRYABLE_CODE = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "57P01", "57P03", "08006", "08003", "08001"];
const RETRYABLE_MSG = /terminat|timeout|connection|end of file|shutdown|ECONNRESET|ECONNREFUSED/i;

export function hasDb() {
  return Boolean(connectionString);
}

/** Query helper that retries once when the (idle-slept) database connection turns out to be dead. */
export async function q(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (RETRYABLE_CODE.includes(err.code) || RETRYABLE_MSG.test(err.message || "")) {
      return pool.query(text, params);
    }
    throw err;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
