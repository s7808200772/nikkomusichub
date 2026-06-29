"use client";

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Cloud, LayoutDashboard, Store, LogOut, Bell } from 'lucide-react';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  const nav = [
    { href: '/', label: '總覽控制台', icon: LayoutDashboard },
    { href: '/stores', label: '店點管理', icon: Store },
    { href: '/monitoring', label: '監控與紀錄', icon: Bell },
  ];

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <Cloud size={22} color="var(--accent-2)" />
        NikkoMusicHub
      </Link>
      <nav className="sidebar-nav">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={active ? 'active' : ''}>
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <button onClick={logout}>
          <LogOut size={18} />
          登出
        </button>
      </div>
    </aside>
  );
}
