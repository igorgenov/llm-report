export const metadata = {
  title: 'LLM отчёт по доступности',
  description: 'Быстрый MVP для проверки доступности URL для LLM-ботов'
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
