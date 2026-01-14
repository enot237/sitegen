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

      await client.query(`
        CREATE TABLE IF NOT EXISTS sites (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          client_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS job_logs (
          id BIGSERIAL PRIMARY KEY,
          job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await client.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;"
      );
      await client.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;"
      );
      await client.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT;"
      );
      await client.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();"
      );

      await client.query(
        "ALTER TABLE sites ADD COLUMN IF NOT EXISTS notes TEXT;"
      );

      await client.query(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL;"
      );
      await client.query(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tokens_prompt INTEGER;"
      );
      await client.query(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tokens_completion INTEGER;"
      );
      await client.query(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tokens_total INTEGER;"
      );
      await client.query(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS model TEXT;"
      );

      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);"
      );

      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_jobs_site_id ON jobs(site_id);"
      );

      await client.query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_user_client ON sites(user_id, client_id);"
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
