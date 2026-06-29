import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'NikkoMusicHub',
  description: 'NikkoMusicHub Store Management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
