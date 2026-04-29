# LLM отчёт по доступности — Vercel MVP

Готовый MVP под Vercel/Next.js:

1. Пользователь открывает веб-приложение.
2. Вставляет список URL в форму.
3. Нажимает кнопку.
4. Получает HTML-репорт прямо на той же странице.

## Что внутри

- `app/page.js` — UI с формой и встраиванием HTML-отчёта.
- `app/api/report/route.js` — API endpoint для генерации отчёта.
- `lib/llm-report.js` — логика проверки URL и сборки HTML-репорта.
- `vercel.json` — maxDuration 60 секунд для API-роута.

## Локальный запуск

```bash
npm install
npm run dev
```

Открой `http://localhost:3000`.

## Деплой в Vercel

### Вариант 1 — через GitHub

```bash
git init
git add .
git commit -m "llm report mvp"
```

Затем:
- загрузи репозиторий в GitHub,
- импортируй проект в Vercel,
- framework preset: `Next.js`.

### Вариант 2 — через Vercel CLI

```bash
npm i -g vercel
vercel
```

## Ограничения MVP

- для бесплатного тарифа лучше держать до 12 URL за запуск,
- отчёт строится синхронно одним запросом,
- редиректы в score пока упрощены,
- это MVP без очереди задач, базы и экспорта файлов.

## Что можно сделать следующим шагом

- добавить CSV/HTML download,
- сделать background job + polling,
- вынести список ботов и веса в конфиг,
- добавить auth и историю запусков.
