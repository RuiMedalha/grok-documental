const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  // Binary / CSV download
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/csv') || ct.includes('application/octet-stream')) {
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText);
    }
    return (await res.blob()) as any;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data.message || res.statusText, data);
  }

  return data as T;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  register: (body: any) =>
    request<any>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: any) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: (token: string) => request<any>('/auth/me', { method: 'POST' }, token),

  getInbox: (token: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/documents/inbox${qs}`, {}, token);
  },
  getDocuments: (token: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/documents${qs}`, {}, token);
  },
  getDocument: (token: string, id: string) =>
    request<any>(`/documents/${id}`, {}, token),
  updateDocument: (token: string, id: string, body: any) =>
    request<any>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  uploadDocument: async (token: string, file: File, origin = 'upload') => {
    const form = new FormData();
    form.append('file', file);
    form.append('origin', origin);
    return request<any>('/documents/upload', { method: 'POST', body: form }, token);
  },

  exportDocuments: async (token: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const blob = await request<Blob>(`/documents/export${qs}`, {}, token);
    downloadBlob(blob as any, `documentos-${new Date().toISOString().slice(0, 10)}.csv`);
  },

  detectCsvHeaders: async (token: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ headers: string[]; delimiter: string; sampleLines: string[] }>(
      '/bank/csv/headers',
      { method: 'POST', body: form },
      token,
    );
  },
  previewCsv: async (token: string, file: File, opts: any) => {
    const form = new FormData();
    form.append('file', file);
    form.append('mapping', JSON.stringify(opts.mapping));
    if (opts.dateFormat) form.append('dateFormat', opts.dateFormat);
    if (opts.decimalSep) form.append('decimalSep', opts.decimalSep);
    if (opts.thousandSep) form.append('thousandSep', opts.thousandSep);
    form.append('hasHeader', String(opts.hasHeader !== false));
    return request<any>('/bank/csv/preview', { method: 'POST', body: form }, token);
  },
  importCsv: async (token: string, file: File, opts: any) => {
    const form = new FormData();
    form.append('file', file);
    form.append('mapping', JSON.stringify(opts.mapping));
    if (opts.dateFormat) form.append('dateFormat', opts.dateFormat);
    if (opts.decimalSep) form.append('decimalSep', opts.decimalSep);
    if (opts.thousandSep) form.append('thousandSep', opts.thousandSep);
    form.append('hasHeader', String(opts.hasHeader !== false));
    if (opts.saveAsTemplate) form.append('saveAsTemplate', opts.saveAsTemplate);
    return request<any>('/bank/csv/import', { method: 'POST', body: form }, token);
  },
  listCsvTemplates: (token: string) => request<any[]>('/bank/templates', {}, token),
  createCsvTemplate: (token: string, body: any) =>
    request<any>('/bank/templates', { method: 'POST', body: JSON.stringify(body) }, token),
  listTransactions: (token: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/bank/transactions${qs}`, {}, token);
  },
  exportTransactions: async (token: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const blob = await request<Blob>(`/bank/transactions/export${qs}`, {}, token);
    downloadBlob(blob as any, `movimentos-bancarios-${new Date().toISOString().slice(0, 10)}.csv`);
  },

  runMatching: (token: string) =>
    request<any>('/reconciliation/run', { method: 'POST' }, token),
  listSuggestions: (token: string, status = 'pending') =>
    request<any[]>(`/reconciliation/suggestions?status=${status}`, {}, token),
  acceptSuggestion: (token: string, id: string) =>
    request<any>(`/reconciliation/suggestions/${id}/accept`, { method: 'POST' }, token),
  rejectSuggestion: (token: string, id: string) =>
    request<any>(`/reconciliation/suggestions/${id}/reject`, { method: 'POST' }, token),

  listFolderRules: (token: string) => request<any[]>('/folder-rules', {}, token),
  createFolderRule: (token: string, body: any) =>
    request<any>('/folder-rules', { method: 'POST', body: JSON.stringify(body) }, token),

  listIntegrations: (token: string) => request<any[]>('/integrations', {}, token),
  upsertIntegration: (token: string, provider: string, credentials: any) =>
    request<any>(`/integrations/${provider}`, {
      method: 'POST',
      body: JSON.stringify({ credentials }),
    }, token),

  getToconlineConfig: (token: string) =>
    request<any>('/integrations/toconline/config', {}, token),
  getToconlineAuthorizeUrl: (token: string, redirectUri: string) =>
    request<{ url: string }>(
      `/integrations/toconline/authorize-url?redirectUri=${encodeURIComponent(redirectUri)}`,
      {},
      token,
    ),
  exchangeToconlineCode: (token: string, code: string) =>
    request<any>('/integrations/toconline/exchange-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }, token),
  pushToToconline: (token: string, documentId: string, dryRun = false) =>
    request<any>(
      `/integrations/toconline/push/${documentId}?dryRun=${dryRun ? 'true' : 'false'}`,
      { method: 'POST' },
      token,
    ),

  // Parties (fornecedores / clientes)
  listParties: (token: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<any[]>(`/parties${q ? `?${q}` : ''}`, {}, token);
  },
  createParty: (token: string, body: any) =>
    request('/parties', { method: 'POST', body: JSON.stringify(body) }, token),
  updateParty: (token: string, id: string, body: any) =>
    request(`/parties/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  importPartiesFromCrm: (token: string, provider: string, rows: any[]) =>
    request('/parties/from-crm', {
      method: 'POST',
      body: JSON.stringify({ provider, rows }),
    }, token),

  // Accounting
  listAccounts: (token: string) => request<any[]>('/accounting/accounts', {}, token),
  seedAccounts: (token: string) =>
    request('/accounting/accounts/seed', { method: 'POST', body: '{}' }, token),
  classifyDocument: (token: string, id: string, body: any) =>
    request(`/accounting/documents/${id}/classify`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, token),
  getJournal: (token: string, id: string) =>
    request(`/accounting/documents/${id}/journal`, {}, token),

  // Payables
  listPayables: (token: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<any[]>(`/payables${q ? `?${q}` : ''}`, {}, token);
  },
  payablesSummary: (token: string) => request('/payables/summary', {}, token),
  markPayablePaid: (token: string, id: string, body: any = {}) =>
    request(`/payables/${id}/pay`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  // CRM
  getCrmContacts: (token: string, provider: string) =>
    request(`/integrations/${provider}/contacts`, {}, token),

  extractDocument: (token: string, id: string) =>
    request(`/extraction/documents/${id}`, { method: 'POST', body: '{}' }, token),

  exportSepa: async (token: string, format: 'csv' | 'xml' = 'csv', status = 'to_pay') => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const res = await fetch(
      `${API_URL}/payables/export/sepa?format=${format}&status=${status}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error('Erro ao exportar SEPA');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'xml' ? 'sepa-pagamentos.xml' : 'sepa-pagamentos.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  listNotifications: (token: string) => request<any[]>('/notifications', {}, token),
  getTenant: (token: string) => request<any>('/tenants/me', {}, token),
  updateTenant: (token: string, body: any) =>
    request('/tenants/me', { method: 'PATCH', body: JSON.stringify(body) }, token),

  globalSearch: (token: string, q: string, limit = 8) =>
    request<{ query: string; total: number; results: any[] }>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      {},
      token,
    ),

  applyAtQr: (token: string, documentId: string, qrText: string) =>
    request(`/extraction/documents/${documentId}/at-qr`, {
      method: 'POST',
      body: JSON.stringify({ qrText }),
    }, token),
  parseAtQr: (token: string, qrText: string) =>
    request('/extraction/at-qr/parse', {
      method: 'POST',
      body: JSON.stringify({ qrText }),
    }, token),

  getScanConfig: (token: string) => request<any>('/inbound/scan-config', {}, token),
  regenerateScanToken: (token: string) =>
    request('/inbound/scan-config/regenerate', { method: 'POST', body: '{}' }, token),

  importFromUrl: (token: string, url: string) =>
    request('/inbound/from-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }, token),

  getMailConfig: (token: string) => request<any>('/inbound/mail/config', {}, token),
  saveMailConfig: (token: string, body: any) =>
    request('/inbound/mail/config', { method: 'POST', body: JSON.stringify(body) }, token),
  syncInboundMail: (token: string) =>
    request('/inbound/mail/sync', { method: 'POST', body: '{}' }, token),
};
