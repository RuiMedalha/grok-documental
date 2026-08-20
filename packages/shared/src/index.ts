// Shared types and constants for DocFlow SaaS

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

export enum AuditAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  UPLOAD = 'upload',
  EDIT = 'edit',
  APPROVE = 'approve',
  REJECT = 'reject',
  IMPORT = 'import',
  RECONCILE = 'reconcile',
  CREATE_TENANT = 'create_tenant',
  INVITE_USER = 'invite_user',
  DELETE = 'delete',
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  tenantId: string;
  role: UserRole;
  type: 'access' | 'refresh';
}

export const ROLES_HIERARCHY: Record<UserRole, number> = {
  [UserRole.ADMIN]: 4,
  [UserRole.ACCOUNTING]: 3,
  [UserRole.APPROVER]: 2,
  [UserRole.OPERATOR]: 1,
};
