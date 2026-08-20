'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, Users, Landmark, Wallet, X, Command } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

const TYPE_ICON: Record<string, any> = {
  document: FileText,
  party: Users,
  transaction: Landmark,
  payable: Wallet,
};

const TYPE_LABEL: Record<string, string> = {
  document: 'Documento',
  party: 'Entidade',
  transaction: 'Banco',
  payable: 'A pagar',
};

export function GlobalSearch() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<any>(null);

  const runSearch = useCallback(
    async (term: string) => {
      if (!accessToken || term.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await api.globalSearch(accessToken, term.trim(), 10);
        setResults(res.results || []);
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ('');
      setResults([]);
    }
  }, [open]);

  function onChange(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(value), 220);
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      go(results[active].href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors w-56 lg:w-72"
        style={{
          borderColor: 'var(--border-strong)',
          color: 'var(--text-subtle)',
          background: 'var(--input-bg)',
        }}
      >
        <Search size={15} />
        <span className="flex-1 text-left">Pesquisar…</span>
        <kbd
          className="text-[10px] px-1.5 py-0.5 rounded border font-mono"
          style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
        >
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden btn-ghost p-2"
        aria-label="Pesquisar"
      >
        <Search size={18} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg card shadow-2xl overflow-hidden animate-in"
            style={{ background: 'var(--bg-card-solid)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-2 px-4 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <Search size={18} style={{ color: 'var(--text-subtle)' }} />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent border-0 outline-none py-3.5 text-sm"
                style={{ color: 'var(--text)' }}
                placeholder="Documentos, fornecedores, NIF, movimentos…"
                value={q}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
              />
              {q && (
                <button
                  type="button"
                  className="p-1 rounded-lg"
                  style={{ color: 'var(--text-subtle)' }}
                  onClick={() => {
                    setQ('');
                    setResults([]);
                    inputRef.current?.focus();
                  }}
                >
                  <X size={16} />
                </button>
              )}
              <kbd
                className="text-[10px] px-1.5 py-0.5 rounded border hidden sm:inline"
                style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
              >
                ESC
              </kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {loading && (
                <div className="p-4 text-xs" style={{ color: 'var(--text-subtle)' }}>
                  A pesquisar…
                </div>
              )}
              {!loading && q.trim().length >= 2 && results.length === 0 && (
                <div className="p-6 text-center text-sm" style={{ color: 'var(--text-subtle)' }}>
                  Sem resultados para “{q}”
                </div>
              )}
              {!loading && q.trim().length < 2 && (
                <div className="p-6 text-center text-sm" style={{ color: 'var(--text-subtle)' }}>
                  <Command size={20} className="mx-auto mb-2 opacity-40" />
                  Escreva pelo menos 2 caracteres
                  <div className="text-xs mt-2 opacity-70">
                    NIF · nome ficheiro · fornecedor · descrição bancária
                  </div>
                </div>
              )}
              <ul>
                {results.map((r, i) => {
                  const Icon = TYPE_ICON[r.type] || FileText;
                  return (
                    <li key={`${r.type}-${r.id}`}>
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                        style={{
                          background: i === active ? 'var(--hover)' : 'transparent',
                        }}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(r.href)}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border"
                          style={{
                            borderColor: 'var(--border)',
                            background: 'var(--hover)',
                          }}
                        >
                          <Icon size={16} className="text-sky-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-medium truncate"
                            style={{ color: 'var(--text)' }}
                          >
                            {r.title}
                          </div>
                          {r.subtitle && (
                            <div
                              className="text-[11px] truncate mt-0.5"
                              style={{ color: 'var(--text-subtle)' }}
                            >
                              {r.subtitle}
                            </div>
                          )}
                        </div>
                        <span className="badge-sky text-[10px] flex-shrink-0">
                          {TYPE_LABEL[r.type] || r.type}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
