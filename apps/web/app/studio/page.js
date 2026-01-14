"use client";

import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const statusLabels = {
  queued: "В очереди",
  waiting: "В очереди",
  active: "Генерация",
  completed: "Готово",
  failed: "Ошибка",
  delayed: "Отложено",
  paused: "Пауза"
};

const formatStatus = (status) => statusLabels[status] || status || "—";

export default function StudioPage() {
  const [clientId, setClientId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [token, setToken] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => clientId.trim() && prompt.trim(), [clientId, prompt]);

  useEffect(() => {
    const stored = localStorage.getItem("robosite_token");
    if (!stored) {
      window.location.href = "/login";
      return;
    }
    setToken(stored);

    const verify = async () => {
      const response = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${stored}` }
      });
      if (!response.ok) {
        localStorage.removeItem("robosite_token");
        window.location.href = "/login";
      }
    };

    verify();
  }, []);

  const submitJob = async (event) => {
    event.preventDefault();
    if (!canSubmit || !token) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    setStatus("waiting");

    try {
      const response = await fetch(`${API_URL}/api/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ clientId, prompt })
      });
      const data = await response.json();
      if (response.status === 401) {
        localStorage.removeItem("robosite_token");
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(data.error || "Не удалось создать задачу.");
      }
      setJobId(data.id);
    } catch (err) {
      setError(err.message);
      setStatus("failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!jobId || !token) {
      return;
    }

    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.status === 401) {
          localStorage.removeItem("robosite_token");
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          throw new Error(data.error || "Не удалось получить статус.");
        }
        if (!active) {
          return;
        }
        setStatus(data.status);
        setProgress(data.progress);
        setResult(data.result || null);
        if (data.status === "failed") {
          setError(data.failedReason || "Ошибка генерации.");
        }
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err.message);
      }
    };

    poll();
    const interval = setInterval(poll, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    const loadJobs = async () => {
      try {
        const response = await fetch(`${API_URL}/api/jobs?limit=8`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.status === 401) {
          localStorage.removeItem("robosite_token");
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          throw new Error(data.error || "Не удалось получить список задач.");
        }
        if (!active) {
          return;
        }
        setJobs(data.jobs || []);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err.message);
      }
    };

    loadJobs();
    const interval = setInterval(loadJobs, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem("robosite_token");
    window.location.href = "/";
  };

  return (
    <main className="shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>RoboSite Studio</h1>
            <p className="lead">
              Создайте длинный, красивый лендинг: Vite + React + Tailwind. Мы соберём
              проект и выгрузим `src` и `build` в S3.
            </p>
          </div>
          <button className="button-ghost" type="button" onClick={handleLogout}>
            Выйти
          </button>
        </div>

        <form className="form" onSubmit={submitJob}>
          <div className="field">
            <label htmlFor="clientId">Client ID</label>
            <input
              id="clientId"
              type="text"
              placeholder="acme"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="prompt">Промпт</label>
            <textarea
              id="prompt"
              placeholder="Лэндинг для премиальной кофейни с сезонными напитками..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Отправляем..." : "Запустить генерацию"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Статус генерации</h2>
        <div className="status">
          <div className="status-pill">
            {formatStatus(status)}
          </div>
          <div className="kv">
            <strong>Job ID</strong>
            <span className="muted">{jobId || "—"}</span>
          </div>
          {progress?.step ? (
            <div className="kv">
              <strong>Этап</strong>
              <span className="muted">{progress.step}</span>
            </div>
          ) : null}
          {result?.buildUrl ? (
            <div className="kv">
              <strong>Build URL</strong>
              <span className="muted">{result.buildUrl}</span>
            </div>
          ) : null}
          {result?.s3Build ? (
            <div className="kv">
              <strong>S3 build</strong>
              <span className="muted">{result.s3Build}</span>
            </div>
          ) : null}
          {result?.s3Src ? (
            <div className="kv">
              <strong>S3 src</strong>
              <span className="muted">{result.s3Src}</span>
            </div>
          ) : null}
          {error ? (
            <div className="kv">
              <strong>Ошибка</strong>
              <span className="muted">{error}</span>
            </div>
          ) : null}
        </div>
        {jobs.length ? (
          <div className="status" style={{ marginTop: "24px" }}>
            <strong>Последние задачи</strong>
            {jobs.map((job) => (
              <div className="kv" key={job.id}>
                <strong>{job.clientId}</strong>
                <span className="muted">
                  {formatStatus(job.status)} · {job.id}
                </span>
                {job.result?.buildUrl ? (
                  <span className="muted">{job.result.buildUrl}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
