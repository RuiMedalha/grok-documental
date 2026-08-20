import { applyFolderPattern } from './folder-pattern.util';

describe('applyFolderPattern', () => {
  it('replaces tokens', () => {
    const result = applyFolderPattern('/{Ano}/{Mes}/{Tipo}/{Entidade}', {
      year: 2026,
      month: 3,
      type: 'fatura_recebida',
      entity: 'EDP',
    });
    expect(result).toBe('/2026/03/fatura_recebida/EDP');
  });
});
