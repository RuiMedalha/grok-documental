'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import { GlobalSearch } from '@/components/GlobalSearch';
import {
  Inbox,
  FileText,
  LogOut,
  Building2,
  Menu,
  X,
  Landmark,
  GitCompare,
  Settings,
  LayoutDashboard,
  Users,
  Wallet,
  Sparkles,
  Bell,
  Sun,
  Moon,
} from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/documents', label: 'Documentos', icon: FileText },
  { href: '/bank', label: 'Banco / CSV', icon: Landmark },
  { href: '/reconciliation', label: 'Conciliação', icon: GitCompare },
  { href: '/payables', label: 'A pagar', icon: Wallet },
  { href: '/parties', label: 'Entidades', icon: Users },
  { href: '/settings', label: 'Definições', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant, isLoading, logout, accessToken } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.listNotifications(accessToken).then(setNotifs).catch(() => {});
    const id = setInterval(() => {
      api.listNotifications(accessToken).then(setNotifs).catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, [accessToken]);

  useEffect(() => {
    if (!isLoading && !accessToken) router.replace('/login');
  }, [isLoading, accessToken, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 animate-pulse" />
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            A carregar DocFlow…
          </div>
        </div>
      </div>
    );
  }

  const initials = (user.name || user.email || '?')
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen bg-mesh bg-grid flex flex-col md:flex-row">
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 glass border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center">
            <Sparkles size={16} className="text-slate-950" />
          </div>
          <span className="font-bold" style={{ color: 'var(--text)' }}>
            DocFlow
          </span>
        </div>
        <div className="flex items-center gap-1">
          <GlobalSearch />
          <button onClick={toggle} className="btn-ghost p-2" aria-label="Tema">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="btn-ghost p-2">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <aside
        className={`${mobileOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[272px] md:min-h-screen flex-shrink-0 relative z-30`}
      >
        <div className="md:fixed md:w-[272px] md:h-screen flex flex-col glass md:border-r">
          <div className="p-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Sparkles size={20} className="text-slate-950" />
              </div>
              <div>
                <div className="font-bold text-lg tracking-tight" style={{ color: 'var(--text)' }}>
                  DocFlow
                </div>
                <div
                  className="text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-subtle)' }}
                >
                  Document Intelligence
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 mb-3">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl border"
              style={{ borderColor: 'var(--border)', background: 'var(--hover)' }}
            >
              <Building2 size={14} className="text-sky-500 flex-shrink-0" />
              <span className="text-xs truncate font-medium" style={{ color: 'var(--text-muted)' }}>
                {tenant?.name}
              </span>
            </div>
          </div>

          <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={active ? 'nav-item-active' : 'nav-item-idle'}
                >
                  <Icon size={18} className={active ? 'text-sky-400' : ''} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3 px-2 py-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                  {user.name}
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--text-subtle)' }}>
                  {user.role}
                </div>
              </div>
              <button onClick={toggle} className="btn-ghost p-2 hidden md:inline-flex" title="Alternar tema">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <div className="relative">
                <button
                  className="btn-ghost p-2 relative"
                  title="Notificações"
                  onClick={() => setNotifOpen(!notifOpen)}
                >
                  <Bell size={16} />
                  {notifs.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
                  )}
                </button>
                {notifOpen && (
                  <div
                    className="absolute bottom-full mb-2 left-0 md:left-auto md:right-0 w-72 card shadow-xl z-50 max-h-80 overflow-y-auto"
                    style={{ background: 'var(--bg-card-solid)' }}
                  >
                    <div className="px-3 py-2 text-xs font-semibold border-b" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                      Notificações ({notifs.length})
                    </div>
                    {notifs.length === 0 ? (
                      <div className="p-4 text-xs" style={{ color: 'var(--text-subtle)' }}>
                        Sem alertas
                      </div>
                    ) : (
                      notifs.map((n) => (
                        <Link
                          key={n.id}
                          href={n.href || '/dashboard'}
                          onClick={() => setNotifOpen(false)}
                          className="block px-3 py-2.5 border-b last:border-0 hover:opacity-90"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <div className="text-xs font-medium" style={{ color: n.severity === 'danger' ? '#f87171' : n.severity === 'warning' ? '#fbbf24' : 'var(--text)' }}>
                            {n.title}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                            {n.body}
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="nav-item-idle w-full"
            >
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <div className="sticky top-0 z-20 hidden md:flex items-center justify-end gap-3 px-8 py-3 border-b backdrop-blur-md" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg) 85%, transparent)' }}>
          <GlobalSearch />
        </div>
        <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in">{children}</div>
      </main>
    </div>
  );
}
