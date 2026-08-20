'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { GitCompare, Check, X, RefreshCw, Zap } from 'lucide-react';

export default function ReconciliationPage() {
  const { accessToken } = useAuth();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [runResult, setRunResult] = useState<any>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.listSuggestions(accessToken, statusFilter);
      setSuggestions(res || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [accessToken, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRun() {
    if (!accessToken) return;
    setRunning(true);
    setError('');
    setRunResult(null);
    try {
      const res = await api.runMatching(accessToken);
      setRunResult(res);
      setStatusFilter('pending');
      await load();
    } catch (err: any) {
      setError(err.message || 'Erro ao executar matching');
    } finally {
      setRunning(false);
    }
  }

  async function handleAccept(id: string) {
    if (!accessToken) return;
    try {
      await api.acceptSuggestion(accessToken, id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleReject(id: string) {
    if (!accessToken) return;
    try {
      await api.rejectSuggestion(accessToken, id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  function scoreBadge(score: number, type: string) {
    const colors: Record<string, string> = {
      strong: 'bg-green-100 text-green-800',
      medium: 'bg-blue-100 text-blue-800',
      weak: 'bg-amber-100 text-amber-800',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[type] || 'bg-white/5'}`}>
        {type} · {(score * 100).toFixed(0)}%
      </span>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold">Conciliação</h1>
          <p className="text-sm text-slate-500">Sugestões de matching bancário</p>
        </div>
        <div className="flex gap-2">
          <select
            className="input w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="pending">Pendentes</option>
            <option value="accepted">Aceites</option>
            <option value="rejected">Rejeitadas</option>
          </select>
          <button className="btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn-primary gap-2" onClick={handleRun} disabled={running}>
            <Zap size={16} />
            {running ? 'A correr...' : 'Correr matching'}
          </button>
        </div>
      </div>

      {runResult && (
        <div className="rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 text-sm p-3 mb-4">
          Matching concluído: {runResult.suggestionsCreated} sugestões criadas
          (a partir de {runResult.scannedTransactions} movimentos)
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/25 text-sm p-3 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">A carregar...</div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <GitCompare size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem sugestões {statusFilter === 'pending' ? 'pendentes' : ''}</p>
          <p className="text-xs mt-1">Importe movimentos bancários e documentos, depois corra o matching</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {scoreBadge(s.score, s.matchType)}
                    <span className="text-xs text-slate-400">
                      {new Date(s.createdAt).toLocaleString('pt-PT')}
                    </span>
                  </div>

                  {/* Bank side */}
                  <div className="bg-white/[0.03] rounded-lg p-3">
                    <div className="text-xs font-medium text-slate-500 mb-1">Movimento bancário</div>
                    <div className="text-sm font-medium">
                      {s.bankTransaction?.description || '—'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex gap-3">
                      <span>
                        {s.bankTransaction?.date
                          ? new Date(s.bankTransaction.date).toLocaleDateString('pt-PT')
                          : '—'}
                      </span>
                      <span
                        className={
                          (s.bankTransaction?.amount ?? 0) < 0
                            ? 'text-red-600 font-medium'
                            : 'text-green-600 font-medium'
                        }
                      >
                        {s.bankTransaction?.amount != null
                          ? `${Number(s.bankTransaction.amount).toLocaleString('pt-PT', {
                              minimumFractionDigits: 2,
                            })} €`
                          : '—'}
                      </span>
                      {s.bankTransaction?.reference && (
                        <span>Ref: {s.bankTransaction.reference}</span>
                      )}
                    </div>
                  </div>

                  {/* Entity side */}
                  <div className="bg-sky-500/10 rounded-lg p-3">
                    <div className="text-xs font-medium text-sky-400 mb-1">
                      {s.expense ? 'Despesa' : s.invoice ? 'Fatura' : 'Documento / Entidade'}
                    </div>
                    {s.expense && (
                      <>
                        <div className="text-sm font-medium">
                          {s.expense.description || s.expense.supplier || '—'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {Number(s.expense.amount).toLocaleString('pt-PT', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          €
                        </div>
                      </>
                    )}
                    {s.invoice && (
                      <>
                        <div className="text-sm font-medium">
                          {s.invoice.number || s.invoice.customer || '—'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {Number(s.invoice.amount).toLocaleString('pt-PT', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          €
                        </div>
                      </>
                    )}
                    {!s.expense && !s.invoice && (
                      <div className="text-sm text-slate-500">Match por documento (valor/data)</div>
                    )}
                  </div>
                </div>

                {statusFilter === 'pending' && (
                  <div className="flex sm:flex-col gap-2 flex-shrink-0">
                    <button
                      className="btn-primary gap-1 text-xs px-3 py-1.5"
                      onClick={() => handleAccept(s.id)}
                    >
                      <Check size={14} /> Aceitar
                    </button>
                    <button
                      className="btn-secondary gap-1 text-xs px-3 py-1.5"
                      onClick={() => handleReject(s.id)}
                    >
                      <X size={14} /> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
