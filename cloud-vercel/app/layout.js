import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'NikkoMusicHub Cloud',
  description: 'NikkoMusicHub Central Management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
