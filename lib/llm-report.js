const BOTS = [
  ['GPTBot', 'gptbot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot'],
  ['ChatGPT-User', 'chatgpt-user', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'],
  ['ClaudeBot', 'claudebot', 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot)'],
  ['anthropic-ai', 'anthropic-ai', 'Mozilla/5.0 (compatible; anthropic-ai/1.0; +https://www.anthropic.com/bot)'],
  ['PerplexityBot', 'perplexitybot', 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://www.perplexity.ai/perplexitybot)'],
  ['Google-Extended', 'google-extended', 'Mozilla/5.0 (compatible; Google-Extended; +https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers)'],
  ['CCBot', 'ccbot', 'Mozilla/5.0 (compatible; CCBot/2.0; +https://commoncrawl.org/faq/)'],
  ['Bytespider', 'bytespider', 'Mozilla/5.0 (compatible; Bytespider; +https://bytedance.com/)']
];

const CRITICAL_HTTP_CODES = new Set([401, 403, 423, 429]);

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeUrl(raw) {
  return raw.trim().split('#')[0].trim();
}

function parseInputUrls(raw) {
  return [...new Set(raw.split(/\r?\n|,|;/).map(normalizeUrl).filter(Boolean))];
}

function getPathname(url) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '/';
  }
}

async function limitedFetch(url, userAgent, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': userAgent,
        range: 'bytes=0-119999'
      },
      cache: 'no-store'
    });
    const body = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      finalUrl: response.url,
      redirected: response.redirected,
      body: body.slice(0, 120000)
    };
  } catch (error) {
    return {
      status: 0,
      contentType: '',
      finalUrl: url,
      redirected: false,
      body: '',
      error: error?.message || 'fetch failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}

function bodyCheck(body) {
  const bodyWithoutScripts = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  const text = bodyWithoutScripts.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const canonicalMatch = body.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)/i) || body.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical/i);
  const metaRobotsMatch = body.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i) || body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots/i);
  return {
    textChars: text.length,
    canonicalUrl: canonicalMatch ? canonicalMatch[1].trim() : '',
    metaRobots: metaRobotsMatch ? metaRobotsMatch[1].trim() : ''
  };
}

function parseRobots(text) {
  const rules = new Map();
  let current = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line.includes(':')) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      current = [value.toLowerCase()];
      if (!rules.has(current[0])) rules.set(current[0], { allow: [], disallow: [] });
    }
    if ((key === 'allow' || key === 'disallow') && current.length) {
      for (const agent of current) {
        if (!rules.has(agent)) rules.set(agent, { allow: [], disallow: [] });
        rules.get(agent)[key].push(value);
      }
    }
  }
  return rules;
}

function robotsAllowed(robotsText, agent, path) {
  if (!robotsText) return 'unknown';
  const rules = parseRobots(robotsText);
  const selected = rules.get(agent.toLowerCase()) || rules.get('*');
  if (!selected) return 'unknown';
  const allow = selected.allow.filter(Boolean);
  const disallow = selected.disallow.filter(Boolean);
  if (!disallow.length) return 'allowed';
  const bestDis = disallow.filter((r) => path.startsWith(r)).sort((a, b) => b.length - a.length)[0] || '';
  const bestAllow = allow.filter((r) => path.startsWith(r)).sort((a, b) => b.length - a.length)[0] || '';
  return bestDis && bestDis.length > bestAllow.length ? 'disallowed' : 'allowed';
}

function canonicalState(requestedUrl, finalUrl, canonicalUrl) {
  const requested = requestedUrl.replace(/\/$/, '');
  const final = finalUrl.replace(/\/$/, '');
  const canonical = (canonicalUrl || '').replace(/\/$/, '');
  if (!canonical) return 'missing';
  if (canonical === final || canonical === requested) return 'self';
  return 'other';
}

function metaRobotsState(value) {
  const normalized = (value || '').toLowerCase();
  if (!normalized) return 'missing';
  if (normalized.includes('noindex')) return 'noindex';
  return 'indexable';
}

