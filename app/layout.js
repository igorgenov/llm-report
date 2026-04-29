export const metadata = {
  title: 'LLM отчёт по доступности',
  description: 'Проверка доступности URL для LLM-ботов'
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
