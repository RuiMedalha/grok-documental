import { ExtractionService } from './extraction.service';

/** Minimal test without Nest DI — instantiate with mocks */
describe('ExtractionService.extractFromText', () => {
  const service = new ExtractionService({} as any, {} as any);

  const sample = `
    FATURA FT 2026/123
    Fornecedor: EDP Comercial
    NIF: 500697370
    Data: 10/03/2026
    Vencimento: 10/04/2026
    IVA: 23,00
    Total a pagar: 123,00 €
  `;

  it('extracts NIF, total, dates and supplier', () => {
    const r = service.extractFromText(sample);
    expect(r.nif).toBe('500697370');
    expect(r.total).toBe(123);
    expect(r.iva).toBe(23);
    expect(r.docDate).toBe('2026-03-10');
    expect(r.dueDate).toBe('2026-04-10');
    expect(r.supplier?.toLowerCase()).toContain('edp');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('handles empty text with low confidence', () => {
    const r = service.extractFromText('');
    expect(r.confidence).toBeLessThan(0.3);
  });
});
