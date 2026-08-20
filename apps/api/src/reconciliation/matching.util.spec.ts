import { scoreMatch } from './matching.util';

describe('scoreMatch', () => {
  const base = {
    bankDesc: 'PAGAMENTO FATURA 12345 FORNECEDOR X',
    bankAmount: 150.5,
    bankDate: new Date('2026-03-15'),
    entityAmount: 150.5,
  };

  it('returns strong match on reference', () => {
    const r = scoreMatch({
      ...base,
      bankRef: 'REF-999',
      entityRef: 'REF-999',
    });
    expect(r?.matchType).toBe('strong');
    expect(r?.score).toBe(1);
  });

  it('returns medium match on order number in description', () => {
    const r = scoreMatch({
      ...base,
      orderNumber: '12345',
    });
    expect(r?.matchType).toBe('medium');
    expect(r?.score).toBeGreaterThanOrEqual(0.75);
  });

  it('returns weak match on amount + close date', () => {
    const r = scoreMatch({
      ...base,
      entityDate: new Date('2026-03-14'),
      entityDesc: 'FORNECEDOR X',
    });
    expect(r?.matchType).toBe('weak');
    expect(r?.score).toBeGreaterThan(0.5);
  });

  it('returns null when amount differs', () => {
    const r = scoreMatch({
      ...base,
      entityAmount: 200,
    });
    expect(r).toBeNull();
  });
});