function scoreBreakdown({ robotsStatus, httpCode, textChars, canonicalStateValue, metaRobotsStateValue }) {
  const http = httpCode >= 200 && httpCode < 300 ? 25 : httpCode >= 300 && httpCode < 400 ? 10 : 0;
  const robots = robotsStatus === 'allowed' ? 20 : robotsStatus === 'unknown' ? 10 : 0;
  const text = textChars >= 1500 ? 25 : textChars >= 700 ? 18 : textChars >= 300 ? 12 : textChars >= 50 ? 5 : 0;
  const canonical = canonicalStateValue === 'self' ? 15 : canonicalStateValue === 'other' ? 10 : 0;
  const meta = metaRobotsStateValue === 'indexable' ? 5 : metaRobotsStateValue === 'missing' ? 3 : 0;
  let score = http + robots + text + canonical + 10 + meta;
  const critical = CRITICAL_HTTP_CODES.has(httpCode) || (httpCode >= 500 && httpCode < 600) || robotsStatus === 'disallowed';
  if (critical) score = Math.min(score, 15);
  return { http, robots, text, canonical, redirects: 10, meta, score, critical };
}

function classifyScore(score) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function buildRecommendations(rows) {
  const result = [];
  const code423 = rows.filter((r) => r.httpCode === 423).map((r) => r.botName);
  const code403 = rows.filter((r) => [401, 403].includes(r.httpCode)).map((r) => r.botName);
  const code429 = rows.filter((r) => r.httpCode === 429).map((r) => r.botName);
  const robotsBlocked = rows.filter((r) => r.robotsStatus === 'disallowed').map((r) => r.botName);
  const avgText = rows.reduce((s, r) => s + r.textChars, 0) / rows.length;
  if (code423.length) result.push(`Разблокировать ${code423.join(', ')}; проверить WAF, Cloudflare, WordPress security plugin или lock middleware.`);
  if (code403.length) result.push(`Убрать 401/403-блокировки для ${code403.join(', ')} на публичной странице.`);
  if (code429.length) result.push(`Ослабить rate limiting или whitelist для ${code429.join(', ')}.`);
  if (robotsBlocked.length) result.push(`Разрешить нужных ботов в robots.txt: ${robotsBlocked.join(', ')}.`);
  if (avgText < 300) result.push('Добавить больше полезного текста в сырой HTML, а не только через JavaScript.');
  if (rows.some((r) => r.canonicalStateValue === 'missing')) result.push('Добавить rel=canonical для страницы.');
  return result.slice(0, 5).length ? result.slice(0, 5) : ['Серьёзных улучшений не требуется: страница уже выглядит доступной.'];
}

function buildCriticalIssues(rows) {
  const issues = [];
  const locked = rows.filter((r) => r.httpCode === 423).map((r) => r.botName);
  const forbidden = rows.filter((r) => [401, 403].includes(r.httpCode)).map((r) => r.botName);
  const rate = rows.filter((r) => r.httpCode === 429).map((r) => r.botName);
  const robots = rows.filter((r) => r.robotsStatus === 'disallowed').map((r) => r.botName);
  if (locked.length) issues.push(`Критично: ${locked.join(', ')} получают 423 Locked и не могут открыть страницу.`);
  if (forbidden.length) issues.push(`Критично: ${forbidden.join(', ')} получают 401/403 и не могут открыть страницу.`);
  if (rate.length) issues.push(`Критично: ${rate.join(', ')} получают 429 rate limit.`);
  if (robots.length) issues.push(`Критично: ${robots.join(', ')} запрещены в robots.txt для этого пути.`);
  return issues;
}

function why(row) {
  const httpText = row.httpCode >= 200 && row.httpCode < 300 ? 'Страница отвечает 2xx: +25.' : row.httpCode === 423 ? 'Страница отвечает 423 Locked: +0 и это критическая проблема доступа.' : 'Страница не даёт успешный ответ: +0.';
  const robotsText = row.robotsStatus === 'allowed' ? 'Путь разрешён в robots.txt: +20.' : row.robotsStatus === 'unknown' ? 'Явного правила не найдено: +10.' : 'Путь запрещён в robots.txt: +0 и это критическая проблема доступа.';
  const textText = row.textChars >= 1500 ? 'В сыром HTML много текста (>=1500): +25.' : row.textChars >= 700 ? 'В сыром HTML достаточно текста (700-1499): +18.' : row.textChars >= 300 ? 'В сыром HTML базовый объём текста (300-699): +12.' : row.textChars >= 50 ? 'В сыром HTML мало текста (50-299): +5.' : 'HTML почти пустой (<50): +0.';
  const canonicalText = row.canonicalStateValue === 'self' ? 'Есть self-canonical или canonical совпадает с URL: +15.' : row.canonicalStateValue === 'other' ? 'Есть canonical на другой URL: +10.' : 'Canonical не найден: +0.';
  const metaText = row.metaRobotsStateValue === 'indexable' ? 'Meta robots не запрещает индексирование: +5.' : row.metaRobotsStateValue === 'missing' ? 'Meta robots отсутствует: +3.' : 'Есть noindex: +0.';
  return `${httpText} ${robotsText} ${textText} ${canonicalText} Редиректов нет: +10. ${metaText}`;
}

