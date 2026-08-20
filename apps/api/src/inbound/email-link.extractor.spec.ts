import { pickInvoiceLinks, extractUrlsFromEmail } from './email-link.extractor';

describe('email link extractor', () => {
  it('finds moloni-style links', () => {
    const html = `
      <p>A sua fatura está disponível</p>
      <a href="https://www.moloni.pt/downloads/abc123/fatura.pdf">Descarregar</a>
      <a href="https://facebook.com/x">social</a>
    `;
    const links = pickInvoiceLinks(html);
    expect(links[0]).toContain('moloni');
  });

  it('prefers pdf over generic', () => {
    const text = `
      Veja em https://example.com/page
      PDF: https://cdn.example.com/docs/ft-2026.pdf?x=1
    `;
    const links = pickInvoiceLinks(text);
    expect(links[0]).toContain('.pdf');
  });
});
