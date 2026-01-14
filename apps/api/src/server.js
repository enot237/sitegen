const express = require("express");
const cors = require("cors");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { pool, ensureSchema } = require("./db");

const port = process.env.API_PORT || process.env.PORT || 3001;
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const queueName = process.env.QUEUE_NAME || "sitegen";
const maxPromptLength = Number(process.env.MAX_PROMPT_LENGTH || 8000);
const jwtSecret = process.env.JWT_SECRET || "change-me";
const jwtTtl = process.env.JWT_TTL || "7d";

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(queueName, { connection });

const sanitizeClientId = (input) => {
  const trimmed = String(input || "").trim();
  const normalized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return normalized.replace(/^-+|-+$/g, "");
};

const buildClientId = async (userId, name) => {
  const base = sanitizeClientId(name) || "site";
  let candidate = `${userId}-${base}`;
  let suffix = 1;

  while (true) {
    const existing = await pool.query(
      "SELECT id FROM sites WHERE user_id = $1 AND client_id = $2",
      [userId, candidate]
    );
    if (!existing.rows.length) {
      return candidate;
    }
    suffix += 1;
    candidate = `${userId}-${base}-${suffix}`;
  }
};

const app = express();
app.use(express.json({ limit: "128kb" }));

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : ["*"];

