'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Upload, FileText, RefreshCw, Search, Sparkles } from 'lucide-react';
import { AtQrScanButton } from '@/components/AtQrScanner';
import { ScannerButton } from '@/components/DocumentScanner';
import Link from 'next/link';

interface Document {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: string;
  type: string;
  origin: string;
  supplier?: string;
  total?: number;
  createdAt: string;
  suggestedFolder?: string;
}

export default function InboxPage() {
  const { accessToken } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const res = await api.getInbox(accessToken, params);
      setDocs(res.items || []);
      setMeta(res.meta || { total: 0, page: 1 });
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [accessToken, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length || !accessToken) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        await api.uploadDocument(accessToken, file, 'upload');
      }
      await load();
    } catch (err: any) {
      setError(err.message || 'Erro no upload');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in">
        <div>
          <h1 className="page-title">Inbox</h1>
          <p className="page-subtitle">
            {meta.total} documento(s) por processar
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="btn-primary"
            disabled={uploading}
          >
            <Upload size={16} />
            {uploading ? 'A enviar…' : 'Upload'}
          </button>
          <ScannerButton
            label="Scanner"
            onDone={() => load()}
          />
          <AtQrScanButton
            label="QR AT"
            onScan={async (qrText) => {
              if (!accessToken) return;
              try {
                // Cria doc placeholder a partir do QR e aplica dados
                const blob = new Blob([qrText], { type: 'text/plain' });
                const file = new File([blob], `qr-at-${Date.now()}.txt`, { type: 'text/plain' });
                const uploaded = await api.uploadDocument(accessToken, file, 'mobile');
                await api.applyAtQr(accessToken, uploaded.id, qrText);
                await load();
                setError('');
              } catch (err: any) {
                setError(err.message || 'Erro ao processar QR');
              }
            }}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.docx,.doc"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleUpload(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className={`card p-8 md:p-10 text-center cursor-pointer transition-all duration-300 animate-in animate-delay-1 ${
          dragOver
            ? 'border-sky-400/50 shadow-[0_0_40px_rgba(56,189,248,0.2)] scale-[1.01]'
            : 'hover:border-sky-500/30'
        }`}
        style={{ borderStyle: 'dashed', borderWidth: 2 }}
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/20 border border-sky-500/20 flex items-center justify-center">
          <Upload className="text-sky-400" size={24} />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          Arraste ficheiros aqui ou clique para selecionar
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-subtle)' }}>
          PDF, JPG, PNG, DOCX · máx. 20 MB
        </p>
      </div>

      <div className="card p-4 animate-in animate-delay-1 space-y-2">
        <label className="label">Importar por link (Moloni, TOConline, email…)</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input flex-1"
            placeholder="https://…/fatura.pdf"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={linkLoading || !linkUrl.trim()}
            onClick={async () => {
              if (!accessToken || !linkUrl.trim()) return;
              setLinkLoading(true);
              setError('');
              try {
                await api.importFromUrl(accessToken, linkUrl.trim());
                setLinkUrl('');
                await load();
              } catch (err: any) {
                setError(err.message || 'Não foi possível obter o documento do link');
              } finally {
                setLinkLoading(false);
              }
            }}
          >
            {linkLoading ? 'A obter…' : 'Obter fatura'}
          </button>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          Se o link abrir página com login, use anexo PDF ou API Moloni/TOConline.
        </p>
      </div>

      <div className="relative animate-in animate-delay-2">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-subtle)' }}
        />
        <input
          className="input pl-10"
          placeholder="Pesquisar por nome, fornecedor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm p-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="card p-12 text-center animate-in">
          <Sparkles className="mx-auto mb-3 opacity-40 text-sky-400" size={32} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Inbox vazio — faça o primeiro upload
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden animate-in animate-delay-3">
          <ul>
            {docs.map((doc, idx) => (
              <li
                key={doc.id}
                className="border-b last:border-0 transition-colors"
                style={{ borderColor: 'var(--border)' }}
              >
                <Link
                  href={`/documents/${doc.id}`}
                  className="row-link group"
                  style={{ animationDelay: `${idx * 0.03}s` }}
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500/15 to-indigo-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <FileText size={18} className="text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>
                      {doc.fileName}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                      {formatSize(doc.fileSize)} · {doc.origin} · {formatDate(doc.createdAt)}
                    </div>
                  </div>
                  <span className="badge-amber">{doc.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
