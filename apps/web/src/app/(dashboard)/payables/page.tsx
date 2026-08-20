'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Wallet, CheckCircle2, AlertCircle, RefreshCw, FileDown } from 'lucide-react';
import Link from 'next/link';

export default function PayablesPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [status, setStatus] = useState('to_pay');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      const [list, sum] = await Promise.all([
        api.listPayables(accessToken, params),
        api.payablesSummary(accessToken),
      ]);
      setItems(list || []);
      setSummary(sum);
    } finally {
      setLoading(false);
    }
  }, [accessToken, status]);

  useEffect(() => {
    load();
  }, [load]);

  const [payModal, setPayModal] = useState<{ id: string } | null>(null);
  const [payForm, setPayForm] = useState({
    paymentMethod: 'sepa',
    paymentRef: '',
    paidAt: new Date().toISOString().slice(0, 10),
  });

  async function markPaid(id: string, body: any = {}) {
    if (!accessToken) return;
    await api.markPayablePaid(accessToken, id, body);
    setPayModal(null);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in">
        <div>
          <h1 className="page-title">Contas a pagar</h1>
          <p className="page-subtitle">Faturas de fornecedores agendadas para pagamento</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => accessToken && api.exportSepa(accessToken, 'csv', status || 'to_pay')}
            className="btn-secondary text-xs"
          >
            <FileDown size={14} /> SEPA CSV
          </button>
          <button
            onClick={() => accessToken && api.exportSepa(accessToken, 'xml', status || 'to_pay')}
            className="btn-secondary text-xs"
          >
            <FileDown size={14} /> SEPA XML
          </button>
          <button onClick={load} className="btn-secondary">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-in animate-delay-1">
        <div className="card p-4">
          <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
            Em aberto
          </div>
          <div className="stat-value text-2xl mt-1">{summary?.openCount ?? '—'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
            Total €
          </div>
          <div className="stat-value text-2xl mt-1">
            {summary?.openTotal != null
              ? Number(summary.openTotal).toLocaleString('pt-PT', { minimumFractionDigits: 2 })
              : '—'}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-subtle)' }}>
            <AlertCircle size={12} className="text-amber-400" /> Vencidas
          </div>
          <div className="stat-value text-2xl mt-1 text-amber-400">{summary?.overdueCount ?? '—'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
            Vencido €
          </div>
          <div className="stat-value text-2xl mt-1">
            {summary?.overdueTotal != null
              ? Number(summary.overdueTotal).toLocaleString('pt-PT', { minimumFractionDigits: 2 })
              : '—'}
          </div>
        </div>
      </div>

      <div className="flex gap-2 animate-in animate-delay-2">
        {[
          { v: 'to_pay', l: 'A pagar' },
          { v: 'scheduled', l: 'Agendadas' },
          { v: 'paid', l: 'Pagas' },
          { v: '', l: 'Todas' },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setStatus(t.v)}
            className={status === t.v ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden animate-in animate-delay-3">
        {loading ? (
          <div className="p-5 space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="skeleton h-14" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: 'var(--text-subtle)' }}>
            <Wallet className="mx-auto mb-3 opacity-40" size={32} />
            Sem itens. Classifique uma fatura recebida e marque &quot;colocar a pagamento&quot;.
          </div>
        ) : (
          <ul>
            {items.map((item) => {
              const overdue = item.dueDate && new Date(item.dueDate) < new Date() && item.status !== 'paid';
              return (
                <li
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 border-b last:border-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {item.party?.name || item.description || 'Sem fornecedor'}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                      {item.document && (
                        <Link href={`/documents/${item.document.id}`} className="text-sky-400 hover:underline">
                          {item.document.fileName}
                        </Link>
                      )}
                      {item.dueDate && (
                        <span className={overdue ? ' text-amber-400' : ''}>
                          {' '}
                          · venc. {new Date(item.dueDate).toLocaleDateString('pt-PT')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                    {Number(item.amount).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €
                  </div>
                  <span
                    className={
                      item.status === 'paid'
                        ? 'badge-emerald'
                        : overdue
                          ? 'badge-amber'
                          : 'badge-sky'
                    }
                  >
                    {item.status}
                  </span>
                  {item.status !== 'paid' && (
                    <button onClick={() => setPayModal({ id: item.id })} className="btn-secondary text-xs">
                      <CheckCircle2 size={14} /> Marcar pago
                    </button>
                  )}
                  {item.status === 'paid' && (
                    <span className="badge-emerald text-[10px]">
                      {item.paymentMethod || 'pago'}
                      {item.paymentRef ? ` · ${item.paymentRef}` : ''}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setPayModal(null)}>
          <div className="card p-5 w-full max-w-sm space-y-3" style={{ background: 'var(--bg-card-solid)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Registar pagamento</h3>
            <div>
              <label className="label">Método</label>
              <select
                className="input"
                value={payForm.paymentMethod}
                onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
              >
                <option value="sepa">SEPA / Transferência</option>
                <option value="mb">Multibanco (MB)</option>
                <option value="transfer">Transferência interna</option>
                <option value="card">Cartão</option>
                <option value="cash">Numerário</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <label className="label">Referência (MB / SEPA end-to-end)</label>
              <input
                className="input"
                placeholder={payForm.paymentMethod === 'mb' ? 'Entidade + Ref. MB' : 'Opcional'}
                value={payForm.paymentRef}
                onChange={(e) => setPayForm({ ...payForm, paymentRef: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Data do pagamento</label>
              <input
                className="input"
                type="date"
                value={payForm.paidAt}
                onChange={(e) => setPayForm({ ...payForm, paidAt: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1 text-xs" onClick={() => setPayModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary flex-1 text-xs"
                onClick={() =>
                  markPaid(payModal.id, {
                    paymentMethod: payForm.paymentMethod,
                    paymentRef: payForm.paymentRef || undefined,
                    paidAt: payForm.paidAt,
                  })
                }
              >
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
