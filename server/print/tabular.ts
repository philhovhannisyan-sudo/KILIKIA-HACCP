// Табличный экспорт CSV / XLSX (brief §11). CSV: UTF-8 с BOM, разделитель по языку (Р-21).
import ExcelJS from 'exceljs';
import type { Lang } from '../../shared/time';

export interface Sheet { name: string; headers: string[]; rows: (string | number | null)[][] }

const csvCell = (v: string | number | null, sep: string) => {
  const s = v === null ? '' : String(v);
  return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(sheets: Sheet[], lang: Lang): Buffer {
  const sep = lang === 'en' ? ',' : ';';
  const parts = sheets.map((s) => [s.name, s.headers.map((h) => csvCell(h, sep)).join(sep), ...s.rows.map((r) => r.map((c) => csvCell(c, sep)).join(sep))].join('\r\n'));
  return Buffer.from('﻿' + parts.join('\r\n\r\n'), 'utf8');
}

export async function toXlsx(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HACCP Suite';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    ws.addRow(s.headers).font = { bold: true };
    for (const r of s.rows) ws.addRow(r);
    ws.columns.forEach((c) => { c.width = 22; c.alignment = { wrapText: true, vertical: 'top' }; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
