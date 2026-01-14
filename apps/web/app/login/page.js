"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  const submit = async () => {
    if (isRegister && password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Auth failed.");
      }
      localStorage.setItem("robosite_token", data.token);
      window.location.href = "/studio";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="panel auth-panel">
        <h1>RoboSite Studio</h1>
        <p className="lead">Войдите или зарегистрируйтесь, чтобы запускать генерации.</p>

        <form className="form" onSubmit={(event) => event.preventDefault()}>
          <div className="auth-toggle">
            <button
              type="button"
              className={mode === "login" ? "toggle active" : "toggle"}
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              Вход
            </button>
            <button
              type="button"
              className={mode === "register" ? "toggle active" : "toggle"}
              onClick={() => {
                setMode("register");
                setError(null);
              }}
            >
              Регистрация
            </button>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Минимум 6 символов"
              required
            />
          </div>
          {isRegister ? (
            <div className="field">
              <label htmlFor="confirmPassword">Повторите пароль</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Введите пароль еще раз"
                required
              />
            </div>
          ) : null}
          <button type="button" onClick={submit} disabled={loading}>
            {loading
              ? "Отправляем..."
              : isRegister
                ? "Создать аккаунт"
                : "Войти"}
          </button>
          {error ? (
            <div className="kv">
              <strong>Ошибка</strong>
              <span className="muted">{error}</span>
            </div>
          ) : null}
          <a className="muted-link" href="/">← На лендинг</a>
        </form>
      </section>
    </main>
  );
}
