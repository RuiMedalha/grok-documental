'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import {
  Inbox,
  FileText,
  Landmark,
  GitCompare,
  TrendingUp,
  ArrowUpRight,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface Stats {
  inbox: number;
  documents: number;
  transactions: number;
  pendingMatches: number;
  processed: number;
  archived: number;
  review: number;
}

const PIE_COLORS = ['#fbbf24', '#34d399', '#38bdf8', '#a78bfa'];

export default function DashboardPage() {
  const { accessToken, user, tenant } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [allDocs, setAllDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hour, setHour] = useState(12);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [inboxRes, docsRes, txRes, sugRes] = await Promise.all([
        api.getInbox(accessToken, { limit: '5' }).catch(() => ({ items: [], meta: { total: 0 } })),
        api.getDocuments(accessToken, { limit: '50' }).catch(() => ({ items: [], meta: { total: 0 } })),
        api.listTransactions(accessToken, { limit: '5' }).catch(() => ({ items: [], meta: { total: 0 } })),
        api.listSuggestions(accessToken, 'pending').catch(() => []),
      ]);

      const docs = docsRes.items || [];
      setAllDocs(docs);
      setRecentDocs(docs.slice(0, 6));
      setSuggestions((sugRes || []).slice(0, 4));

      setStats({
        inbox: inboxRes.meta?.total ?? (inboxRes.items?.length || 0),
        documents: docsRes.meta?.total ?? docs.length,
        transactions: txRes.meta?.total ?? (txRes.items?.length || 0),
        pendingMatches: Array.isArray(sugRes) ? sugRes.length : 0,
        processed: docs.filter((d: any) => d.status === 'processado').length,
        archived: docs.filter((d: any) => d.status === 'arquivado').length,
        review: docs.filter((d: any) => d.status === 'em_revisao').length,
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
    setHour(new Date().getHours());
  }, [load]);

  const greeting = hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite';

  const weeklyData = useMemo(() => {
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    allDocs.forEach((d) => {
      const dt = new Date(d.createdAt);
      const diff = Math.floor((now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < 7) {
        // map to weekday index relative to today
        const idx = (now.getDay() + 6 - diff) % 7; // Mon=0
        counts[idx] = (counts[idx] || 0) + 1;
      }
    });
    // If empty, show gentle demo curve so chart isn't blank
    const hasData = counts.some((c) => c > 0);
    const demo = [2, 4, 3, 6, 5, 2, 1];
    return days.map((name, i) => ({
      name,
      docs: hasData ? counts[i] : demo[i],
      isDemo: !hasData,
    }));
  }, [allDocs]);

  const pieData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Inbox', value: stats.inbox || 0 },
      { name: 'Processados', value: stats.processed || 0 },
      { name: 'Em revisão', value: stats.review || 0 },
      { name: 'Arquivados', value: stats.archived || 0 },
    ].filter((x) => x.value > 0);
  }, [stats]);

  const kpis = [
    {
      label: 'Inbox',
      value: stats?.inbox ?? '—',
      hint: 'por processar',
      icon: Inbox,
      href: '/inbox',
      color: 'from-amber-400 to-orange-500',
      glow: 'shadow-amber-500/20',
      delay: 'animate-delay-1',
    },
    {
      label: 'Documentos',
      value: stats?.documents ?? '—',
      hint: 'no total',
      icon: FileText,
      href: '/documents',
      color: 'from-sky-400 to-blue-500',
      glow: 'shadow-sky-500/20',
      delay: 'animate-delay-2',
    },
    {
      label: 'Movimentos',
      value: stats?.transactions ?? '—',
      hint: 'bancários',
      icon: Landmark,
      href: '/bank',
      color: 'from-emerald-400 to-teal-500',
      glow: 'shadow-emerald-500/20',
      delay: 'animate-delay-3',
    },
    {
      label: 'Sugestões',
      value: stats?.pendingMatches ?? '—',
      hint: 'conciliação',
      icon: GitCompare,
      href: '/reconciliation',
      color: 'from-violet-400 to-indigo-500',
      glow: 'shadow-violet-500/20',
      delay: 'animate-delay-4',
    },
  ];

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      novo: 'badge-amber',
      processado: 'badge-emerald',
      em_revisao: 'badge-sky',
      arquivado: 'badge-violet',
    };
    return map[status] || 'badge-sky';
  }

  const tooltipStyle = {
    background: 'var(--bg-card-solid)',
    border: '1px solid var(--border-strong)',
    borderRadius: 12,
    color: 'var(--text)',
    fontSize: 12,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 animate-in">
        <div>
          <div className="inline-flex items-center gap-2 badge-sky mb-3">
            <Sparkles size={12} />
            {tenant?.name || 'Workspace'}
          </div>
          <h1 className="page-title">
            {greeting}, {user?.name?.split(' ')[0] || 'olá'}
          </h1>
          <p className="page-subtitle">
            Visão geral da operação documental e conciliação bancária
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <Link href="/inbox" className="btn-primary">
            <Upload size={16} />
            Novo upload
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link
              key={k.label}
              href={k.href}
              className={`card-hover p-4 md:p-5 group animate-in ${k.delay}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${k.color} flex items-center justify-center shadow-lg ${k.glow}`}
                >
                  <Icon size={18} className="text-slate-950" />
                </div>
                <ArrowUpRight
                  size={16}
                  className="opacity-40 group-hover:opacity-100 group-hover:text-sky-400 transition-all"
                />
              </div>
              <div className="stat-value text-2xl md:text-3xl">
                {loading ? '···' : k.value}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                  {k.label}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  {k.hint}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="card p-5 md:p-6 lg:col-span-2 animate-in animate-delay-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                Documentos · últimos 7 dias
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                {weeklyData[0]?.isDemo
                  ? 'Pré-visualização (sem dados reais ainda)'
                  : 'Uploads por dia da semana'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium">
              <TrendingUp size={14} />
              Live
            </div>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="docsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--text-subtle)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: 'var(--text-subtle)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="docs"
                  name="Documentos"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  fill="url(#docsFill)"
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5 md:p-6 animate-in animate-delay-3">
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>
            Distribuição por estado
          </h2>
          <p className="text-xs mb-3" style={{ color: 'var(--text-subtle)' }}>
            Sample dos documentos carregados
          </p>
          <div className="h-44 w-full">
            {pieData.length === 0 ? (
              <div
                className="h-full flex items-center justify-center text-sm"
                style={{ color: 'var(--text-subtle)' }}
              >
                Sem dados
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    animationDuration={800}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {pieData.map((p, i) => (
              <span key={p.name} className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                {p.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline bars + volume bar chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="card p-5 md:p-6 animate-in animate-delay-3">
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>
            Estado do pipeline
          </h2>
          <div className="space-y-3">
            <PipelineRow icon={<Clock size={16} className="text-amber-400" />} label="Na Inbox" value={stats?.inbox ?? 0} tone="amber" />
            <PipelineRow icon={<CheckCircle2 size={16} className="text-emerald-400" />} label="Processados" value={stats?.processed ?? 0} tone="emerald" />
            <PipelineRow icon={<AlertCircle size={16} className="text-violet-400" />} label="Sugestões pendentes" value={stats?.pendingMatches ?? 0} tone="violet" />
            <PipelineRow icon={<FileText size={16} className="text-sky-400" />} label="Arquivados" value={stats?.archived ?? 0} tone="sky" />
          </div>
          <Link href="/reconciliation" className="btn-secondary w-full mt-5 text-xs">
            <GitCompare size={14} />
            Ir à conciliação
          </Link>
        </div>

        <div className="card p-5 md:p-6 animate-in animate-delay-4">
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>
            Volume semanal
          </h2>
          <p className="text-xs mb-3" style={{ color: 'var(--text-subtle)' }}>
            Comparação por dia
          </p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="docs" name="Documentos" fill="#818cf8" radius={[6, 6, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="card overflow-hidden animate-in animate-delay-4">
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              Documentos recentes
            </h2>
            <Link href="/documents" className="text-xs text-sky-400 hover:text-sky-300 font-medium">
              Ver todos
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-12" />
              ))}
            </div>
          ) : recentDocs.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-subtle)' }}>
              Ainda sem documentos. Comece pelo upload na Inbox.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {recentDocs.map((doc) => (
                <li key={doc.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <Link href={`/documents/${doc.id}`} className="row-link">
                    <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                      <FileText size={16} className="text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {doc.fileName}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                        {new Date(doc.createdAt).toLocaleString('pt-PT', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <span className={statusBadge(doc.status)}>{doc.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden animate-in animate-delay-5">
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              Conciliação
            </h2>
            <Link href="/reconciliation" className="text-xs text-sky-400 hover:text-sky-300 font-medium">
              Abrir
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="skeleton h-16" />
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-subtle)' }}>
              Sem sugestões pendentes. Importe CSV e corra o matching.
            </div>
          ) : (
            <ul>
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="px-5 py-3.5 border-b last:border-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span
                      className={
                        s.matchType === 'strong'
                          ? 'badge-emerald'
                          : s.matchType === 'medium'
                            ? 'badge-sky'
                            : 'badge-amber'
                      }
                    >
                      {s.matchType} · {Math.round((s.score || 0) * 100)}%
                    </span>
                  </div>
                  <div className="text-sm truncate" style={{ color: 'var(--text)' }}>
                    {s.bankTransaction?.description || 'Movimento bancário'}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                    {s.bankTransaction?.amount != null
                      ? `${Number(s.bankTransaction.amount).toLocaleString('pt-PT', {
                          minimumFractionDigits: 2,
                        })} €`
                      : '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5 md:p-6 relative overflow-hidden animate-in animate-delay-5">
        <div className="absolute inset-0 bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-transparent pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Fluxo recomendado
            </h3>
            <p className="text-sm mt-1 max-w-xl" style={{ color: 'var(--text-muted)' }}>
              1. Upload na Inbox → 2. Classificar metadata → 3. Importar extrato CSV → 4.
              Correr conciliação → 5. Exportar ou enviar para TOConline
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link href="/bank" className="btn-secondary text-xs">
              Importar CSV
            </Link>
            <Link href="/settings" className="btn-primary text-xs">
              Configurar TOConline
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  const bar: Record<string, string> = {
    amber: 'bg-amber-400',
    emerald: 'bg-emerald-400',
    violet: 'bg-violet-400',
    sky: 'bg-sky-400',
  };
  const pct = Math.min(100, value === 0 ? 4 : Math.max(8, value * 12));
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className={`h-full rounded-full ${bar[tone] || bar.sky} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
