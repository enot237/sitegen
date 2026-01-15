const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
require("dotenv").config();
const { pool, ensureSchema } = require("./db");

const queueName = process.env.QUEUE_NAME || "sitegen";
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const concurrency = Number(process.env.WORKER_CONCURRENCY || 2);

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const sanitizeClientId = (input) => {
  const trimmed = String(input || "").trim();
  const normalized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return normalized.replace(/^-+|-+$/g, "");
};

const stripCodeFence = (text) => {
  const match = text.match(/```(?:json|html)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    return match[1].trim();
  }
  return text.trim();
};

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

const buildProjectPrompt = (prompt) => [
  "You are a frontend agent building a Vite + React + Tailwind site.",
  "Return ONLY valid JSON, no markdown fences or extra text.",
  "JSON shape: {\"siteTitle\":\"...\",\"files\":[{\"path\":\"src/App.jsx\",\"content\":\"...\"}, ...]}",
  "Only include files under src/ or public/.",
  "Always include src/App.jsx and src/index.css.",
  "Use Tailwind classes for styling (no external CSS frameworks).",
  "Do not include package.json, configs, or build output.",
  "Keep assets inline (SVG, gradients) and avoid external URLs.",
  "Aim for a bold, modern, long-scroll landing (hero, benefits, features, testimonials, pricing, FAQ, CTA, footer).",
  "Prefer keeping everything in src/App.jsx with minimal extra files.",
  "",
  `Site brief: ${prompt}`
].join("\n");

const parseJsonContent = (content) => {
  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }
  const cleaned = stripCodeFence(content);
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch (_) {
        // fall through
      }
    }
    throw new Error(`OpenAI returned invalid JSON: ${error.message}`);
  }
};

const normalizeGeneratedPath = (input) => {
  if (!input) {
    return null;
  }
  const normalized = String(input).trim().replace(/\\/g, "/");
  const cleaned = path.posix.normalize(normalized);
  if (cleaned.startsWith("/") || cleaned.startsWith("../") || cleaned === "..") {
    return null;
  }
  return cleaned;
};

const writeGeneratedFiles = async (projectDir, files) => {
  if (!Array.isArray(files)) {
    throw new Error("OpenAI response missing files array.");
  }
  const allowedPrefixes = ["src/", "public/"];
  for (const file of files) {
    const filePath = normalizeGeneratedPath(file?.path);
    if (!filePath || !allowedPrefixes.some((prefix) => filePath.startsWith(prefix))) {
      continue;
    }
    const content = String(file.content || "");
    if (!content.trim()) {
      continue;
    }
    const targetPath = path.join(projectDir, filePath);
    if (!targetPath.startsWith(projectDir)) {
      continue;
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");
  }
};

const updateSiteTitle = async (projectDir, title) => {
  if (!title) {
    return;
  }
  const indexPath = path.join(projectDir, "index.html");
  const html = await fs.readFile(indexPath, "utf8");
  const next = html.replace("__SITE_TITLE__", String(title).trim() || "RoboSite");
  await fs.writeFile(indexPath, next, "utf8");
};

const runCommand = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...(options.env || {})
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logChunk = (chunk, streamLabel) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      console.log(`[${options.requestId}] ${streamLabel} ${line}`);
    }
  };

  child.stdout.on("data", (chunk) => logChunk(chunk, "stdout:"));
  child.stderr.on("data", (chunk) => logChunk(chunk, "stderr:"));
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    }
  });
});

const listFiles = async (dir, ignoreDirs = new Set()) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) {
        continue;
      }
      files.push(...await listFiles(fullPath, ignoreDirs));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
};

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
    case ".jsx":
    case ".ts":
    case ".tsx":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    default:
      return "application/octet-stream";
  }
};

const uploadDirectory = async (s3, bucket, localDir, prefix, options = {}) => {
  const ignoreDirs = new Set(options.ignoreDirs || []);
  const files = await listFiles(localDir, ignoreDirs);

  for (const filePath of files) {
    const relativePath = path.relative(localDir, filePath).replace(/\\/g, "/");
    const key = `${prefix}/${relativePath}`;
    const body = await fs.readFile(filePath);

    const putParams = {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: getContentType(filePath),
      CacheControl: options.cacheControl || "public, max-age=300"
    };

    if (options.acl) {
      putParams.ACL = options.acl;
    }

    await s3.send(new PutObjectCommand(putParams));
  }
};

const updateJobRecord = async (jobId, fields) => {
  const updates = [];
  const values = [];
  let index = 1;

  const entries = Object.entries(fields);
  for (const [key, value] of entries) {
    if (value === undefined) {
      continue;
    }
    updates.push(`${key} = $${index}`);
    values.push(value);
    index += 1;
  }

  if (!updates.length) {
    return;
  }

  updates.push(`updated_at = now()`);
  values.push(String(jobId));

  await pool.query(
    `UPDATE jobs SET ${updates.join(", ")} WHERE job_id = $${index}`,
    values
  );
};

const appendJobLog = async (jobId, message) => {
  if (!message) {
    return;
  }
  await pool.query(
    "INSERT INTO job_logs (job_id, message) VALUES ($1, $2)",
    [String(jobId), String(message)]
  );
};

const isResponsesEndpoint = (apiUrl) => /\/v1\/responses\/?$/.test(apiUrl || "");

const extractTextFromResponses = (data) => {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const output = Array.isArray(data.output) ? data.output : [];
  const textParts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (!part) {
        continue;
      }
      if (typeof part.text === "string") {
        textParts.push(part.text);
      }
    }
  }
  const joined = textParts.join("\n").trim();
  return joined || null;
};

const normalizeResponsesTextFormat = (rawFormat) => {
  if (!rawFormat) {
    return null;
  }
  const trimmed = String(rawFormat).trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (_) {
      // fall through to treat as a simple type string
    }
  }
  return { type: trimmed };
};

const callOpenAIContent = async (systemPrompt, userPrompt, options = {}) => {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = options.modelOverride || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const apiUrl = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  const maxTokensRaw = process.env.OPENAI_MAX_TOKENS;
  const maxTokens = maxTokensRaw ? Number.parseInt(maxTokensRaw, 10) : null;
  const logFullResponse = process.env.OPENAI_LOG_RESPONSE === "true";
  const timeoutMsRaw = process.env.OPENAI_TIMEOUT_MS;
  const timeoutMs = timeoutMsRaw ? Number.parseInt(timeoutMsRaw, 10) : 0;
  const reasoningEffortEnv = process.env.OPENAI_REASONING_EFFORT;
  const responseFormat = options.responseFormatOverride ?? process.env.OPENAI_RESPONSE_FORMAT;
  const fallbackModel = process.env.OPENAI_FALLBACK_MODEL;
  const allowFallback = process.env.OPENAI_ALLOW_FALLBACK !== "false";

  const useMaxCompletionTokens =
    /^gpt-5/i.test(model) ||
    process.env.OPENAI_USE_MAX_COMPLETION_TOKENS === "true";

  const useResponses = isResponsesEndpoint(apiUrl);
  const temperatureRaw = process.env.OPENAI_TEMPERATURE;
  const temperature = temperatureRaw !== undefined && temperatureRaw !== ""
    ? Number.parseFloat(temperatureRaw)
    : null;

  const payload = useResponses
    ? {
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }
    : {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      };

  if (Number.isFinite(temperature)) {
    payload.temperature = temperature;
  }

  if (reasoningEffortEnv) {
    payload.reasoning = { effort: reasoningEffortEnv };
  }

  if (responseFormat) {
    if (useResponses) {
      const format = normalizeResponsesTextFormat(responseFormat);
      if (format) {
        payload.text = { format };
      }
    } else {
      payload.response_format = { type: responseFormat };
    }
  }

  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    if (useResponses) {
      payload.max_output_tokens = maxTokens;
    } else if (useMaxCompletionTokens) {
      payload.max_completion_tokens = maxTokens;
    } else {
      payload.max_tokens = maxTokens;
    }
  }

  const controller = timeoutMs > 0 ? new AbortController() : null;
  let timeoutId = null;
  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: controller ? controller.signal : undefined
  });
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status} ${responseText}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (error) {
    const preview = responseText.slice(0, 500);
    throw new Error(`OpenAI invalid JSON: ${error.message}. Preview: ${preview}`);
  }
  let rawContent = null;
  if (useResponses) {
    rawContent = extractTextFromResponses(data);
  }
  if (!rawContent) {
    const choice = data?.choices?.[0];
    rawContent = choice?.message?.content ?? choice?.message?.content?.text;
  }

  let content = rawContent;
  if (Array.isArray(rawContent)) {
    const textParts = rawContent
      .filter((part) => part && (part.type === "text" || typeof part.text === "string"))
      .map((part) => part.text || "");
    content = textParts.join("\n").trim();
  }

  if (!content || typeof content !== "string") {
    const finishReason = choice?.finish_reason || "unknown";
    console.warn(
      `OpenAI empty content. finish_reason=${finishReason} model=${model}`
    );
    if (logFullResponse) {
      console.warn("OpenAI full response:", responseText);
    }
    if (!options.modelOverride && allowFallback && fallbackModel && fallbackModel !== model) {
      console.warn(`Retry with fallback model=${fallbackModel}`);
      return callOpenAIContent(systemPrompt, userPrompt, { modelOverride: fallbackModel });
    }
    throw new Error("OpenAI returned empty content.");
  }

  return {
    content: stripCodeFence(content),
    usage: data?.usage || null,
    model: data?.model || model
  };
};

const repairJsonWithOpenAI = async (rawContent, requestId) => {
  const enabled = process.env.OPENAI_ENABLE_JSON_REPAIR !== "false";
  if (!enabled) {
    throw new Error("OpenAI returned invalid JSON and repair is disabled.");
  }

  const maxCharsRaw = process.env.OPENAI_JSON_REPAIR_MAX_CHARS;
  const maxChars = maxCharsRaw ? Number.parseInt(maxCharsRaw, 10) : 12000;
  const clipped = maxChars > 0 ? rawContent.slice(0, maxChars) : rawContent;

  console.warn(`[${requestId || "unknown"}] attempting JSON repair (chars=${clipped.length})`);

  const systemPrompt = [
    "You fix malformed JSON.",
    "Return ONLY valid JSON, no markdown, no commentary.",
    "Preserve the original meaning and content as much as possible."
  ].join("\n");
  const userPrompt = `Fix this JSON:\n${clipped}`;

  const modelOverride = process.env.OPENAI_JSON_REPAIR_MODEL || undefined;
  const responseFormatOverride = process.env.OPENAI_JSON_REPAIR_RESPONSE_FORMAT || undefined;
  return callOpenAIContent(systemPrompt, userPrompt, {
    modelOverride,
    responseFormatOverride
  });
};

const accumulateUsage = (acc, usage) => {
  if (!usage) {
    return acc;
  }
  acc.prompt += Number(usage.prompt_tokens || 0);
  acc.completion += Number(usage.completion_tokens || 0);
  acc.total += Number(usage.total_tokens || 0);
  return acc;
};

const generateProjectFiles = async (prompt, requestId) => {
  const systemPrompt = "You generate Vite React + Tailwind project source files.";
  const userPrompt = buildProjectPrompt(prompt);
  const usageTotals = { prompt: 0, completion: 0, total: 0 };
  const firstResponse = await callOpenAIContent(systemPrompt, userPrompt);
  accumulateUsage(usageTotals, firstResponse.usage);
  let parsed;
  try {
    parsed = parseJsonContent(firstResponse.content);
  } catch (error) {
    const preview = String(firstResponse.content || "").slice(0, 800);
    console.warn(`[${requestId || "unknown"}] OpenAI JSON parse error: ${error.message}`);
    console.warn(`[${requestId || "unknown"}] OpenAI JSON content preview: ${preview}`);
    const repaired = await repairJsonWithOpenAI(String(firstResponse.content || ""), requestId);
    accumulateUsage(usageTotals, repaired.usage);
    parsed = parseJsonContent(repaired.content);
  }
  if (!parsed || !Array.isArray(parsed.files)) {
    throw new Error("OpenAI response is missing the files array.");
  }
  return {
    siteTitle: parsed.siteTitle,
    files: parsed.files,
    tokens: usageTotals,
    model: firstResponse.model
  };
};

const generateSite = async (job) => {
  const requestId = String(job.id || "unknown");
  const { clientId, prompt } = job.data || {};

  if (!clientId || !prompt) {
    throw new Error("clientId and prompt are required.");
  }

  const safeClientId = sanitizeClientId(clientId);
  if (!safeClientId) {
    throw new Error("Invalid clientId.");
  }

  const bucket = process.env.S3_BUCKET || process.env.AWS_BUCKET_PASSPORTS;
  if (!bucket) {
    throw new Error("Missing S3_BUCKET or AWS_BUCKET_PASSPORTS");
  }

  const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT;
  const s3Config = { region };
  if (endpoint) {
    s3Config.endpoint = endpoint;
    s3Config.forcePathStyle = true;
  }
  const s3 = new S3Client(s3Config);

  console.log(
    `[${requestId}] generate start clientId=${safeClientId} promptLength=${String(prompt).length}`
  );
  await appendJobLog(requestId, "Job started");

  const baseUrl =
    process.env.S3_PUBLIC_BASE_URL ||
    process.env.AWS_URL_PASSPORTS ||
    process.env.AWS_ENDPOINT_CDN;
  const trimmedBase = baseUrl ? baseUrl.replace(/\/+$/, "") : "";
  const acl = process.env.S3_OBJECT_ACL;
  const keepWorkdir = process.env.ROBOSITE_KEEP_WORKDIR === "true";

  let workspaceDir = null;
  let projectDir = null;

  try {
    await updateJobRecord(requestId, {
      status: "active",
      progress: { step: "prepare" },
      error: null
    });
    await appendJobLog(requestId, "Preparing workspace");
    await job.updateProgress({ step: "prepare" });
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "robosite-"));
    projectDir = path.join(workspaceDir, "project");
    const templateDir = path.join(__dirname, "..", "templates", "vite-react-tailwind");
    await fs.cp(templateDir, projectDir, { recursive: true });

    await updateJobRecord(requestId, { progress: { step: "generate" } });
    await appendJobLog(requestId, "Generating project files with OpenAI");
    await job.updateProgress({ step: "generate" });
    const spec = await generateProjectFiles(prompt, requestId);
    await writeGeneratedFiles(projectDir, spec.files);
    await updateSiteTitle(projectDir, spec.siteTitle || safeClientId);

    await updateJobRecord(requestId, { progress: { step: "install" } });
    await appendJobLog(requestId, "Installing dependencies");
    await job.updateProgress({ step: "install" });
    await runCommand("npm", ["install", "--include=dev"], {
      cwd: projectDir,
      requestId,
      env: {
        NODE_ENV: "development",
        npm_config_production: "false"
      }
    });

    await updateJobRecord(requestId, { progress: { step: "build" } });
    await appendJobLog(requestId, "Building project with Vite");
    await job.updateProgress({ step: "build" });
    await runCommand("npm", ["run", "build"], {
      cwd: projectDir,
      requestId
    });

    const srcPrefix = `${safeClientId}/src`;
    const buildPrefix = `${safeClientId}/build`;

    await updateJobRecord(requestId, { progress: { step: "upload-src" } });
    await appendJobLog(requestId, "Uploading src to S3");
    await job.updateProgress({ step: "upload-src" });
    await uploadDirectory(s3, bucket, projectDir, srcPrefix, {
      ignoreDirs: ["node_modules", "build", ".git"],
      acl
    });

    const buildDir = path.join(projectDir, "build");
    await updateJobRecord(requestId, { progress: { step: "upload-build" } });
    await appendJobLog(requestId, "Uploading build to S3");
    await job.updateProgress({ step: "upload-build" });
    await uploadDirectory(s3, bucket, buildDir, buildPrefix, { acl });

    const buildUrl = trimmedBase
      ? `${trimmedBase}/${buildPrefix}/index.html`
      : `https://${bucket}.s3.${region}.amazonaws.com/${buildPrefix}/index.html`;

    console.log(`[${requestId}] upload ok src=${srcPrefix} build=${buildPrefix}`);

    await updateJobRecord(requestId, {
      status: "completed",
      progress: { step: "completed" },
      result: {
        clientId: safeClientId,
        srcPrefix,
        buildPrefix,
        buildUrl,
        s3Src: `s3://${bucket}/${srcPrefix}`,
        s3Build: `s3://${bucket}/${buildPrefix}`
      },
      tokens_prompt: spec.tokens?.prompt || 0,
      tokens_completion: spec.tokens?.completion || 0,
      tokens_total: spec.tokens?.total || 0,
      model: spec.model || null,
      error: null
    });
    await appendJobLog(
      requestId,
      `Completed. Tokens: ${spec.tokens?.total || 0}`
    );

    return {
      clientId: safeClientId,
      srcPrefix,
      buildPrefix,
      buildUrl,
      s3Src: `s3://${bucket}/${srcPrefix}`,
      s3Build: `s3://${bucket}/${buildPrefix}`
    };
  } catch (error) {
    await updateJobRecord(requestId, {
      status: "failed",
      progress: { step: "failed" },
      error: error.message
    });
    await appendJobLog(requestId, `Failed: ${error.message}`);
    throw error;
  } finally {
    if (workspaceDir && !keepWorkdir) {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    } else if (workspaceDir) {
      console.log(`[${requestId}] keep workdir at ${workspaceDir}`);
    }
  }
};

const start = async () => {
  await ensureSchema();

  const worker = new Worker(queueName, generateSite, {
    connection,
    concurrency
  });

  worker.on("completed", (job) => {
    console.log(`[${job.id}] completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[${job?.id}] failed`, error);
  });

  console.log(`RoboSite worker listening to queue: ${queueName}`);
};

start().catch((error) => {
  console.error("Failed to initialize worker", error);
  process.exit(1);
});
