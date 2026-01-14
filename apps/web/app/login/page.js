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
    <main className="min-h-screen bg-gradient-to-br from-white via-[#f7f6f2] to-[#edf6ff] flex items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-card backdrop-blur">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">RoboSite</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Добро пожаловать</h1>
          <p className="mt-2 text-sm text-slate-500">Войдите или зарегистрируйтесь, чтобы работать с кабинетом.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1 text-sm">
          <button
            type="button"
            className={
              mode === "login"
                ? "rounded-full bg-white py-2 font-semibold text-slate-900 shadow"
                : "py-2 text-slate-500"
            }
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Вход
          </button>
          <button
            type="button"
            className={
              mode === "register"
                ? "rounded-full bg-white py-2 font-semibold text-slate-900 shadow"
                : "py-2 text-slate-500"
            }
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            Регистрация
          </button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={(event) => event.preventDefault()}>
          <div className="grid gap-2 text-sm">
            <label htmlFor="email" className="text-slate-500">Почта</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
              required
            />
          </div>
          <div className="grid gap-2 text-sm">
            <label htmlFor="password" className="text-slate-500">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Минимум 6 символов"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
              required
            />
          </div>
          {isRegister ? (
            <div className="grid gap-2 text-sm">
              <label htmlFor="confirmPassword" className="text-slate-500">Повторите пароль</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Введите пароль еще раз"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                required
              />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading ? "Отправляем..." : isRegister ? "Создать аккаунт" : "Войти"}
          </button>
        </form>

        <a href="/" className="mt-6 inline-flex text-sm text-slate-400 hover:text-slate-600">
          ← На лендинг
        </a>
      </section>
    </main>
  );
}
