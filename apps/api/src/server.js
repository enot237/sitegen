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
    const { email, password } = req.body || {};
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
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [normalizedEmail, passwordHash]
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
  return res.json({ user: req.user });
});

app.post("/api/jobs", authRequired, async (req, res) => {
  try {
    const { clientId, prompt } = req.body || {};

    if (!clientId || !prompt) {
      return res.status(400).json({ error: "clientId and prompt are required." });
    }

    if (String(prompt).length > maxPromptLength) {
      return res.status(400).json({ error: "Prompt is too long." });
    }

    const safeClientId = sanitizeClientId(clientId);
    if (!safeClientId) {
      return res.status(400).json({ error: "Invalid clientId." });
    }

    const job = await queue.add(
      "generate-site",
      { clientId: safeClientId, prompt },
      {
        attempts: Number(process.env.JOB_ATTEMPTS || 1),
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 1000 }
      }
    );

    await pool.query(
      "INSERT INTO jobs (user_id, job_id, client_id, prompt, status) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, String(job.id), safeClientId, String(prompt), "queued"]
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
      `SELECT job_id, client_id, status, progress, result, error, created_at, updated_at
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
      `SELECT job_id, client_id, status, progress, result, error, created_at, updated_at
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
      failedReason: row.error || null
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
