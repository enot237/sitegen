export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#ffffff] via-[#f7f6f2] to-[#edf6ff] text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-6">
        <div className="text-lg font-semibold tracking-tight">RoboSite</div>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
          <a href="#product" className="hover:text-slate-900">О продукте</a>
          <a href="#features" className="hover:text-slate-900">Фичи</a>
          <a href="#team" className="hover:text-slate-900">Команда</a>
          <a href="#stack" className="hover:text-slate-900">Технологии</a>
          <a href="#contacts" className="hover:text-slate-900">Контакты</a>
        </nav>
        <a
          href="/login"
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:-translate-y-0.5 hover:shadow"
        >
          Login
        </a>
      </header>

      <section id="product" className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">AI generation studio</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
            RoboSite превращает идеи в красивые лендинги за минуты.
          </h1>
          <p className="mt-5 text-base text-slate-600">
            Вы описываете продукт — мы автоматически создаём проект на React + Tailwind,
            собираем его и публикуем в S3. Всё, что нужно, — один промпт.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/login"
              className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5"
            >
              Перейти в кабинет
            </a>
            <a
              href="#features"
              className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700"
            >
              Посмотреть фичи
            </a>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-card">
          <h3 className="text-lg font-semibold text-slate-900">Как это работает</h3>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li>1. Вводите client_id и промпт.</li>
            <li>2. RoboSite генерирует проект и билдит его.</li>
            <li>3. Готовый сайт появляется в S3 и CDN.</li>
          </ol>
          <div className="mt-6 grid gap-2 text-xs text-slate-500">
            <span>Формат: Vite + React + Tailwind</span>
            <span>Публикация: S3 + CDN</span>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-slate-900">Фичи продукта</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Длинные лендинги", "Готовые блоки: hero, преимущества, кейсы, тарифы, FAQ и CTA."],
            ["Автосборка", "Собираем Vite build и сразу выкладываем в S3 без ручных шагов."],
            ["Параллельные генерации", "Очередь задач и воркеры позволяют масштабироваться."],
            ["Контроль качества", "Фиксируем JSON, сохраняем логи, следим за токенами."]
          ].map(([title, body]) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-card">
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="team" className="mx-auto w-full max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-slate-900">Команда</h2>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-card">
          <h3 className="text-lg font-semibold">Анисимов Евгений</h3>
          <p className="mt-2 text-sm text-slate-600">Основатель и продуктовый лидер RoboSite.</p>
        </div>
      </section>

      <section id="stack" className="mx-auto w-full max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-slate-900">Технологии простыми словами</h2>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-card">
          <ul className="space-y-3 text-sm text-slate-600">
            <li>ИИ пишет код, а сервер проверяет и публикует его на хостинге.</li>
            <li>Каждый сайт — это готовый проект, который можно масштабировать.</li>
            <li>Файлы хранятся в S3 и быстро раздаются через CDN.</li>
            <li>Очередь задач помогает обрабатывать несколько генераций параллельно.</li>
          </ul>
        </div>
      </section>

      <section id="contacts" className="mx-auto w-full max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-slate-900">Контакты</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-card">
            <h3 className="text-lg font-semibold">Связь</h3>
            <p className="mt-2 text-sm text-slate-600">hello@robosite.dev</p>
            <p className="text-sm text-slate-600">+7 (999) 000-00-00</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-card">
            <h3 className="text-lg font-semibold">Адрес</h3>
            <p className="mt-2 text-sm text-slate-600">Москва, ул. Примерная, 10</p>
            <p className="text-sm text-slate-600">БЦ "Orbit"</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-card">
            <h3 className="text-lg font-semibold">Соцсети</h3>
            <p className="mt-2 text-sm text-slate-600">@robosite</p>
            <p className="text-sm text-slate-600">t.me/robosite</p>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 pb-12 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <span>RoboSite © 2026. Все права защищены.</span>
        <a href="/login" className="text-slate-600 hover:text-slate-900">Login</a>
      </footer>
    </main>
  );
}