app.use(cors({
  origin: corsOrigins,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const signToken = (user) => jwt.sign(
  { sub: user.id, email: user.email },
  jwtSecret,
  { expiresIn: jwtTtl }
);

const authRequired = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token." });
  }
};

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, fullName, phone, company } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const atIndex = normalizedEmail.indexOf("@");
    const emailOk = atIndex > 0 && atIndex < normalizedEmail.length - 1 && !/\\s/.test(normalizedEmail);
    if (!emailOk) {
      return res.status(400).json({ error: "Invalid email format." });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: "User already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, company)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, phone, company, created_at`,
      [
        normalizedEmail,
        passwordHash,
        fullName ? String(fullName).trim() : null,
        phone ? String(phone).trim() : null,
        company ? String(company).trim() : null
      ]
    );

    const user = result.rows[0];
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [normalizedEmail]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = signToken({ id: user.id, email: user.email });
    return res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/me", authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, phone, company, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put("/api/me", authRequired, async (req, res) => {
  try {
    const { fullName, phone, company } = req.body || {};
    const updates = [];
    const values = [];
    let index = 1;

    if (fullName !== undefined) {
      updates.push(`full_name = $${index}`);
      values.push(String(fullName).trim() || null);
      index += 1;
    }
    if (phone !== undefined) {
      updates.push(`phone = $${index}`);
      values.push(String(phone).trim() || null);
      index += 1;
    }
    if (company !== undefined) {
      updates.push(`company = $${index}`);
      values.push(String(company).trim() || null);
      index += 1;
    }

    if (!updates.length) {
      return res.status(400).json({ error: "No fields to update." });
    }

    updates.push("updated_at = now()");
    values.push(req.user.id);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${index}
       RETURNING id, email, full_name, phone, company, created_at, updated_at`,
      values
    );

    return res.json({ user: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/me/password", authRequired, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required." });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid current password." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
      [passwordHash, req.user.id]
    );

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/sites", authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.client_id, s.name, s.description, s.notes, s.status, s.created_at, s.updated_at,
              COALESCE(SUM(j.tokens_total), 0) AS tokens_total,
              MAX(j.created_at) AS last_generated_at,
              (
                SELECT j2.result->>'buildUrl'
                FROM jobs j2
                WHERE j2.site_id = s.id AND j2.result IS NOT NULL
                ORDER BY j2.created_at DESC
                LIMIT 1
              ) AS build_url
       FROM sites s
       LEFT JOIN jobs j ON j.site_id = s.id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    const sites = result.rows.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      name: row.name,
      description: row.description,
      notes: row.notes,
      status: row.status,
      tokensTotal: Number(row.tokens_total || 0),
      lastGeneratedAt: row.last_generated_at,
      buildUrl: row.build_url || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    return res.json({ sites });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/sites", authRequired, async (req, res) => {
  try {
    const { name, description, notes } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: "name is required." });
    }

    const safeClientId = await buildClientId(req.user.id, name);
    const result = await pool.query(
      `INSERT INTO sites (user_id, client_id, name, description, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, name, description, notes, status, created_at, updated_at`,
      [
        req.user.id,
        safeClientId,
        String(name).trim(),
        description ? String(description).trim() : null,
        notes ? String(notes).trim() : null
      ]
    );

    const site = result.rows[0];
    return res.status(201).json({
      site: {
        id: site.id,
        clientId: site.client_id,
        name: site.name,
        description: site.description,
        notes: site.notes,
        status: site.status,
        createdAt: site.created_at,
        updatedAt: site.updated_at
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/sites/:id", authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.client_id, s.name, s.description, s.notes, s.status, s.created_at, s.updated_at,
              COALESCE(SUM(j.tokens_total), 0) AS tokens_total,
              MAX(j.created_at) AS last_generated_at,
              (
                SELECT j2.result->>'buildUrl'
                FROM jobs j2
                WHERE j2.site_id = s.id AND j2.result IS NOT NULL
                ORDER BY j2.created_at DESC
                LIMIT 1
              ) AS build_url
       FROM sites s
       LEFT JOIN jobs j ON j.site_id = s.id
       WHERE s.user_id = $1 AND s.id = $2
       GROUP BY s.id`,
      [req.user.id, Number(req.params.id)]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: "Site not found." });
    }
    return res.json({
      site: {
        id: row.id,
        clientId: row.client_id,
        name: row.name,
        description: row.description,
        notes: row.notes,
        status: row.status,
        tokensTotal: Number(row.tokens_total || 0),
        lastGeneratedAt: row.last_generated_at,
        buildUrl: row.build_url || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put("/api/sites/:id", authRequired, async (req, res) => {
  try {
    const { name, description, status, notes } = req.body || {};
    const updates = [];
    const values = [];
    let index = 1;

    if (name !== undefined) {
      updates.push(`name = $${index}`);
      values.push(String(name).trim());
      index += 1;
    }
    if (description !== undefined) {
      updates.push(`description = $${index}`);
      values.push(String(description).trim() || null);
      index += 1;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${index}`);
      values.push(String(notes).trim() || null);
      index += 1;
    }
    if (status !== undefined) {
      updates.push(`status = $${index}`);
      values.push(String(status).trim());
      index += 1;
    }

    if (!updates.length) {
      return res.status(400).json({ error: "No fields to update." });
    }

    updates.push("updated_at = now()");
    values.push(req.user.id, Number(req.params.id));

    const result = await pool.query(
      `UPDATE sites SET ${updates.join(", ")} WHERE user_id = $${index} AND id = $${index + 1}
       RETURNING id, client_id, name, description, notes, status, created_at, updated_at`,
      values
    );

    const site = result.rows[0];
    if (!site) {
      return res.status(404).json({ error: "Site not found." });
    }

    return res.json({
      site: {
        id: site.id,
        clientId: site.client_id,
        name: site.name,
        description: site.description,
        notes: site.notes,
        status: site.status,
        createdAt: site.created_at,
        updatedAt: site.updated_at
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete("/api/sites/:id", authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM sites WHERE user_id = $1 AND id = $2 RETURNING id",
      [req.user.id, Number(req.params.id)]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Site not found." });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/sites/:id/jobs", authRequired, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const result = await pool.query(
      `SELECT job_id, status, progress, result, error, tokens_prompt, tokens_completion, tokens_total, model, prompt, created_at, updated_at
       FROM jobs
       WHERE user_id = $1 AND site_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [req.user.id, Number(req.params.id), limit]
    );

    const jobs = result.rows.map((row) => ({
      id: row.job_id,
      status: row.status,
      progress: row.progress,
      result: row.result,
      error: row.error,
      tokensPrompt: row.tokens_prompt,
      tokensCompletion: row.tokens_completion,
      tokensTotal: row.tokens_total,
      model: row.model,
      prompt: row.prompt,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return res.json({ jobs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/sites/:id/logs", authRequired, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 200), 500);
    const result = await pool.query(
      `SELECT jl.message, jl.created_at, j.job_id, j.status
       FROM job_logs jl
       JOIN jobs j ON j.job_id = jl.job_id
       WHERE j.user_id = $1 AND j.site_id = $2
       ORDER BY jl.created_at DESC
       LIMIT $3`,
      [req.user.id, Number(req.params.id), limit]
    );
    const logs = result.rows.map((row) => ({
      message: row.message,
      createdAt: row.created_at,
      jobId: row.job_id,
      status: row.status
    }));
    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/jobs", authRequired, async (req, res) => {
  try {
    const { clientId, prompt, siteId, name, description } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required." });
    }

    if (String(prompt).length > maxPromptLength) {
      return res.status(400).json({ error: "Prompt is too long." });
    }

    let resolvedSiteId = null;
    let resolvedClientId = null;

    if (siteId) {
      const siteResult = await pool.query(
        "SELECT id, client_id FROM sites WHERE user_id = $1 AND id = $2",
        [req.user.id, Number(siteId)]
      );
      const site = siteResult.rows[0];
      if (!site) {
        return res.status(404).json({ error: "Site not found." });
      }
      resolvedSiteId = site.id;
      resolvedClientId = site.client_id;
    } else {
      if (!clientId) {
        return res.status(400).json({ error: "siteId is required." });
      }
      const safeClientId = sanitizeClientId(clientId);
      if (!safeClientId) {
        return res.status(400).json({ error: "Invalid clientId." });
      }
      resolvedClientId = safeClientId;

      const existing = await pool.query(
        "SELECT id FROM sites WHERE user_id = $1 AND client_id = $2",
        [req.user.id, safeClientId]
      );
      if (existing.rows.length) {
        resolvedSiteId = existing.rows[0].id;
      } else {
        const siteName = name ? String(name).trim() : safeClientId;
        const create = await pool.query(
          `INSERT INTO sites (user_id, client_id, name, description)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [req.user.id, safeClientId, siteName, description ? String(description).trim() : null]
        );
        resolvedSiteId = create.rows[0].id;
      }
    }

    const job = await queue.add(
      "generate-site",
      { clientId: resolvedClientId, prompt },
      {
        attempts: Number(process.env.JOB_ATTEMPTS || 1),
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 1000 }
      }
    );

    await pool.query(
      "INSERT INTO jobs (user_id, job_id, site_id, client_id, prompt, status) VALUES ($1, $2, $3, $4, $5, $6)",
      [req.user.id, String(job.id), resolvedSiteId, resolvedClientId, String(prompt), "queued"]
    );

    return res.status(202).json({
      id: job.id,
      status: "queued"
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/jobs", authRequired, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const result = await pool.query(
      `SELECT job_id, client_id, status, progress, result, error, tokens_total, model, created_at, updated_at
       FROM jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );
    const jobs = result.rows.map((row) => ({
      id: row.job_id,
      clientId: row.client_id,
      status: row.status,
      progress: row.progress,
      result: row.result,
      error: row.error,
      tokensTotal: row.tokens_total,
      model: row.model,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    return res.json({ jobs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/jobs/:id", authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT job_id, client_id, status, progress, result, error, tokens_prompt, tokens_completion, tokens_total, model, created_at, updated_at
       FROM jobs
       WHERE user_id = $1 AND job_id = $2`,
      [req.user.id, String(req.params.id)]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: "Job not found." });
    }

    return res.json({
      id: row.job_id,
      status: row.status,
      progress: row.progress || null,
      result: row.result || null,
      failedReason: row.error || null,
      tokensPrompt: row.tokens_prompt,
      tokensCompletion: row.tokens_completion,
      tokensTotal: row.tokens_total,
      model: row.model
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/jobs/:id/logs", authRequired, async (req, res) => {
  try {
    const jobId = String(req.params.id);
    const jobResult = await pool.query(
      "SELECT id FROM jobs WHERE user_id = $1 AND job_id = $2",
      [req.user.id, jobId]
    );
    if (!jobResult.rows.length) {
      return res.status(404).json({ error: "Job not found." });
    }
    const logsResult = await pool.query(
      "SELECT message, created_at FROM job_logs WHERE job_id = $1 ORDER BY created_at ASC LIMIT 200",
      [jobId]
    );
    const logs = logsResult.rows.map((row) => ({
      message: row.message,
      createdAt: row.created_at
    }));
    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/billing/summary", authRequired, async (req, res) => {
  try {
    const totalResult = await pool.query(
      `SELECT COUNT(*) AS jobs_count,
              COALESCE(SUM(tokens_total), 0) AS tokens_total
       FROM jobs
       WHERE user_id = $1`,
      [req.user.id]
    );
    const monthResult = await pool.query(
      `SELECT COALESCE(SUM(tokens_total), 0) AS tokens_month
       FROM jobs
       WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [req.user.id]
    );
    const jobsCount = Number(totalResult.rows[0].jobs_count || 0);
    const tokensTotal = Number(totalResult.rows[0].tokens_total || 0);
    const tokensMonth = Number(monthResult.rows[0].tokens_month || 0);

    return res.json({
      jobsCount,
      tokensTotal,
      tokensMonth
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const start = async () => {
  await ensureSchema();
  app.listen(port, () => {
    console.log(`RoboSite API listening on http://localhost:${port}`);
  });
};

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
