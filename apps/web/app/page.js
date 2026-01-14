export default function LandingPage() {
  return (
    <main className="landing">
      <header className="nav">
        <div className="brand">RoboSite</div>
        <nav className="nav-links">
          <a href="#product">О продукте</a>
          <a href="#features">Фичи</a>
          <a href="#team">Команда</a>
          <a href="#stack">Технологии</a>
          <a href="#contacts">Контакты</a>
          <a className="button-ghost" href="/login">Login</a>
        </nav>
      </header>

      <section id="product" className="hero">
        <div>
          <p className="eyebrow">Генератор лендингов под ключ</p>
          <h1 className="hero-title">
            RoboSite собирает красивые сайты за минуты, без ручной верстки.
          </h1>
          <p className="hero-lead">
            Вы описываете идею, мы превращаем её в полноценный лендинг на React + Tailwind, 
            собираем и публикуем в S3. Подходит для агентств, студий и команд продаж.
          </p>
          <div className="hero-actions">
            <a className="button-primary" href="/login">Перейти в кабинет</a>
            <a className="button-secondary" href="#features">Посмотреть фичи</a>
          </div>
        </div>
        <div className="hero-card">
          <h3>Как работает</h3>
          <ol>
            <li>Вводите client_id и промпт.</li>
            <li>RoboSite генерирует проект и билдит его.</li>
            <li>Готовый сайт автоматически появляется в S3.</li>
          </ol>
          <div className="hero-meta">
            <span>Формат: Vite + React + Tailwind</span>
            <span>Публикация: S3 + CDN</span>
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <h2 className="section-title">Фичи</h2>
        <div className="card-grid">
          <article className="card">
            <h3>Длинные лендинги</h3>
            <p>Hero, преимущества, кейсы, тарифы, FAQ и сильный CTA — сразу в одном билде.</p>
          </article>
          <article className="card">
            <h3>Автосборка</h3>
            <p>Мы сами запускаем Vite build и загружаем статику в S3, без ручных шагов.</p>
          </article>
          <article className="card">
            <h3>Контроль качества</h3>
            <p>Четкие промпты и повторная починка JSON, чтобы не терять генерации.</p>
          </article>
          <article className="card">
            <h3>Готово к масштабированию</h3>
            <p>Очередь задач и воркеры позволяют обрабатывать много запросов параллельно.</p>
          </article>
        </div>
      </section>

      <section id="team" className="section">
        <h2 className="section-title">Команда</h2>
        <div className="card-grid single">
          <article className="card">
            <h3>Анисимов Евгений</h3>
            <p>Основатель и продуктовый лидер RoboSite.</p>
          </article>
        </div>
      </section>

      <section id="stack" className="section">
        <h2 className="section-title">Технологии простыми словами</h2>
        <div className="card">
          <ul className="stack-list">
            <li>Сайт собирается автоматически как конструктор из готовых блоков.</li>
            <li>ИИ пишет код, а сервер проверяет и публикует его на хостинге.</li>
            <li>Все файлы складываются в S3, чтобы быстро раздавать через CDN.</li>
            <li>Очередь задач помогает делать сразу много сайтов без сбоев.</li>
          </ul>
        </div>
      </section>

      <section id="contacts" className="section">
        <h2 className="section-title">Контакты</h2>
        <div className="card-grid">
          <article className="card">
            <h3>Связь</h3>
            <p>hello@robosite.dev</p>
            <p>+7 (999) 000-00-00</p>
          </article>
          <article className="card">
            <h3>Адрес</h3>
            <p>Москва, ул. Примерная, 10</p>
            <p>Бизнес-центр "Orbit"</p>
          </article>
          <article className="card">
            <h3>Соцсети</h3>
            <p>@robosite</p>
            <p>t.me/robosite</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <span>RoboSite © 2026. Все права защищены.</span>
        <a href="/login">Login</a>
      </footer>
    </main>
  );
}
