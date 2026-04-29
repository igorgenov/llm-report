'use client';

import { useMemo, useState } from 'react';

const sample = `https://example.com\nhttps://www.wikipedia.org/`;

function Logo() {
  return (
    <svg
      aria-label="Inweb"
      viewBox="0 0 168 36"
      width="112"
      height="24"
      fill="none"
      className="brand-logo"
    >
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 8.5v19" />
        <path d="M17 14.5v13" />
        <path d="M17 14.5c2.2-2.8 4.7-4.2 7.5-4.2c4.6 0 7.5 3.1 7.5 8.6v8.6" />
        <path d="M39 11l5.2 16l4.8-11.2L53.8 27L59 11" />
        <path d="M67.5 19c0-5 3.6-8.7 8.4-8.7c4.6 0 8 3.4 8 8.4c0 .9-.1 1.6-.2 2.1H71.3c.7 3.2 3 5.1 6.4 5.1c2.1 0 3.9-.6 5.7-2" />
        <path d="M92 27V6.5" />
        <path d="M92 19c0-5.1 3.3-8.7 8-8.7c4.7 0 8.1 3.7 8.1 8.7s-3.4 8.7-8.1 8.7c-4.7 0-8-3.6-8-8.7Z" />
        <path d="M115 11l5.2 16l4.8-11.2l4.8 11.2l5.2-16" />
      </g>
    </svg>
  );
}

export default function Page() {
  const [theme, setTheme] = useState('light');
  const [urls, setUrls] = useState(sample);
  const [loading, setLoading] = useState(false);
  const [reportHtml, setReportHtml] = useState('');
  const [error, setError] = useState('');

  const count = useMemo(
    () => urls.split(/\r?\n|,|;/).map((v) => v.trim()).filter(Boolean).length,
    [urls]
  );

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setReportHtml('');
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка генерации отчёта');
      setReportHtml(data.html || '');
    } catch (err) {
      setError(err.message || 'Ошибка запроса');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-grid">
        <section className="hero-card">
          <header className="topbar">
            <div className="brand">
              <Logo />
              <div>
                <div className="brand-name">LLM отчёт по доступности</div>
              </div>
            </div>
            <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Переключить тему">
              {theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
            </button>
          </header>

          <div className="hero-copy">
            <h1>Проверь список URL на доступность для LLM-ботов прямо в браузере.</h1>
            <p>
              Вставь ссылки списком, запусти проверку и получи HTML-отчёт сразу на этой же странице:
              c критическими проблемами, рекомендациями и разбором по ботам.
            </p>
          </div>

          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-label">URL сейчас</span>
              <strong className="stat-value">{count}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Режим</span>
              <strong className="stat-value">In-page HTML report</strong>
            </div>
          </div>
        </section>

        <section className="panel-card">
          <form onSubmit={onSubmit} className="form-stack">
            <div className="field-head">
              <label htmlFor="urls">Список URL</label>
              <span>До 12 URL за запуск</span>
            </div>
            <textarea
              id="urls"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="https://example.com&#10;https://site.com/page"
              rows={10}
            />

            <div className="inline-note">
              Используй по одному URL на строку.
            </div>

            <div className="actions-row">
              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'Собираю отчёт…' : 'Запустить проверку'}
              </button>
              <button className="ghost-btn" type="button" onClick={() => setUrls(sample)}>
                Подставить пример
              </button>
            </div>
          </form>
        </section>
      </div>

      {error ? <section className="feedback error">{error}</section> : null}
      {loading ? <section className="feedback">Проверка может занять до минуты.</section> : null}
      {reportHtml ? <section className="report-host" dangerouslySetInnerHTML={{ __html: reportHtml }} /> : null}

      <style jsx>{`
        .page-shell {
          width: min(1200px, calc(100% - 32px));
          margin: 0 auto;
          padding: 28px 0 56px;
        }
        .page-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.95fr;
          gap: 18px;
          align-items: start;
        }
        .hero-card,
        .panel-card,
        .feedback,
        .report-host {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-sm);
        }
        .hero-card {
          padding: 24px;
          display: grid;
          gap: 24px;
          min-height: 100%;
        }
        .panel-card {
          padding: 24px;
        }
        .topbar,
        .brand,
        .actions-row,
        .hero-stats {
          display: flex;
          align-items: center;
        }
        .topbar,
        .actions-row {
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .brand { gap: 12px; }
        .eyebrow {
          font-size: var(--text-xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-text-muted);
        }
        .brand-name {
          font-size: var(--text-lg);
          font-weight: 700;
        }
        .theme-toggle,
        .ghost-btn,
        .primary-btn {
          min-height: 44px;
          border-radius: 999px;
          padding: 0 18px;
          border: 1px solid var(--color-border);
        }
        .theme-toggle,
        .ghost-btn {
          background: var(--color-surface-2);
          color: var(--color-text);
        }
        .primary-btn {
          background: var(--color-primary);
          color: var(--color-text-inverse);
          border-color: var(--color-primary);
          font-weight: 700;
        }
        .primary-btn:hover { background: var(--color-primary-hover); }
        .primary-btn:disabled { opacity: 0.7; cursor: wait; }
        .hero-copy h1 {
          margin: 0;
          font-size: clamp(2rem, 1.4rem + 2vw, 3.4rem);
          line-height: 1.08;
          max-width: 14ch;
        }
        .hero-copy p {
          margin: 14px 0 0;
          color: var(--color-text-muted);
          max-width: 62ch;
        }
        .hero-stats {
          gap: 12px;
          flex-wrap: wrap;
        }
        .stat-card {
          flex: 1 1 220px;
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 16px;
        }
        .stat-label {
          display: block;
          font-size: var(--text-xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-text-muted);
        }
        .stat-value {
          display: block;
          margin-top: 8px;
          font-size: var(--text-lg);
        }
        .form-stack {
          display: grid;
          gap: 16px;
        }
        .field-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          flex-wrap: wrap;
        }
        .field-head label {
          font-weight: 700;
        }
        .field-head span,
        .inline-note {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }
        textarea {
          width: 100%;
          resize: vertical;
          min-height: 260px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border);
          background: var(--color-surface-2);
          color: var(--color-text);
          padding: 16px;
          line-height: 1.6;
          font-size: var(--text-base);
        }
        .feedback,
        .report-host {
          margin-top: 18px;
          padding: 20px;
        }
        .error {
          color: var(--color-error);
          background: var(--color-error-highlight);
          border-color: color-mix(in srgb, var(--color-error) 20%, var(--color-border));
        }
        @media (max-width: 920px) {
          .page-grid { grid-template-columns: 1fr; }
          .hero-copy h1 { max-width: none; }
        }
      `}</style>
    </main>
  );
}
