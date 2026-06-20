"use client";

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Cloud, LayoutDashboard, Store, Terminal, Settings, LogOut } from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/stores', label: 'Stores', icon: Store },
    { href: '/commands', label: 'Commands', icon: Terminal },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="navbar">
      <Link href="/" className="navbar-brand">
        <Cloud size={22} color="var(--accent-2)" />
        NikkoMusicHub Cloud
      </Link>
      <nav>
        {links.map((l) => {
          const Icon = l.icon;
          const active = pathname === l.href;
          return (
            <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
              <Icon size={16} />
              {l.label}
            </Link>
          );
        })}
        <button onClick={logout}>
          <LogOut size={16} />
          Logout
        </button>
      </nav>
    </header>
  );
}
