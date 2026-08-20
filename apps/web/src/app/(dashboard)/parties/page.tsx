'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Users, Plus, Search, RefreshCw, Download } from 'lucide-react';

export default function PartiesPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    nif: '',
    type: 'supplier',
    email: '',
    phone: '',
    iban: '',
    paymentTermDays: 30,
  });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (type !== 'all') params.type = type;
      const data = await api.listParties(accessToken, params);
      setItems(data || []);
    } finally {
      setLoading(false);
    }
  }, [accessToken, search, type]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!accessToken || !form.name) return;
    await api.createParty(accessToken, form);
    setShowForm(false);
    setForm({
      name: '',
      nif: '',
      type: 'supplier',
      email: '',
      phone: '',
      iban: '',
      paymentTermDays: 30,
    });
    load();
  }

  async function importCrm(provider: string) {
    if (!accessToken) return;
    setMsg('A obter contactos do CRM…');
    try {
      const res = await api.getCrmContacts(accessToken, provider);
      if (!res.rows?.length) {
        setMsg(res.message || 'Sem contactos');
        return;
      }
      const imported = await api.importPartiesFromCrm(accessToken, provider, res.rows);
      setMsg(`${imported.imported} entidades importadas de ${provider}`);
      load();
    } catch (e: any) {
      setMsg(e.message || 'Erro CRM');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in">
        <div>
          <h1 className="page-title">Entidades</h1>
          <p className="page-subtitle">Fornecedores e clientes · dados mestre</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => importCrm('hubspot')} className="btn-secondary text-xs">
            <Download size={14} /> HubSpot
          </button>
          <button onClick={() => importCrm('pipedrive')} className="btn-secondary text-xs">
            <Download size={14} /> Pipedrive
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs">
            <Plus size={14} /> Nova entidade
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl border text-sm p-3" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          {msg}
        </div>
      )}

      {showForm && (
        <div className="card p-5 space-y-3 animate-in">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
            Nova entidade
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">NIF</label>
              <input className="input" value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="supplier">Fornecedor</option>
                <option value="customer">Cliente</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            <div>
              <label className="label">Prazo pagamento (dias)</label>
              <input
                className="input"
                type="number"
                value={form.paymentTermDays}
                onChange={(e) => setForm({ ...form, paymentTermDays: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">IBAN</label>
              <input className="input" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={create} className="btn-primary text-xs">
              Guardar
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-xs">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3 animate-in animate-delay-1">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
          <input className="input pl-10" placeholder="Pesquisar nome, NIF, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input sm:w-40" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">Todos</option>
          <option value="supplier">Fornecedores</option>
          <option value="customer">Clientes</option>
        </select>
        <button onClick={load} className="btn-secondary">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="card overflow-hidden animate-in animate-delay-2">
        {loading ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: 'var(--text-subtle)' }}>
            <Users className="mx-auto mb-3 opacity-40" size={32} />
            Sem entidades. Crie ou importe do CRM.
          </div>
        ) : (
          <ul>
            {items.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-300">
                  {(p.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                    {p.name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                    {[p.nif && `NIF ${p.nif}`, p.email, p.paymentTermDays != null && `${p.paymentTermDays}d`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={p.type === 'customer' ? 'badge-sky' : p.type === 'both' ? 'badge-violet' : 'badge-amber'}>
                  {p.type === 'supplier' ? 'Fornecedor' : p.type === 'customer' ? 'Cliente' : 'Ambos'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
