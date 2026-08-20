'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { FileText, Search, Download, Filter } from 'lucide-react';
import Link from 'next/link';

export default function DocumentsPage() {
  const { accessToken } = useAuth();
  const [docs, setDocs] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const res = await api.getDocuments(accessToken, params);
      setDocs(res.items || []);
      setMeta(res.meta || { total: 0 });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accessToken, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  function statusBadge(s: string) {
    const map: Record<string, string> = {
      novo: 'badge-amber',
      processado: 'badge-emerald',
      em_revisao: 'badge-sky',
      arquivado: 'badge-violet',
    };
    return map[s] || 'badge-sky';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in">
        <div>
          <h1 className="page-title">Documentos</h1>
          <p className="page-subtitle">{meta.total} no total</p>
        </div>
        <button
          className="btn-secondary gap-2 text-sm"
          onClick={async () => {
            if (!accessToken) return;
            try {
              const params: Record<string, string> = {};
              if (search) params.search = search;
              if (status) params.status = status;
              await api.exportDocuments(accessToken, params);
            } catch (e: any) {
              alert(e.message || 'Erro ao exportar');
            }
          }}
        >
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 animate-in animate-delay-1">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-subtle)' }}
          />
          <input
            className="input pl-10"
            placeholder="Pesquisar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative sm:w-48">
          <Filter
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-subtle)' }}
          />
          <select
            className="input pl-9 appearance-none"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos os estados</option>
            <option value="novo">Novo</option>
            <option value="processado">Processado</option>
            <option value="em_revisao">Em revisão</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="mx-auto mb-3 opacity-30" size={36} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Sem documentos
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden animate-in animate-delay-2">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ficheiro', 'Tipo', 'Estado', 'Data'].map((h) => (
                    <th
                      key={h}
                      className="p-3.5 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: 'var(--text-subtle)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <td className="p-3.5">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="flex items-center gap-2.5 font-medium hover:text-sky-400 transition-colors"
                        style={{ color: 'var(--text)' }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                          <FileText size={14} className="text-sky-400" />
                        </div>
                        <span className="truncate max-w-[240px]">{doc.fileName}</span>
                      </Link>
                    </td>
                    <td className="p-3.5" style={{ color: 'var(--text-muted)' }}>
                      {doc.type}
                    </td>
                    <td className="p-3.5">
                      <span className={statusBadge(doc.status)}>{doc.status}</span>
                    </td>
                    <td className="p-3.5" style={{ color: 'var(--text-subtle)' }}>
                      {new Date(doc.createdAt).toLocaleDateString('pt-PT')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <ul className="md:hidden">
            {docs.map((doc) => (
              <li key={doc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <Link href={`/documents/${doc.id}`} className="row-link">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                      {doc.fileName}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                      {doc.type} · {new Date(doc.createdAt).toLocaleDateString('pt-PT')}
                    </div>
                  </div>
                  <span className={statusBadge(doc.status)}>{doc.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