export async function generateReport(rawUrls) {
  const urls = parseInputUrls(rawUrls).filter((url) => /^https?:\/\//i.test(url)).slice(0, 12);
  if (!urls.length) {
    return { html: '<div class="report-empty">Нужен хотя бы один корректный URL с http:// или https://</div>', totalUrls: 0 };
  }

  const allSummaries = [];
  for (const url of urls) {
    const robotsProbe = await limitedFetch(new URL('/robots.txt', url).toString(), 'Mozilla/5.0');
    const robotsText = robotsProbe.body || '';
    const rows = [];

    for (const [botName, agent, ua] of BOTS) {
      const response = await limitedFetch(url, ua);
      const checked = bodyCheck(response.body || '');
      const robotsStatus = robotsAllowed(robotsText, agent, getPathname(url));
      const canonicalStateValue = canonicalState(url, response.finalUrl, checked.canonicalUrl);
      const metaRobotsStateValue = metaRobotsState(checked.metaRobots);
      const score = scoreBreakdown({
        robotsStatus,
        httpCode: response.status,
        textChars: checked.textChars,
        canonicalStateValue,
        metaRobotsStateValue
      });
      rows.push({
        botName,
        httpCode: response.status,
        robotsStatus,
        textChars: checked.textChars,
        canonicalStateValue,
        metaRobotsStateValue,
        ...score
      });
    }

    const urlScore = Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length);
    allSummaries.push({
      url,
      urlScore,
      rows,
      criticalIssues: buildCriticalIssues(rows),
      recommendations: buildRecommendations(rows)
    });
  }

  const overall = Math.round(allSummaries.reduce((s, item) => s + item.urlScore, 0) / allSummaries.length);

  const html = `
  <div class="report-root">
    <style>
      .report-root{display:grid;gap:24px;margin-top:32px}
      .report-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
      .report-card,.report-url{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-xl);box-shadow:var(--shadow-sm)}
      .report-card{padding:18px}
      .report-label{font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted)}
      .report-value{font-size:clamp(2rem,1.5rem + 2vw,3.25rem);font-weight:700;line-height:1.05;margin-top:10px}
      .report-muted{color:var(--color-text-muted);margin-top:10px}
      .report-summary-table{width:100%;border-collapse:collapse;font-size:14px}
      .report-summary-table th,.report-summary-table td{padding:14px 12px;border-bottom:1px solid var(--color-divider);text-align:left;vertical-align:top}
      .report-summary-table th{font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em}
      .report-badge{display:inline-flex;align-items:center;justify-content:center;padding:7px 11px;border-radius:999px;font-weight:700;font-size:13px}
      .report-badge.high{background:var(--color-success-highlight);color:var(--color-success)}
      .report-badge.medium{background:var(--color-warning-highlight);color:var(--color-warning)}
      .report-badge.low{background:var(--color-error-highlight);color:var(--color-error)}
      .report-critical{display:inline-flex;margin-left:8px;padding:5px 9px;border-radius:999px;background:var(--color-error-highlight);color:var(--color-error);font-size:12px;font-weight:700}
      .report-url{padding:20px}
      .report-url + .report-url{margin-top:0}
      .report-url-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .report-url-title{font-weight:700;word-break:break-word}
      .report-url-meta{color:var(--color-text-muted);margin-top:8px}
      .report-accordion{margin-top:18px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface-2);overflow:hidden}
      .report-accordion summary{cursor:pointer;list-style:none;padding:16px 18px;font-weight:700}
      .report-accordion summary::-webkit-details-marker{display:none}
      .report-accordion summary::after{content:'+';float:right;color:var(--color-text-muted);font-size:20px;line-height:1}
      .report-accordion[open] summary::after{content:'−'}
      .report-accordion-body{padding:0 18px 18px}
      .report-list{margin:14px 0 0;padding-left:22px}
      .report-list li{margin:10px 0;line-height:1.65}
      .report-bot-table{width:100%;border-collapse:collapse;font-size:14px;margin-top:14px}
      .report-bot-table th,.report-bot-table td{padding:12px 10px;border-bottom:1px solid var(--color-divider);text-align:left;vertical-align:top}
      .report-bot-table th{font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em}
      .report-section-gap{margin-top:40px}
      .report-empty{padding:18px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface)}
      @media (max-width: 820px){.report-summary-table,.report-bot-table{display:block;overflow:auto;white-space:nowrap}}
    </style>
    <div class="report-grid">
      <div class="report-card">
        <div class="report-label">Общая оценка доступности</div>
        <div class="report-value">${overall}</div>
        <div class="report-muted">Среднее по всем URL и всем ботам.</div>
      </div>
      <div class="report-card">
        <div class="report-label">URL в одном запуске</div>
        <div class="report-value">${allSummaries.length}</div>
        <div class="report-muted">Лучше держать список умеренным.</div>
      </div>
    </div>
    <section class="report-card">
      <h2>Как считается оценка</h2>
      <details class="report-accordion">
        <summary>Показать формулу и правила score</summary>
        <div class="report-accordion-body">
          <ul class="report-list">
            <li><strong>HTTP:</strong> 2xx = 25, 3xx = 10, иначе = 0.</li>
            <li><strong>Robots:</strong> allowed = 20, unknown = 10, disallowed = 0.</li>
            <li><strong>Текст в HTML:</strong> >=1500 = 25, >=700 = 18, >=300 = 12, >=50 = 5, &lt;50 = 0.</li>
            <li><strong>Canonical:</strong> self/final = 15, другой URL = 10, missing = 0.</li>
            <li><strong>Redirects:</strong> в MVP пока упрощённо +10.</li>
            <li><strong>Meta robots:</strong> indexable = 5, missing = 3, noindex = 0.</li>
            <li><strong>Критическая недоступность:</strong> 401, 403, 423, 429, 5xx или disallowed в robots режут bot score до максимум 15.</li>
            <li><strong>URL score:</strong> среднее арифметическое score по всем ботам для данного URL.</li>
          </ul>
        </div>
      </details>
    </section>
    <section class="report-card report-section-gap">
      <h2>Сводка по URL</h2>
      <table class="report-summary-table">
        <thead>
          <tr><th>URL</th><th>Итог</th><th>Критические проблемы</th><th>Рекомендации</th></tr>
        </thead>
        <tbody>
          ${allSummaries.map((item) => `
            <tr>
              <td><div class="report-url-title">${esc(item.url)} ${item.criticalIssues.length ? '<span class="report-critical">Critical</span>' : ''}</div></td>
              <td><span class="report-badge ${classifyScore(item.urlScore)}">${item.urlScore}</span></td>
              <td>${item.criticalIssues.length ? `<ul class="report-list">${item.criticalIssues.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : 'Нет'}</td>
              <td><ul class="report-list">${item.recommendations.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
    ${allSummaries.map((item) => `
      <section class="report-url">
        <div class="report-url-head">
          <div>
            <div class="report-url-title">${esc(item.url)} ${item.criticalIssues.length ? '<span class="report-critical">Critical</span>' : ''}</div>
            <div class="report-url-meta">Итог по URL: <strong>${item.urlScore}</strong>.</div>
          </div>
          <span class="report-badge ${classifyScore(item.urlScore)}">${item.urlScore}</span>
        </div>
        <details class="report-accordion">
          <summary>Показать детали по URL</summary>
          <div class="report-accordion-body">
            <h3>Критические проблемы доступа</h3>
            ${item.criticalIssues.length ? `<ul class="report-list">${item.criticalIssues.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : '<p class="report-muted">Критических проблем доступа не найдено.</p>'}
            <h3>Как улучшить оценку</h3>
            <ul class="report-list">${item.recommendations.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
            <h3>Разбор по ботам</h3>
            <table class="report-bot-table">
              <thead>
                <tr><th>Бот</th><th>HTTP</th><th>Robots</th><th>Text chars</th><th>Total</th><th>Почему</th></tr>
              </thead>
              <tbody>
                ${item.rows.map((row) => `
                  <tr>
                    <td>${esc(row.botName)}</td>
                    <td>${row.httpCode}</td>
                    <td>${esc(row.robotsStatus)}</td>
                    <td>${row.textChars}</td>
                    <td>${row.score}</td>
                    <td>${esc(why(row))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    `).join('')}
  </div>`;

  return { html, totalUrls: allSummaries.length, overall };
}
