'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    tenantName: '',
    tenantSlug: '',
    tenantNif: '',
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Erro ao registar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-mesh bg-grid flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-xl shadow-sky-500/30 mb-4">
            <Sparkles size={28} className="text-slate-950" />
          </div>
          <h1 className="text-2xl font-bold text-white">Criar organização</h1>
          <p className="text-slate-400 mt-1 text-sm">Comece a usar o DocFlow em minutos</p>
        </div>

        <div className="card p-6 md:p-8 shadow-2xl shadow-black/40">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="label">Nome da empresa</label>
              <input
                className="input"
                value={form.tenantName}
                onChange={(e) => update('tenantName', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Slug (identificador único)</label>
              <input
                className="input"
                value={form.tenantSlug}
                onChange={(e) =>
                  update(
                    'tenantSlug',
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                  )
                }
                placeholder="minha-empresa"
                required
              />
            </div>
            <div>
              <label className="label">NIF (opcional)</label>
              <input
                className="input"
                value={form.tenantNif}
                onChange={(e) => update('tenantNif', e.target.value)}
              />
            </div>
            <div>
              <label className="label">O seu nome</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm p-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? 'A criar…' : 'Criar conta'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Já tem conta?{' '}
            <Link href="/login" className="text-sky-400 font-medium hover:text-sky-300">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
