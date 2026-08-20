export function applyFolderPattern(
  pattern: string,
  ctx: {
    year?: number;
    month?: number;
    type?: string;
    entity?: string;
  },
): string {
  const now = new Date();
  const year = ctx.year ?? now.getFullYear();
  const month = String(ctx.month ?? now.getMonth() + 1).padStart(2, '0');
  return pattern
    .replace('{Ano}', String(year))
    .replace('{Mes}', month)
    .replace('{Tipo}', ctx.type || 'outro')
    .replace('{Entidade}', ctx.entity || 'Geral');
}
