export enum UserRole {
  ADMIN = 'ADMIN',
  ACCOUNTING = 'ACCOUNTING',
  OPERATOR = 'OPERATOR',
  APPROVER = 'APPROVER',
}

export enum DocumentType {
  FATURA_RECEBIDA = 'fatura_recebida',
  FATURA_EMITIDA = 'fatura_emitida',
  RECIBO = 'recibo',
  COMPROVATIVO = 'comprovativo',
  ENCOMENDA = 'encomenda',
  OUTRO = 'outro',
}

export enum DocumentStatus {
  NOVO = 'novo',
  PROCESSADO = 'processado',
  EM_REVISAO = 'em_revisao',
  ARQUIVADO = 'arquivado',
}

export enum DocumentOrigin {
  UPLOAD = 'upload',
  EMAIL = 'email',
  SCANNER = 'scanner',
  MOBILE = 'mobile',
  WHATSAPP = 'whatsapp',
}
