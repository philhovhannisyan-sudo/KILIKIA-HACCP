// Общий макет печатных форм (brief §11): встроенные локальные шрифты с кириллицей и армянским,
// повтор шапки таблиц, перенос по словам, колонтитул «стр. N из M · дата формирования · кто сформировал».
import pdfmake from 'pdfmake';
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import fontkit from '@foliojs-fork/fontkit';
import { fileURLToPath } from 'node:url';
import type { Translator } from '../i18n';
import { formatDateTime } from '../../shared/time';

const font = (f: string) => fileURLToPath(new URL(`../../assets/fonts/${f}`, import.meta.url));
const FONTS = {
  Sans: { normal: font('NotoSans_400Regular.ttf'), bold: font('NotoSans_700Bold.ttf'), italics: font('NotoSans_400Regular.ttf'), bolditalics: font('NotoSans_700Bold.ttf') },
  Armenian: { normal: font('NotoSansArmenian_400Regular.ttf'), bold: font('NotoSansArmenian_700Bold.ttf'), italics: font('NotoSansArmenian_400Regular.ttf'), bolditalics: font('NotoSansArmenian_700Bold.ttf') },
  Math: { normal: font('NotoSansMath_400Regular.ttf'), bold: font('NotoSansMath_400Regular.ttf'), italics: font('NotoSansMath_400Regular.ttf'), bolditalics: font('NotoSansMath_400Regular.ttf') },
};
type PdfDoc = { on(e: string, cb: (x: Buffer) => void): void; end(): void };
const Printer = pdfmake as unknown as new (fonts: unknown) => { createPdfKitDocument(d: TDocumentDefinitions): PdfDoc };
const printer = new Printer(FONTS);

// pdfmake не подставляет шрифт по символу: строка режется на прогоны по наличию глифа (Sans → Armenian → Math)
const faces = (['Sans', 'Armenian', 'Math'] as const).map((name) => ({ name, f: fontkit.openSync(FONTS[name].normal) }));
const faceFor = (cp: number) => faces.find((x) => x.f.hasGlyphForCodePoint(cp))?.name ?? 'Sans';

export function runs(text: string, style: Record<string, unknown> = {}): Content {
  const out: { text: string; font: string }[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const face = cp <= 0x20 ? (out.at(-1)?.font ?? 'Sans') : faceFor(cp);
    const last = out.at(-1);
    if (last && last.font === face) last.text += ch;
    else out.push({ text: ch, font: face });
  }
  if (out.length === 0) out.push({ text: '', font: 'Sans' });
  return { text: out.map((r) => ({ ...r })), ...style } as Content;
}

export const cell = (text: string | number | null | undefined, style: Record<string, unknown> = {}): TableCell =>
  runs(text === null || text === undefined ? '—' : String(text), style) as TableCell;

/** Таблица с повторяющейся шапкой. */
export function table(headers: string[], rows: (string | number | null | undefined)[][], widths: (string | number)[]): Content {
  return {
    table: {
      headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths,
      body: [headers.map((h) => cell(h, { bold: true, fillColor: '#e3f1ea' })), ...rows.map((r) => r.map((c) => cell(c)))],
    },
    layout: { hLineColor: '#c9d3cf', vLineColor: '#c9d3cf', paddingTop: () => 3, paddingBottom: () => 3 },
    margin: [0, 4, 0, 10],
    fontSize: 8,
  } as Content;
}

export const heading = (text: string, level: 1 | 2 = 1): Content => runs(text, { fontSize: level === 1 ? 15 : 12, bold: true, margin: [0, level === 1 ? 12 : 8, 0, 6] });
export const para = (text: string, style: Record<string, unknown> = {}): Content => runs(text, { margin: [0, 0, 0, 6], ...style });

export interface PrintMeta { title: string; generatedBy: string; roles: string; generatedAt: Date }

export function renderPdf(tr: Translator, meta: PrintMeta, content: Content[], landscape = true): Promise<Buffer> {
  const stamp = formatDateTime(meta.generatedAt, tr.lang);
  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: landscape ? 'landscape' : 'portrait',
    pageMargins: [36, 40, 36, 44],
    info: { title: meta.title, creator: 'HACCP Suite' },
    defaultStyle: { font: 'Sans', fontSize: 9, lineHeight: 1.2 },
    header: () => runs(meta.title, { fontSize: 8, color: '#5b6763', margin: [36, 18, 36, 0] }),
    footer: (page: number, pages: number) => runs(
      tr.t('print.footer', { page, pages, date: stamp, user: meta.generatedBy, roles: meta.roles }),
      { fontSize: 8, color: '#5b6763', margin: [36, 12, 36, 0] }),
    content,
  };
  return new Promise((resolve, reject) => {
    const pdf = printer.createPdfKitDocument(doc);
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject as (x: Buffer) => void);
    pdf.end();
  });
}
