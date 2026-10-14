// Извлечение текста из PDF (pdfjs) — проверка печатных форм, в т. ч. армянского текста (К26).
export async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    out += c.items.map((it) => ('str' in it ? it.str : '')).join('') + '\n';
  }
  return out;
}
export const squash = (s: string) => s.replace(/\s+/g, '');
