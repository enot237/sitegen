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

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
};

export default function StudioPage() {
  const [token, setToken] = useState(null);
  const [activeTab, setActiveTab] = useState("account");
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "", company: "" });
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [billing, setBilling] = useState(null);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [siteForm, setSiteForm] = useState({ name: "", description: "", notes: "", status: "draft" });
  const [siteJobs, setSiteJobs] = useState([]);
  const [siteLogs, setSiteLogs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [jobResult, setJobResult] = useState(null);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [modalForm, setModalForm] = useState({
    name: "",
    description: "",
    notes: "",
    prompt: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedSite = useMemo(
    () => sites.find((site) => String(site.id) === String(selectedSiteId)),
    [sites, selectedSiteId]
  );

  const authFetch = async (url, options = {}) => {
    if (!token) {
      throw new Error("Not authenticated.");
    }
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    if (response.status === 401) {
      localStorage.removeItem("robosite_token");
      window.location.href = "/login";
      return null;
    }
    return response;
  };

  useEffect(() => {
    const stored = localStorage.getItem("robosite_token");
    if (!stored) {
      window.location.href = "/login";
      return;
    }
    setToken(stored);
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    const loadProfile = async () => {
      const response = await authFetch(`${API_URL}/api/me`);
      if (!response) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Не удалось загрузить профиль.");
        return;
      }
      setProfile(data.user);
      setProfileForm({
        fullName: data.user?.full_name || "",
        phone: data.user?.phone || "",
        company: data.user?.company || ""
      });
    };

    const loadSites = async () => {
      const response = await authFetch(`${API_URL}/api/sites`);
      if (!response) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Не удалось загрузить сайты.");
        return;
      }
      setSites(data.sites || []);
      if (!selectedSiteId && data.sites?.length) {
        setSelectedSiteId(data.sites[0].id);
      }
    };

    const loadBilling = async () => {
      const response = await authFetch(`${API_URL}/api/billing/summary`);
      if (!response) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Не удалось загрузить биллинг.");
        return;
      }
      setBilling(data);
    };

    loadProfile();
    loadSites();
    loadBilling();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedSiteId) {
      return;
    }

    const loadJobs = async () => {
      const response = await authFetch(`${API_URL}/api/sites/${selectedSiteId}/jobs?limit=12`);
      if (!response) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Не удалось загрузить генерации.");
        return;
      }
      setSiteJobs(data.jobs || []);
    };

    const loadLogs = async () => {
      const response = await authFetch(`${API_URL}/api/sites/${selectedSiteId}/logs?limit=200`);
      if (!response) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Не удалось загрузить логи.");
        return;
      }
      setSiteLogs(data.logs || []);
    };

    loadJobs();
    loadLogs();
  }, [token, selectedSiteId]);

  useEffect(() => {
    if (selectedSite) {
      setSiteForm({
        name: selectedSite.name || "",
        description: selectedSite.description || "",
        notes: selectedSite.notes || "",
        status: selectedSite.status || "draft"
      });
    }
  }, [selectedSite]);

  const refreshSites = async () => {
    const response = await authFetch(`${API_URL}/api/sites`);
    if (!response) return;
    const data = await response.json();
    if (response.ok) {
      setSites(data.sites || []);
    }
  };

  const handleProfileSave = async () => {
    setError(null);
    const response = await authFetch(`${API_URL}/api/me`, {
      method: "PUT",
      body: JSON.stringify({
        fullName: profileForm.fullName,
        phone: profileForm.phone,
        company: profileForm.company
      })
    });
    if (!response) return;
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Не удалось сохранить профиль.");
      return;
    }
    setProfile(data.user);
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.current || !passwordForm.next) {
      setError("Заполните все поля пароля.");
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setError(null);
    const response = await authFetch(`${API_URL}/api/me/password`, {
      method: "POST",
      body: JSON.stringify({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.next
      })
    });
    if (!response) return;
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Не удалось сменить пароль.");
      return;
    }
    setPasswordForm({ current: "", next: "", confirm: "" });
    setShowPasswordForm(false);
  };

  const handleUpdateSite = async () => {
    if (!selectedSiteId) return;
    setError(null);
    const response = await authFetch(`${API_URL}/api/sites/${selectedSiteId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: siteForm.name,
        description: siteForm.description,
        notes: siteForm.notes,
        status: siteForm.status
      })
    });
    if (!response) return;
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Не удалось обновить сайт.");
      return;
    }
    await refreshSites();
  };

  const handleDeleteSite = async () => {
    if (!selectedSiteId) return;
    if (!confirm("Удалить сайт?")) return;
    const response = await authFetch(`${API_URL}/api/sites/${selectedSiteId}`, {
      method: "DELETE"
    });
    if (!response) return;
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Не удалось удалить сайт.");
      return;
    }
    await refreshSites();
    setSelectedSiteId(null);
    setSiteJobs([]);
    setSiteLogs([]);
  };

  const openCreateModal = () => {
    setModalMode("create");
    setModalForm({ name: "", description: "", notes: "", prompt: "" });
    setModalOpen(true);
  };

  const openGenerateModal = () => {
    setModalMode("generate");
    setModalForm({ name: "", description: "", notes: "", prompt: "" });
    setModalOpen(true);
  };

  const handleModalSubmit = async () => {
    if (!modalForm.prompt.trim()) {
      setError("Нужен промпт для генерации.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let siteId = selectedSiteId;
      if (modalMode === "create") {
        if (!modalForm.name.trim()) {
          throw new Error("Название сайта обязательно.");
        }
        const response = await authFetch(`${API_URL}/api/sites`, {
          method: "POST",
          body: JSON.stringify({
            name: modalForm.name,
            description: modalForm.description,
            notes: modalForm.notes
          })
        });
        if (!response) return;
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Не удалось создать сайт.");
        }
        siteId = data.site.id;
        setSelectedSiteId(siteId);
      }

      if (!siteId) {
        throw new Error("Не выбран сайт.");
      }

      const jobResponse = await authFetch(`${API_URL}/api/jobs`, {
        method: "POST",
        body: JSON.stringify({ siteId, prompt: modalForm.prompt })
      });
      if (!jobResponse) return;
      const jobData = await jobResponse.json();
      if (!jobResponse.ok) {
        throw new Error(jobData.error || "Не удалось запустить генерацию.");
      }
      setActiveJobId(jobData.id);
      setJobStatus("queued");
      setJobResult(null);
      await refreshSites();
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!activeJobId || !token) return;

    let active = true;

    const poll = async () => {
      const response = await authFetch(`${API_URL}/api/jobs/${activeJobId}`);
      if (!response) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Не удалось получить статус.");
        return;
      }
      if (!active) return;
      setJobStatus(data.status);
      setJobResult(data.result || null);
      if (data.status === "failed") {
        setError(data.failedReason || "Ошибка генерации.");
      }
      if (data.status === "completed") {
        await refreshSites();
      }
    };

    poll();
    const interval = setInterval(poll, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeJobId, token]);

  const logout = () => {
    localStorage.removeItem("robosite_token");
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold">RoboSite</span>
            <nav className="hidden gap-4 text-sm text-slate-500 md:flex">
              {[
                { key: "account", label: "Мой аккаунт" },
                { key: "sites", label: "Мои сайты" },
                { key: "billing", label: "Биллинг" }
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={
                    activeTab === tab.key
                      ? "text-slate-900"
                      : "text-slate-500 hover:text-slate-800"
                  }
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 md:inline">{profile?.email}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {activeTab === "account" ? (
          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <h2 className="text-xl font-semibold">Профиль</h2>
              <p className="mt-2 text-sm text-slate-500">Обновите данные аккаунта и контакты.</p>
              <div className="mt-6 grid gap-4">
                <div>
                  <label className="text-xs text-slate-500">ФИО</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    value={profileForm.fullName}
                    onChange={(event) => setProfileForm({ ...profileForm, fullName: event.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Телефон</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    value={profileForm.phone}
                    onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Компания</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    value={profileForm.company}
                    onChange={(event) => setProfileForm({ ...profileForm, company: event.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Почта</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    value={profile?.email || ""}
                    readOnly
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleProfileSave}
                className="mt-6 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-soft"
              >
                Сохранить изменения
              </button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <h2 className="text-xl font-semibold">Безопасность</h2>
              <p className="mt-2 text-sm text-slate-500">Смените пароль для доступа к кабинету.</p>
              <button
                type="button"
                onClick={() => setShowPasswordForm((prev) => !prev)}
                className="mt-4 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700"
              >
                {showPasswordForm ? "Скрыть форму" : "Сменить пароль"}
              </button>
              {showPasswordForm ? (
                <div className="mt-4 grid gap-3">
                  <input
                    type="password"
                    placeholder="Текущий пароль"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    value={passwordForm.current}
                    onChange={(event) => setPasswordForm({ ...passwordForm, current: event.target.value })}
                  />
                  <input
                    type="password"
                    placeholder="Новый пароль"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    value={passwordForm.next}
                    onChange={(event) => setPasswordForm({ ...passwordForm, next: event.target.value })}
                  />
                  <input
                    type="password"
                    placeholder="Повторите пароль"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    value={passwordForm.confirm}
                    onChange={(event) => setPasswordForm({ ...passwordForm, confirm: event.target.value })}
                  />
                  <button
                    type="button"
                    onClick={handlePasswordChange}
                    className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                  >
                    Обновить пароль
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeTab === "sites" ? (
          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white shadow-card">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-xl font-semibold">Мои сайты</h2>
                <p className="mt-2 text-sm text-slate-500">Выберите сайт, чтобы посмотреть логи и запуски.</p>
              </div>
              <div className="flex-1 space-y-2 overflow-auto px-4 py-4">
                {sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => setSelectedSiteId(site.id)}
                    className={
                      String(site.id) === String(selectedSiteId)
                        ? "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left"
                        : "w-full rounded-2xl border border-transparent px-4 py-4 text-left hover:bg-slate-50"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{site.name}</div>
                        <div className="text-xs text-slate-500">{site.clientId}</div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>{site.tokensTotal || 0} токенов</div>
                        <div>{formatDate(site.lastGeneratedAt)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{site.status}</span>
                      {site.buildUrl ? (
                        <a
                          href={site.buildUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-slate-700 hover:text-slate-900"
                        >
                          Открыть сайт →
                        </a>
                      ) : (
                        <span className="text-slate-400">Нет билда</span>
                      )}
                    </div>
                  </button>
                ))}
                {!sites.length ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                    Пока нет сайтов. Создайте первый и запустите генерацию.
                  </div>
                ) : null}
              </div>
              <div className="border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
                >
                  Создать новый сайт
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                {selectedSite ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">{selectedSite.name}</h3>
                        <p className="text-sm text-slate-500">{selectedSite.description || "Описание не задано"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={openGenerateModal}
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                        >
                          Новая генерация
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteSite}
                          className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-500"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3">
                      <div className="grid gap-2 text-xs text-slate-500">
                        <span>client_id: {selectedSite.clientId}</span>
                        <span>Статус: {selectedSite.status}</span>
                        <span>Токенов всего: {selectedSite.tokensTotal || 0}</span>
                      </div>
                      <textarea
                        className="min-h-[80px] rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        placeholder="Описание"
                        value={siteForm.description}
                        onChange={(event) => setSiteForm({ ...siteForm, description: event.target.value })}
                      />
                      <textarea
                        className="min-h-[80px] rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        placeholder="Заметки"
                        value={siteForm.notes}
                        onChange={(event) => setSiteForm({ ...siteForm, notes: event.target.value })}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                          value={siteForm.name}
                          onChange={(event) => setSiteForm({ ...siteForm, name: event.target.value })}
                        />
                        <select
                          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                          value={siteForm.status}
                          onChange={(event) => setSiteForm({ ...siteForm, status: event.target.value })}
                        >
                          <option value="draft">draft</option>
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                        </select>
                        <button
                          type="button"
                          onClick={handleUpdateSite}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600"
                        >
                          Сохранить
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Выберите сайт слева.</p>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                <h3 className="text-lg font-semibold">Последние генерации</h3>
                <div className="mt-4 grid gap-3">
                  {siteJobs.map((job) => (
                    <div key={job.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{formatStatus(job.status)}</div>
                          <div className="text-xs text-slate-500">{job.id}</div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>{job.tokensTotal || 0} токенов</div>
                          <div>{job.model || ""}</div>
                        </div>
                      </div>
                      {job.result?.buildUrl ? (
                        <a
                          href={job.result.buildUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-xs font-semibold text-slate-700"
                        >
                          Открыть билд →
                        </a>
                      ) : null}
                    </div>
                  ))}
                  {!siteJobs.length ? (
                    <div className="text-sm text-slate-400">Пока нет генераций.</div>
                  ) : null}
                </div>
                {jobStatus ? (
                  <div className="mt-4 text-xs text-slate-500">Статус последней задачи: {formatStatus(jobStatus)}</div>
                ) : null}
                {jobResult?.buildUrl ? (
                  <div className="mt-1 text-xs text-slate-500">Build URL: {jobResult.buildUrl}</div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                <h3 className="text-lg font-semibold">Логи событий</h3>
                <div className="mt-4 space-y-2 text-xs text-slate-500">
                  {siteLogs.map((log, index) => (
                    <div key={`${log.createdAt}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span>{log.message}</span>
                        <span>{formatDate(log.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">{log.jobId}</div>
                    </div>
                  ))}
                  {!siteLogs.length ? (
                    <div className="text-sm text-slate-400">Пока нет событий.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "billing" ? (
          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <h2 className="text-xl font-semibold">Текущий план</h2>
              <p className="mt-2 text-sm text-slate-500">Стартовый тариф. Настройка биллинга в работе.</p>
              <div className="mt-6 grid gap-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Лимит генераций</span>
                  <span>100 / месяц</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Очередь задач</span>
                  <span>Включена</span>
                </div>
              </div>
              <button
                type="button"
                className="mt-6 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700"
              >
                Изменить план
              </button>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <h2 className="text-xl font-semibold">Статистика</h2>
              <div className="mt-4 grid gap-4 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Всего генераций</span>
                  <span>{billing?.jobsCount ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Токенов всего</span>
                  <span>{billing?.tokensTotal ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Токенов в этом месяце</span>
                  <span>{billing?.tokensMonth ?? "—"}</span>
                </div>
              </div>
              <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Биллинг рассчитывается по фактическому количеству токенов.
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {modalMode === "create" ? "Создать сайт" : "Новая генерация"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {modalMode === "create"
                    ? "Опишите сайт и сразу запустите генерацию."
                    : "Запустите новую генерацию для выбранного сайта."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              {modalMode === "create" ? (
                <>
                  <input
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="Название сайта"
                    value={modalForm.name}
                    onChange={(event) => setModalForm({ ...modalForm, name: event.target.value })}
                  />
                  <textarea
                    className="min-h-[90px] rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="Описание сайта"
                    value={modalForm.description}
                    onChange={(event) => setModalForm({ ...modalForm, description: event.target.value })}
                  />
                  <textarea
                    className="min-h-[90px] rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="Заметки для команды"
                    value={modalForm.notes}
                    onChange={(event) => setModalForm({ ...modalForm, notes: event.target.value })}
                  />
                </>
              ) : null}
              <textarea
                className="min-h-[120px] rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                placeholder="Промпт для генерации"
                value={modalForm.prompt}
                onChange={(event) => setModalForm({ ...modalForm, prompt: event.target.value })}
              />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs text-slate-400">Сайт появится в S3 автоматически.</span>
              <button
                type="button"
                onClick={handleModalSubmit}
                disabled={isSubmitting}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isSubmitting ? "Запускаем..." : "Сгенерировать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
