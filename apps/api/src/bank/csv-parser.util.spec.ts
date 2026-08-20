import { parseDate, parseAmount, parseCsvContent } from './csv-parser.util';

describe('csv-parser', () => {
  describe('parseDate', () => {
    it('parses DD/MM/YYYY', () => {
      const d = parseDate('15/03/2026', 'DD/MM/YYYY');
      expect(d?.getFullYear()).toBe(2026);
      expect(d?.getMonth()).toBe(2);
      expect(d?.getDate()).toBe(15);
    });

    it('parses YYYY-MM-DD', () => {
      const d = parseDate('2026-03-15', 'YYYY-MM-DD');
      expect(d?.getFullYear()).toBe(2026);
    });
  });

  describe('parseAmount', () => {
    it('parses European format', () => {
      expect(parseAmount('1.234,56', ',', '.')).toBeCloseTo(1234.56);
    });

    it('parses US format', () => {
      expect(parseAmount('1,234.56', '.', ',')).toBeCloseTo(1234.56);
    });
  });

  describe('parseCsvContent', () => {
    const csv = `Data;Descrição;Valor
15/03/2026;Pagamento EDP;-45,90
16/03/2026;Transferência cliente;1500,00`;

    it('parses PT bank CSV with semicolon', () => {
      const result = parseCsvContent(csv, {
        mapping: { date: 'Data', description: 'Descrição', amount: 'Valor' },
        dateFormat: 'DD/MM/YYYY',
        decimalSep: ',',
        thousandSep: '.',
        hasHeader: true,
      });
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].amount).toBeCloseTo(-45.9);
      expect(result.rows[1].amount).toBeCloseTo(1500);
      expect(result.errors).toHaveLength(0);
    });
  });
});
