'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Plus } from 'lucide-react';

export default function SettingsPage() {
  const { accessToken, tenant, user } = useAuth();
  const [rules, setRules] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [tocConfig, setTocConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState({
    name: '',
    folderPattern: '/{Ano}/{Mes}/{Tipo}/{Entidade}',
    priority: 0,
  });
  const [wooCreds, setWooCreds] = useState({ url: '', consumerKey: '', consumerSecret: '' });
  const [tocCreds, setTocCreds] = useState({
    clientId: '',
    clientSecret: '',
    apiUrl: '',
    oauthUrl: '',
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.listFolderRules(accessToken).catch(() => []),
      api.listIntegrations(accessToken).catch(() => []),
      api.getToconlineConfig(accessToken).catch(() => null),
    ]).then(([r, i, t]) => {
      setRules(r);
      setIntegrations(i);
      setTocConfig(t);
      setLoading(false);
    });
  }, [accessToken]);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    try {
      const created = await api.createFolderRule(accessToken, {
        ...newRule,
        conditions: {},
      });
      setRules((prev) => [...prev, created]);
      setNewRule({ name: '', folderPattern: '/{Ano}/{Mes}/{Tipo}/{Entidade}', priority: 0 });
      setMessage('Regra criada');
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function saveWoo(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    try {
      await api.upsertIntegration(accessToken, 'woocommerce', wooCreds);
      setMessage('WooCommerce configurado');
      const list = await api.listIntegrations(accessToken);
      setIntegrations(list);
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function saveToc(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    try {
      await api.upsertIntegration(accessToken, 'toconline', tocCreds);
      setMessage('Credenciais TOConline guardadas');
      const cfg = await api.getToconlineConfig(accessToken);
      setTocConfig(cfg);
      const list = await api.listIntegrations(accessToken);
      setIntegrations(list);
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function startTocOAuth() {
    if (!accessToken) return;
    try {
      const redirectUri = `${window.location.origin}/settings`;
      const { url } = await api.getToconlineAuthorizeUrl(accessToken, redirectUri);
      window.location.href = url;
    } catch (err: any) {
      setMessage(err.message || 'Configure primeiro clientId/secret/URLs');
    }
  }

  // Handle OAuth callback ?code=
  useEffect(() => {
    if (!accessToken || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      api
        .exchangeToconlineCode(accessToken, code)
        .then(() => {
          setMessage('Token TOConline obtido com sucesso');
          window.history.replaceState({}, '', '/settings');
          return api.getToconlineConfig(accessToken);
        })
        .then((cfg) => setTocConfig(cfg))
        .catch((e) => setMessage(e.message || 'Erro no OAuth TOConline'));
    }
  }, [accessToken]);

  if (loading) {
    return <div className="text-center py-12 text-slate-400">A carregar...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Definições</h1>
        <p className="text-sm text-slate-500">
          {tenant?.name} · {user?.email}
        </p>
      </div>

      {message && (
        <div className="rounded-lg bg-white/5 text-slate-300 text-sm p-3">{message}</div>
      )}

      <section className="card p-6">
        <h2 className="font-semibold mb-4">Regras de pastas</h2>
        <p className="text-xs text-slate-500 mb-4">
          Tokens: {'{Ano}'} {'{Mes}'} {'{Tipo}'} {'{Entidade}'}
        </p>

        {rules.length > 0 && (
          <ul className="space-y-2 mb-4">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between text-sm border-b border-white/5 pb-2"
              >
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-slate-400 ml-2 text-xs">{r.folderPattern}</span>
                </div>
                <span className="text-xs text-slate-400">prio {r.priority}</span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addRule} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="input"
            placeholder="Nome da regra"
            value={newRule.name}
            onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Padrão /{Ano}/{Mes}/..."
            value={newRule.folderPattern}
            onChange={(e) => setNewRule({ ...newRule, folderPattern: e.target.value })}
            required
          />
          <button type="submit" className="btn-primary gap-1">
            <Plus size={16} /> Adicionar
          </button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold mb-2">TOConline</h2>
        <p className="text-xs text-slate-500 mb-4">
          Obtenha client_id, secret, API URL e OAuth URL em{' '}
          <strong>Empresa → Configurações → Dados API</strong> no TOConline.
          Documentação: api-docs.toconline.pt
        </p>

        {tocConfig && (
          <div className="text-sm mb-4 flex flex-wrap gap-3">
            <span className={`px-2 py-0.5 rounded-full text-xs ${tocConfig.configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {tocConfig.configured ? 'Credenciais OK' : 'Não configurado'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${tocConfig.hasToken ? 'bg-green-100 text-green-800' : 'bg-white/5 text-slate-600'}`}>
              {tocConfig.hasToken ? 'OAuth token ativo' : 'Sem token OAuth'}
            </span>
            {tocConfig.apiUrl && (
              <span className="text-xs text-slate-400 truncate max-w-xs">{tocConfig.apiUrl}</span>
            )}
          </div>
        )}

        <form onSubmit={saveToc} className="space-y-3 max-w-lg">
          <input
            className="input"
            placeholder="Client ID (OAUTH_CLIENT_ID)"
            value={tocCreds.clientId}
            onChange={(e) => setTocCreds({ ...tocCreds, clientId: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Client Secret"
            type="password"
            value={tocCreds.clientSecret}
            onChange={(e) => setTocCreds({ ...tocCreds, clientSecret: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="API URL (ex: https://...)"
            value={tocCreds.apiUrl}
            onChange={(e) => setTocCreds({ ...tocCreds, apiUrl: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="OAuth URL"
            value={tocCreds.oauthUrl}
            onChange={(e) => setTocCreds({ ...tocCreds, oauthUrl: e.target.value })}
            required
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary text-sm">
              Guardar TOConline
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={startTocOAuth}>
              Autorizar OAuth
            </button>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold mb-4">Outras integrações</h2>

        {integrations.length > 0 && (
          <ul className="space-y-2 mb-4">
            {integrations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 text-sm">
                <span
                  className={`w-2 h-2 rounded-full ${i.isActive ? 'bg-green-500' : 'bg-slate-300'}`}
                />
                <span className="font-medium capitalize">{i.provider}</span>
                <span className="text-xs text-slate-400">
                  {i.lastSyncAt
                    ? `Último sync: ${new Date(i.lastSyncAt).toLocaleString('pt-PT')}`
                    : 'Nunca sincronizado'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={saveWoo} className="space-y-3 max-w-md">
          <h3 className="text-sm font-medium">WooCommerce</h3>
          <input
            className="input"
            placeholder="URL da loja (https://...)"
            value={wooCreds.url}
            onChange={(e) => setWooCreds({ ...wooCreds, url: e.target.value })}
          />
          <input
            className="input"
            placeholder="Consumer Key"
            value={wooCreds.consumerKey}
            onChange={(e) => setWooCreds({ ...wooCreds, consumerKey: e.target.value })}
          />
          <input
            className="input"
            placeholder="Consumer Secret"
            type="password"
            value={wooCreds.consumerSecret}
            onChange={(e) => setWooCreds({ ...wooCreds, consumerSecret: e.target.value })}
          />
          <button type="submit" className="btn-primary text-sm">
            Guardar WooCommerce
          </button>
        </form>

        <p className="text-xs text-slate-400 mt-4">
          Ifthenpay callback: POST /api/integrations/ifthenpay/callback?tenantId=YOUR_TENANT_ID
        </p>
      </section>

      <section className="card p-5 space-y-3 mt-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          Empresa · SEPA (ordenante)
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          IBAN/BIC da sua empresa para o ficheiro de transferências.
        </p>
        <TenantBankForm />
      </section>

      <section className="card p-5 space-y-3 mt-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          Scanner / Multifunções
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          Receba PDFs/JPG diretamente da impressora multifunções ou pasta de rede.
        </p>
        <ScanInboundPanel />
      </section>

      <section className="card p-5 space-y-3 mt-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          Email de faturas (automático)
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          Ligue a caixa onde chegam Moloni, TOConline e fornecedores.
          O DocFlow lê emails novos, descarrega anexos e links de PDF — sem passos manuais.
        </p>
        <ImapMailPanel />
      </section>


    </div>
  );
}

function TenantBankForm() {
  const { accessToken } = useAuth();
  const [form, setForm] = useState({
    name: '',
    nif: '',
    iban: '',
    bic: '',
    bankName: '',
    address: '',
  });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getTenant(accessToken)
      .then((t) => {
        setForm({
          name: t.name || '',
          nif: t.nif || '',
          iban: t.iban || '',
          bic: t.bic || '',
          bankName: t.bankName || '',
          address: t.address || '',
        });
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setMsg('');
    try {
      await api.updateTenant(accessToken, form);
      setMsg('Dados da empresa guardados');
    } catch (err: any) {
      setMsg(err.message || 'Erro');
    }
  }

  if (loading) return <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>A carregar…</div>;

  return (
    <form onSubmit={save} className="space-y-3 max-w-md">
      <div>
        <label className="label">Nome</label>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label className="label">NIF</label>
        <input className="input" value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
      </div>
      <div>
        <label className="label">IBAN</label>
        <input className="input" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="PT50..." />
      </div>
      <div>
        <label className="label">BIC</label>
        <input className="input" value={form.bic} onChange={(e) => setForm({ ...form, bic: e.target.value })} />
      </div>
      <div>
        <label className="label">Banco</label>
        <input className="input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
      </div>
      <div>
        <label className="label">Morada</label>
        <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      {msg && <p className="text-xs text-sky-400">{msg}</p>}
      <button type="submit" className="btn-primary text-sm">
        Guardar empresa
      </button>
    </form>
  );
}

function ScanInboundPanel() {
  const { accessToken } = useAuth();
  const [cfg, setCfg] = useState<any>(null);
  const [msg, setMsg] = useState('');

  async function load() {
    if (!accessToken) return;
    const c = await api.getScanConfig(accessToken);
    setCfg(c);
  }

  useEffect(() => {
    load().catch(() => {});
  }, [accessToken]);

  async function regen() {
    if (!accessToken) return;
    await api.regenerateScanToken(accessToken);
    setMsg('Token regenerado');
    await load();
  }

  if (!cfg) {
    return <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>A carregar…</div>;
  }

  return (
    <div className="space-y-3 text-sm max-w-xl">
      <div>
        <label className="label">URL de drop (POST multipart)</label>
        <input className="input font-mono text-xs" readOnly value={cfg.dropUrl || ''} onFocus={(e) => e.target.select()} />
      </div>
      <div>
        <label className="label">Token</label>
        <input className="input font-mono text-xs" readOnly value={cfg.scanToken || ''} onFocus={(e) => e.target.select()} />
      </div>
      <div className="rounded-xl border p-3 text-xs space-y-2" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <p><strong>1. Multifunções → Scan to Email</strong><br/>Anexe PDF/JPG para um endereço encaminhado ao webhook <code className="text-sky-400">POST /api/inbound/email</code> (SendGrid Inbound / Mailgun), com o token no destinatário.</p>
        <p><strong>2. Scan to Network Folder</strong><br/>Pasta partilhada + script: <code className="text-sky-400">SCAN_FOLDER=... SCAN_URL=&lt;dropUrl&gt; node scripts/scan-folder-watcher.js</code></p>
        <p><strong>3. Teste rápido</strong><br/><code className="text-sky-400">curl -X POST &quot;{cfg.dropUrl}&quot; -F &quot;file=@fatura.pdf&quot;</code></p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={() => load()}>Atualizar</button>
        <button type="button" className="btn-secondary text-xs" onClick={regen}>Regenerar token</button>
      </div>
      {msg && <p className="text-xs text-sky-400">{msg}</p>}
    </div>
  );
}

function ImapMailPanel() {
  const { accessToken } = useAuth();
  const [form, setForm] = useState({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    user: '',
    pass: '',
    mailbox: 'INBOX',
    markSeen: true,
  });
  const [info, setInfo] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.getMailConfig(accessToken).then((c) => {
      setInfo(c);
      if (c?.configured) {
        setForm((f) => ({
          ...f,
          host: c.host || f.host,
          port: c.port || f.port,
          secure: c.secure !== false,
          user: c.user || '',
          mailbox: c.mailbox || 'INBOX',
          markSeen: c.markSeen !== false,
        }));
      }
    }).catch(() => {});
  }, [accessToken]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setMsg('');
    try {
      await api.saveMailConfig(accessToken, form);
      setMsg('IMAP guardado');
      setInfo({ configured: true, ...form, passSet: true });
    } catch (err: any) {
      setMsg(err.message || 'Erro');
    }
  }

  async function syncNow() {
    if (!accessToken) return;
    setSyncing(true);
    setMsg('');
    try {
      const r = await api.syncInboundMail(accessToken);
      setMsg(`Sync: ${r.processed} processados, ${r.errors || 0} erros`);
    } catch (err: any) {
      setMsg(err.message || 'Falha no sync');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 max-w-md">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="label">Servidor IMAP</label>
          <input className="input" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="imap.gmail.com" />
        </div>
        <div>
          <label className="label">Porta</label>
          <input className="input" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Caixa</label>
          <input className="input" value={form.mailbox} onChange={(e) => setForm({ ...form, mailbox: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">Utilizador (email)</label>
          <input className="input" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">Password / App password</label>
          <input className="input" type="password" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} placeholder={info?.passSet ? '••••••••' : ''} />
        </div>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
        Gmail/Microsoft: use palavra-passe de aplicação. Reencaminhe faturas para esta caixa ou use uma dedicada (ex. faturas@empresa.pt).
      </p>
      {msg && <p className="text-xs text-sky-400">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary text-xs">Guardar IMAP</button>
        <button type="button" className="btn-secondary text-xs" disabled={syncing} onClick={syncNow}>
          {syncing ? 'A sincronizar…' : 'Sincronizar agora'}
        </button>
      </div>
    </form>
  );
}
