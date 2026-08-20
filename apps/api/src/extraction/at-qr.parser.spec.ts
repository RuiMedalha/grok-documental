import { parseAtQr, atQrToDocumentFields, isLikelyAtQr } from './at-qr.parser';

describe('AT QR parser', () => {
  const sample =
    'A:500697370*B:500000000*C:PT*D:FT*E:N*F:20260315*G:FT 2026/123*H:ABCD1234-123*I1:PT*I7:100.00*I8:23.00*N:23.00*O:123.00*Q:ABCD*R:9999';

  it('detects AT QR', () => {
    expect(isLikelyAtQr(sample)).toBe(true);
  });

  it('parses core fields', () => {
    const p = parseAtQr(sample)!;
    expect(p.issuerNif).toBe('500697370');
    expect(p.buyerNif).toBe('500000000');
    expect(p.documentType).toBe('FT');
    expect(p.documentDate).toBe('2026-03-15');
    expect(p.total).toBe(123);
    expect(p.totalTax).toBe(23);
    expect(p.atcud).toBe('ABCD1234-123');
  });

  it('maps to document fields', () => {
    const p = parseAtQr(sample)!;
    const d = atQrToDocumentFields(p);
    expect(d.nif).toBe('500697370');
    expect(d.total).toBe(123);
    expect(d.type).toBe('fatura_recebida');
  });
});
