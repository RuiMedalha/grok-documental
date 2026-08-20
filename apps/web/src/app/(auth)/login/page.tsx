'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Sparkles, ArrowRight, Building2, Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@demo.pt');
  const [password, setPassword] = useState('Admin123!');
  const [tenantSlug, setTenantSlug] = useState('demo');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, tenantSlug);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-mesh bg-grid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative orbs */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-xl shadow-sky-500/30 mb-4">
            <Sparkles size={28} className="text-slate-950" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">DocFlow</h1>
          <p className="text-slate-400 mt-2 text-sm">
            Gestão inteligente de documentos & conciliação
          </p>
        </div>

        <div className="card p-6 md:p-8 shadow-2xl shadow-black/40">
          <h2 className="text-lg font-semibold text-white mb-1">Entrar</h2>
          <p className="text-xs text-slate-500 mb-6">Aceda ao workspace da sua organização</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Tenant (slug)</label>
              <div className="relative">
                <Building2
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  className="input pl-10"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  placeholder="demo"
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  className="input pl-10"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  className="input pl-10"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm p-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'A entrar…' : 'Entrar no DocFlow'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Não tem conta?{' '}
            <Link href="/register" className="text-sky-400 font-medium hover:text-sky-300">
              Criar organização
            </Link>
          </p>
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-6">
          Demo · tenant <span className="text-slate-400">demo</span> · admin@demo.pt
        </p>
      </div>
    </div>
  );
}
