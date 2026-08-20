'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { ArrowLeft, Save, Send, BookOpen, Wallet, ScanText } from 'lucide-react';
import { AtQrScanButton } from '@/components/AtQrScanner';

const TYPES = [
  'fatura_recebida',
  'fatura_emitida',
  'recibo',
  'comprovativo',
  'encomenda',
  'outro',
];
const STATUSES = ['novo', 'processado', 'em_revisao', 'arquivado'];

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const [doc, setDoc] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pushMsg, setPushMsg] = useState('');
  const [pushing, setPushing] = useState(false);

  const [parties, setParties] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  const [classify, setClassify] = useState({
    partyId: '',
    debitAccountId: '',
    creditAccountId: '',
    costCenter: '',
    schedulePayment: true,
    paymentDueDate: '',
  });
  const [classifying, setClassifying] = useState(false);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    if (!accessToken || !id) return;
    Promise.all([
      api.getDocument(accessToken, id),
      api.listParties(accessToken, {}).catch(() => []),
      api.listAccounts(accessToken).catch(() => []),
      api.getJournal(accessToken, id).catch(() => []),
    ])
      .then(([d, pts, accs, jrn]) => {
        setDoc(d);
        setForm({
          type: d.type,
          status: d.status,
          supplier: d.supplier || '',
          customer: d.customer || '',
          nif: d.nif || '',
          docNumber: d.docNumber || '',
          total: d.total ?? '',
          iva: d.iva ?? '',
          currency: d.currency || 'EUR',
          finalFolder: d.finalFolder || '',
        });
        setParties(pts || []);
        setAccounts(accs || []);
        setJournal(jrn || []);
        setClassify((c) => ({
          ...c,
          partyId: d.partyId || '',
          debitAccountId: d.debitAccountId || '',
          creditAccountId: d.creditAccountId || '',
          costCenter: d.costCenter || '',
          paymentDueDate: d.paymentDueDate
            ? new Date(d.paymentDueDate).toISOString().slice(0, 10)
            : '',
        }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accessToken, id]);

  async function seedAccounts() {
    if (!accessToken) return;
    const accs = await api.seedAccounts(accessToken);
    setAccounts(accs || []);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: any = { ...form };
      if (payload.total === '') delete payload.total;
      else payload.total = Number(payload.total);
      if (payload.iva === '') delete payload.iva;
      else payload.iva = Number(payload.iva);
      const updated = await api.updateDocument(accessToken, id, payload);
      setDoc(updated);
      setSuccess('Guardado com sucesso');
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleClassify() {
    if (!accessToken || !classify.debitAccountId || !classify.creditAccountId) {
      setError('Selecione conta a debitar e a creditar');
      return;
    }
    setClassifying(true);
    setError('');
    try {
      const updated = await api.classifyDocument(accessToken, id, {
        ...classify,
        partyId: classify.partyId || undefined,
        schedulePayment: classify.schedulePayment,
        paymentDueDate: classify.paymentDueDate || undefined,
      });
      setDoc(updated);
      setJournal(updated.journalLines || []);
      setSuccess(
        classify.schedulePayment
          ? 'Classificado e colocado a pagamento'
          : 'Classificação contabilística gravada',
      );
    } catch (err: any) {
      setError(err.message || 'Erro na classificação');
    } finally {
      setClassifying(false);
    }
  }

  async function runExtraction() {
    if (!accessToken) return;
    setExtracting(true);
    setError('');
    try {
      const res = await api.extractDocument(accessToken, id);
      setDoc(res.document);
      setForm((f: any) => ({
        ...f,
        supplier: res.document.supplier || f.supplier,
        nif: res.document.nif || f.nif,
        docNumber: res.document.docNumber || f.docNumber,
        total: res.document.total ?? f.total,
        iva: res.document.iva ?? f.iva,
      }));
      if (res.document.partyId) {
        setClassify((c) => ({ ...c, partyId: res.document.partyId }));
      }
      setSuccess(
        `Extração concluída (${Math.round((res.extracted?.confidence || 0) * 100)}% confiança) · ${
          res.extracted?.rawHints?.join(', ') || 'sem hints'
        }`,
      );
    } catch (err: any) {
      setError(err.message || 'Erro na extração');
    } finally {
      setExtracting(false);
    }
  }

  async function pushToconline() {
    if (!accessToken) return;
    setPushing(true);
    setPushMsg('');
    try {
      const res = await api.pushToToconline(accessToken, id);
      setPushMsg(res.message || JSON.stringify(res));
    } catch (err: any) {
      setPushMsg(err.message || 'Erro TOConline');
    } finally {
      setPushing(false);
    }
  }

  if (loading)
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-subtle)' }}>
        A carregar…
      </div>
    );
  if (!doc)
    return <div className="text-center py-12 text-rose-400">{error || 'Não encontrado'}</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-secondary p-2">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate" style={{ color: 'var(--text)' }}>
            {doc.fileName}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
            {doc.mimeType} · {(doc.fileSize / 1024).toFixed(1)} KB
            {doc.paymentStatus && doc.paymentStatus !== 'draft' && (
              <span className="ml-2 badge-sky">{doc.paymentStatus}</span>
            )}
          </p>
        </div>
        <AtQrScanButton
          label="QR AT"
          onScan={async (qrText) => {
            if (!accessToken) return;
            try {
              const res = await api.applyAtQr(accessToken, id, qrText);
              setDoc(res.document);
              setForm((f: any) => ({
                ...f,
                nif: res.document.nif || f.nif,
                docNumber: res.document.docNumber || f.docNumber,
                total: res.document.total ?? f.total,
                iva: res.document.iva ?? f.iva,
                type: res.document.type || f.type,
              }));
              setSuccess(
                `QR AT lido · NIF ${res.atQr?.issuerNif || '—'} · Total ${res.atQr?.total ?? '—'} € · ATCUD ${res.atQr?.atcud || '—'}`,
              );
            } catch (err: any) {
              setError(err.message || 'QR inválido');
            }
          }}
        />
        <button onClick={runExtraction} className="btn-secondary text-xs" disabled={extracting}>
          <ScanText size={14} /> {extracting ? 'A extrair…' : 'Extrair dados'}
        </button>
        <button onClick={pushToconline} className="btn-secondary text-xs" disabled={pushing}>
          <Send size={14} /> TOConline
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm p-3">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-sm p-3">
          {success}
        </div>
      )}
      {pushMsg && (
        <div className="rounded-xl border text-sm p-3" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          {pushMsg}
        </div>
      )}

      {/* Metadata form */}
      <form onSubmit={handleSave} className="card p-5 space-y-4">
        <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
          Dados do documento
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fornecedor (texto)</label>
            <input className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div>
            <label className="label">Cliente (texto)</label>
            <input className="input" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
          </div>
          <div>
            <label className="label">NIF</label>
            <input className="input" value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
          </div>
          <div>
            <label className="label">Nº documento</label>
            <input className="input" value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} />
          </div>
          <div>
            <label className="label">Total</label>
            <input className="input" type="number" step="0.01" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
          </div>
          <div>
            <label className="label">IVA</label>
            <input className="input" type="number" step="0.01" value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Pasta</label>
            <input className="input" value={form.finalFolder} onChange={(e) => setForm({ ...form, finalFolder: e.target.value })} />
          </div>
        </div>
        <button type="submit" className="btn-primary text-sm" disabled={saving}>
          <Save size={16} /> {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </form>

      {/* Accounting classification */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-sky-400" />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
              Classificação contabilística
            </h2>
          </div>
          {accounts.length === 0 && (
            <button type="button" onClick={seedAccounts} className="btn-secondary text-xs">
              Carregar plano de contas PT
            </button>
          )}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          Exemplo fatura recebida: <strong>Débito</strong> 62 (FSE) ou 31 (Compras) ·{' '}
          <strong>Crédito</strong> 221 (Fornecedores). IVA em 2432 quando aplicável.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Entidade (fornecedor / cliente)</label>
            <select
              className="input"
              value={classify.partyId}
              onChange={(e) => {
                const partyId = e.target.value;
                const party = parties.find((p) => p.id === partyId);
                setClassify({
                  ...classify,
                  partyId,
                  debitAccountId: party?.defaultDebitAccountId || classify.debitAccountId,
                  creditAccountId: party?.defaultCreditAccountId || classify.creditAccountId,
                });
              }}
            >
              <option value="">— selecionar —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.nif ? ` (${p.nif})` : ''} · {p.type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Débito a conta *</label>
            <select
              className="input"
              value={classify.debitAccountId}
              onChange={(e) => setClassify({ ...classify, debitAccountId: e.target.value })}
            >
              <option value="">— conta —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Crédito a conta *</label>
            <select
              className="input"
              value={classify.creditAccountId}
              onChange={(e) => setClassify({ ...classify, creditAccountId: e.target.value })}
            >
              <option value="">— conta —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Centro de custo</label>
            <input
              className="input"
              value={classify.costCenter}
              onChange={(e) => setClassify({ ...classify, costCenter: e.target.value })}
              placeholder="opcional"
            />
          </div>
          <div>
            <label className="label">Data vencimento pagamento</label>
            <input
              className="input"
              type="date"
              value={classify.paymentDueDate}
              onChange={(e) => setClassify({ ...classify, paymentDueDate: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="schedulePayment"
              checked={classify.schedulePayment}
              onChange={(e) => setClassify({ ...classify, schedulePayment: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="schedulePayment" className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <Wallet size={14} className="inline mr-1" />
              Colocar a pagamento (cria item em Contas a pagar)
            </label>
          </div>
        </div>

        <button type="button" onClick={handleClassify} className="btn-primary text-sm" disabled={classifying}>
          {classifying ? 'A classificar…' : 'Classificar e gravar lançamento'}
        </button>

        {journal.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left p-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
                    Conta
                  </th>
                  <th className="text-right p-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
                    Débito
                  </th>
                  <th className="text-right p-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
                    Crédito
                  </th>
                </tr>
              </thead>
              <tbody>
                {journal.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="p-2" style={{ color: 'var(--text)' }}>
                      {l.account?.code} · {l.account?.name}
                    </td>
                    <td className="p-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {Number(l.debit) > 0 ? Number(l.debit).toLocaleString('pt-PT', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="p-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {Number(l.credit) > 0 ? Number(l.credit).toLocaleString('pt-PT', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
