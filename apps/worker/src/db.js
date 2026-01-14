const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const pool = new Pool({ connectionString });
const lockKey = Number(process.env.DB_INIT_LOCK_KEY || 424242);
const maxAttempts = Number(process.env.DB_INIT_ATTEMPTS || 30);
const delayMs = Number(process.env.DB_INIT_DELAY_MS || 1000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureSchema = async () => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let client = null;
    let locked = false;
    let released = false;

    try {
      client = await pool.connect();
      await client.query("SELECT pg_advisory_lock($1)", [lockKey]);
      locked = true;

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id BIGSERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS jobs (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          job_id TEXT UNIQUE NOT NULL,
          client_id TEXT NOT NULL,
          prompt TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          progress JSONB,
          result JSONB,
          error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);"
      );

      await client.query("SELECT pg_advisory_unlock($1)", [lockKey]);
      locked = false;
      client.release();
      released = true;
      return;
    } catch (error) {
      if (client && locked) {
        try {
          await client.query("SELECT pg_advisory_unlock($1)", [lockKey]);
        } catch (_) {
          // ignore unlock errors
        }
      }
      if (client && !released) {
        client.release();
        released = true;
      }
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(delayMs);
    } finally {
      if (client && !released) {
        client.release();
      }
    }
  }
};

module.exports = {
  pool,
  ensureSchema
};
