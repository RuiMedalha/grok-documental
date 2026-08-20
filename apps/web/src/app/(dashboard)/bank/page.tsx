'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Upload, ChevronRight, ChevronLeft, Check, Landmark, Download } from 'lucide-react';

type Step = 'upload' | 'map' | 'preview' | 'done';

const FIELD_LABELS: Record<string, string> = {
  date: 'Data *',
  description: 'Descrição *',
  amount: 'Valor (único)',
  debit: 'Débito',
  credit: 'Crédito',
  balance: 'Saldo',
  reference: 'Referência',
};

export default function BankPage() {
  const { accessToken } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    date: '',
    description: '',
    amount: '',
    debit: '',
    credit: '',
    balance: '',
    reference: '',
  });
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [decimalSep, setDecimalSep] = useState(',');
  const [thousandSep, setThousandSep] = useState('.');
  const [hasHeader, setHasHeader] = useState(true);
  const [preview, setPreview] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'import' | 'list'>('import');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.listCsvTemplates(accessToken).then(setTemplates).catch(() => {});
    loadTransactions();
  }, [accessToken]);

  async function loadTransactions() {
    if (!accessToken) return;
    try {
      const res = await api.listTransactions(accessToken);
      setTransactions(res.items || []);
    } catch {
      // ignore
    }
  }

  async function handleFileSelect(f: File) {
    if (!accessToken) return;
    setFile(f);
    setError('');
    setLoading(true);
    try {
      const res = await api.detectCsvHeaders(accessToken, f);
      setHeaders(res.headers);
      // Auto-guess common PT bank column names
      const lower = res.headers.map((h) => h.toLowerCase());
      const guess = (candidates: string[]) => {
        const idx = lower.findIndex((h) => candidates.some((c) => h.includes(c)));
        return idx >= 0 ? res.headers[idx] : '';
      };
      setMapping({
        date: guess(['data', 'date', 'dt']),
        description: guess(['descri', 'desc', 'histórico', 'historico', 'movimento']),
        amount: guess(['valor', 'montante', 'amount']),
        debit: guess(['débito', 'debito', 'debit']),
        credit: guess(['crédito', 'credito', 'credit']),
        balance: guess(['saldo', 'balance']),
        reference: guess(['refer', 'ref', 'id']),
      });
      setStep('map');
    } catch (err: any) {
      setError(err.message || 'Erro ao ler CSV');
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (!accessToken || !file) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.previewCsv(accessToken, file, {
        mapping: {
          date: mapping.date,
          description: mapping.description,
          amount: mapping.amount || undefined,
          debit: mapping.debit || undefined,
          credit: mapping.credit || undefined,
          balance: mapping.balance || undefined,
          reference: mapping.reference || undefined,
        },
        dateFormat,
        decimalSep,
        thousandSep,
        hasHeader,
      });
      setPreview(res);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Erro no preview');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!accessToken || !file) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.importCsv(accessToken, file, {
        mapping: {
          date: mapping.date,
          description: mapping.description,
          amount: mapping.amount || undefined,
          debit: mapping.debit || undefined,
          credit: mapping.credit || undefined,
          balance: mapping.balance || undefined,
          reference: mapping.reference || undefined,
        },
        dateFormat,
        decimalSep,
        thousandSep,
        hasHeader,
        saveAsTemplate: saveAsTemplate || undefined,
      });
      setImportResult(res);
      setStep('done');
      loadTransactions();
    } catch (err: any) {
      setError(err.message || 'Erro na importação');
    } finally {
      setLoading(false);
    }
  }

  function applyTemplate(t: any) {
    const m = t.mapping || {};
    setMapping({
      date: m.date || '',
      description: m.description || '',
      amount: m.amount || '',
      debit: m.debit || '',
      credit: m.credit || '',
      balance: m.balance || '',
      reference: m.reference || '',
    });
    setDateFormat(t.dateFormat || 'DD/MM/YYYY');
    setDecimalSep(t.decimalSep || ',');
    setThousandSep(t.thousandSep || '.');
    setHasHeader(t.hasHeader !== false);
  }

  function resetWizard() {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setPreview(null);
    setImportResult(null);
    setError('');
    setSaveAsTemplate('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Banco / CSV</h1>
          <p className="text-sm text-slate-500">Importar extratos e gerir movimentos</p>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn text-sm ${tab === 'import' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('import')}
          >
            Importar CSV
          </button>
          <button
            className={`btn text-sm ${tab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTab('list'); loadTransactions(); }}
          >
            Movimentos
          </button>
          <button
            className="btn-secondary gap-1 text-sm"
            onClick={async () => {
              if (!accessToken) return;
              try {
                await api.exportTransactions(accessToken);
              } catch (e: any) {
                alert(e.message || 'Erro ao exportar');
              }
            }}
          >
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {tab === 'list' ? (
        <div className="card overflow-x-auto">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Landmark size={32} className="mx-auto mb-2 opacity-40" />
              Sem movimentos. Importe um CSV.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="p-3">Data</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 hidden sm:table-cell">Referência</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="p-3 whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString('pt-PT')}
                    </td>
                    <td className="p-3 max-w-xs truncate">{t.description}</td>
                    <td className={`p-3 text-right font-medium ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {Number(t.amount).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="p-3 hidden sm:table-cell text-slate-500">{t.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card p-6">
          {/* Steps indicator */}
          <div className="flex items-center gap-2 mb-6 text-xs font-medium">
            {(['upload', 'map', 'preview', 'done'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <ChevronRight size={14} className="text-slate-300" />}
                <span
                  className={`px-2.5 py-1 rounded-full ${
                    step === s
                      ? 'bg-slate-900 text-white'
                      : 'bg-white/5 text-slate-500'
                  }`}
                >
                  {s === 'upload' ? '1. Ficheiro' : s === 'map' ? '2. Mapear' : s === 'preview' ? '3. Preview' : '4. Concluído'}
                </span>
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/25 text-sm p-3 mb-4">{error}</div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div>
              {templates.length > 0 && (
                <div className="mb-4">
                  <label className="label">Usar template guardado</label>
                  <select
                    className="input"
                    onChange={(e) => {
                      const t = templates.find((x) => x.id === e.target.value);
                      if (t) applyTemplate(t);
                    }}
                    defaultValue=""
                  >
                    <option value="">— Selecionar template —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div
                className="border-2 border-dashed border-white/15 rounded-xl p-10 text-center cursor-pointer hover:border-slate-400"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFileSelect(f);
                }}
              >
                <Upload className="mx-auto mb-2 text-slate-400" size={28} />
                <p className="text-sm">Arraste o CSV do extrato bancário ou clique</p>
                <p className="text-xs text-slate-400 mt-1">.csv · máx. 10 MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </div>
              {loading && <p className="text-center text-sm text-slate-400 mt-4">A analisar...</p>}
            </div>
          )}

          {/* Step 2: Map columns */}
          {step === 'map' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Ficheiro: <strong>{file?.name}</strong> · {headers.length} colunas
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.keys(FIELD_LABELS).map((field) => (
                  <div key={field}>
                    <label className="label">{FIELD_LABELS[field]}</label>
                    <select
                      className="input"
                      value={mapping[field]}
                      onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                    >
                      <option value="">— Não mapear —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Formato data</label>
                  <select className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="label">Separador decimal</label>
                  <select className="input" value={decimalSep} onChange={(e) => setDecimalSep(e.target.value)}>
                    <option value=",">, (vírgula)</option>
                    <option value=".">. (ponto)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Separador milhares</label>
                  <select className="input" value={thousandSep} onChange={(e) => setThousandSep(e.target.value)}>
                    <option value=".">. (ponto)</option>
                    <option value=",">, (vírgula)</option>
                    <option value="">Nenhum</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                Primeira linha é cabeçalho
              </label>
              <div className="flex gap-2 pt-2">
                <button className="btn-secondary gap-1" onClick={resetWizard}>
                  <ChevronLeft size={16} /> Voltar
                </button>
                <button
                  className="btn-primary gap-1"
                  onClick={handlePreview}
                  disabled={loading || !mapping.date || !mapping.description}
                >
                  {loading ? 'A processar...' : 'Preview'} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                {preview.totalRows} linhas válidas
                {preview.errors?.length > 0 && (
                  <span className="text-amber-600"> · {preview.errors.length} avisos</span>
                )}
              </p>
              {preview.errors?.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 rounded p-2 max-h-24 overflow-auto">
                  {preview.errors.map((e: string, i: number) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.03] text-left">
                      <th className="p-2">Data</th>
                      <th className="p-2">Descrição</th>
                      <th className="p-2 text-right">Valor</th>
                      <th className="p-2">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview?.map((r: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 whitespace-nowrap">{r.date}</td>
                        <td className="p-2 max-w-[200px] truncate">{r.description}</td>
                        <td className="p-2 text-right">{r.amount?.toFixed(2)}</td>
                        <td className="p-2">{r.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <label className="label">Guardar como template (opcional)</label>
                <input
                  className="input"
                  placeholder="ex: Millennium BCP"
                  value={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary gap-1" onClick={() => setStep('map')}>
                  <ChevronLeft size={16} /> Voltar
                </button>
                <button className="btn-primary gap-1" onClick={handleImport} disabled={loading}>
                  {loading ? 'A importar...' : `Importar ${preview.totalRows} movimentos`}
                  <Check size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && importResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
                <Check size={32} />
              </div>
              <h2 className="text-lg font-bold">Importação concluída</h2>
              <p className="text-slate-500 mt-1">
                {importResult.imported} movimentos importados
              </p>
              <button className="btn-primary mt-6" onClick={resetWizard}>
                Importar outro ficheiro
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
