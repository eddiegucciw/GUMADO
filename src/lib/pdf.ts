/**
 * Dependency-free PDF writer for GUMADO reports, statements and receipts.
 * Standard Helvetica fonts (no embedding), A4, repeated table headers,
 * page numbers. Text outside the WinAnsi character set is replaced.
 */

export interface PdfColumn {
  header: string;
  align?: 'left' | 'right';
  /** Relative width; defaults from content length. */
  weight?: number;
}

export interface PdfTable {
  heading?: string;
  columns: PdfColumn[];
  rows: string[][];
  totals?: string[];
}

export interface PdfDocument {
  title: string;
  subtitle?: string;
  businessName?: string;
  meta?: [string, string][];
  tables?: PdfTable[];
  notes?: string[];
  orientation?: 'portrait' | 'landscape';
  generatedAt?: string;
}

// Helvetica glyph widths (1/1000 em) for ASCII 32–126.
const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

function charWidth(code: number): number {
  if (code >= 32 && code <= 126) return W[code - 32];
  return 556;
}

export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i));
  return (w / 1000) * size * (bold ? 1.06 : 1);
}

const WIN_ANSI: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '•': 0x95, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '™': 0x99,
};

/** Normalise to single-byte WinAnsi text. */
export function toWinAnsi(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const code = ch.codePointAt(0)!;
    if (ch === '−') out += '-';
    else if (WIN_ANSI[ch]) out += String.fromCharCode(WIN_ANSI[ch]);
    else if ((code >= 32 && code <= 126) || (code >= 0xa0 && code <= 0xff)) out += ch;
    else if (code === 9) out += ' ';
    else out += '?';
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function fit(s: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && textWidth(t + '...', size, bold) > maxWidth) t = t.slice(0, -1);
  return t + '...';
}

function wrap(s: string, maxWidth: number, size: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (textWidth(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

class PageWriter {
  pages: string[][] = [];
  y = 0;
  constructor(public width: number, public height: number, public margin: number) {
    this.newPage();
  }
  get cur() {
    return this.pages[this.pages.length - 1];
  }
  newPage() {
    this.pages.push([]);
    this.y = this.height - this.margin;
  }
  ensure(space: number) {
    if (this.y - space < this.margin + 24) {
      this.newPage();
      return true;
    }
    return false;
  }
  text(x: number, y: number, s: string, size: number, bold = false, gray = 0) {
    this.cur.push(`${gray} g BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(s)}) Tj ET`);
  }
  rect(x: number, y: number, w: number, h: number, gray: number) {
    this.cur.push(`${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  line(x1: number, y1: number, x2: number, y2: number, gray = 0.8) {
    this.cur.push(`${gray} G 0.5 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
}

export function buildPdf(docIn: PdfDocument): Uint8Array {
  const landscape = docIn.orientation === 'landscape';
  const [PW, PH] = landscape ? [842, 595] : [595, 842];
  const M = 40;
  const w = new PageWriter(PW, PH, M);
  const T = (s: string) => toWinAnsi(s);
  const contentW = PW - 2 * M;

  // Header
  if (docIn.businessName) {
    w.text(M, w.y - 10, T(docIn.businessName.toUpperCase()), 9, true, 0.45);
    w.y -= 18;
  }
  w.text(M, w.y - 16, T(docIn.title), 17, true);
  w.y -= 26;
  if (docIn.subtitle) {
    w.text(M, w.y - 10, T(docIn.subtitle), 10, false, 0.35);
    w.y -= 18;
  }
  if (docIn.meta?.length) {
    w.y -= 4;
    const keyW = Math.min(170, Math.max(...docIn.meta.map(([k]) => textWidth(T(k), 9.5, true))) + 14);
    for (const [k, v] of docIn.meta) {
      const lines = wrap(T(v), contentW - keyW, 9.5);
      w.ensure(14 * lines.length);
      w.text(M, w.y - 10, T(k), 9.5, true, 0.3);
      lines.forEach((ln, i) => w.text(M + keyW, w.y - 10 - i * 13, ln, 9.5));
      w.y -= 13 * lines.length + 2;
    }
  }
  w.y -= 8;

  // Tables
  const FS = 8.5, RH = 16;
  for (const table of docIn.tables ?? []) {
    const cols = table.columns.map((c) => ({ ...c, header: T(c.header) }));
    const rows = table.rows.map((r) => r.map((c) => T(c ?? '')));
    const totals = table.totals?.map((c) => T(c ?? ''));
    const natural = cols.map((c, i) => {
      const sample = [c.header, ...rows.slice(0, 200).map((r) => r[i] ?? ''), ...(totals ? [totals[i] ?? ''] : [])];
      return c.weight ?? Math.max(...sample.map((s) => textWidth(s, FS, true))) + 12;
    });
    const sum = natural.reduce((a, b) => a + b, 0);
    const widths = natural.map((n) => (n / sum) * contentW);

    const drawHeader = () => {
      w.rect(M, w.y - RH, contentW, RH, 0.93);
      let x = M;
      cols.forEach((c, i) => {
        const s = fit(c.header, widths[i] - 8, FS, true);
        const tx = c.align === 'right' ? x + widths[i] - 4 - textWidth(s, FS, true) : x + 4;
        w.text(tx, w.y - RH + 5, s, FS, true, 0.2);
        x += widths[i];
      });
      w.y -= RH;
    };

    if (table.heading) {
      w.ensure(RH * 3 + 20);
      w.text(M, w.y - 12, T(table.heading), 11.5, true);
      w.y -= 20;
    }
    w.ensure(RH * 2);
    drawHeader();
    if (!rows.length) {
      w.text(M + 4, w.y - RH + 5, 'No records for this selection.', FS, false, 0.45);
      w.y -= RH;
    }
    const drawRow = (r: string[], bold: boolean, zebra: boolean) => {
      if (w.ensure(RH)) drawHeader();
      if (zebra) w.rect(M, w.y - RH, contentW, RH, 0.975);
      let x = M;
      cols.forEach((c, i) => {
        const s = fit(r[i] ?? '', widths[i] - 8, FS, bold);
        const tx = c.align === 'right' ? x + widths[i] - 4 - textWidth(s, FS, bold) : x + 4;
        w.text(tx, w.y - RH + 5, s, FS, bold, 0.1);
        x += widths[i];
      });
      w.y -= RH;
    };
    rows.forEach((r, i) => drawRow(r, false, i % 2 === 1));
    if (totals) {
      w.line(M, w.y, M + contentW, w.y, 0.5);
      drawRow(totals, true, false);
    }
    w.y -= 18;
  }

  for (const note of docIn.notes ?? []) {
    for (const ln of wrap(T(note), contentW, 8.5)) {
      w.ensure(12);
      w.text(M, w.y - 9, ln, 8.5, false, 0.4);
      w.y -= 12;
    }
    w.y -= 4;
  }

  // Footers
  const total = w.pages.length;
  const stamp = T(`Generated by GUMADO${docIn.generatedAt ? ' · ' + docIn.generatedAt : ''}`);
  w.pages.forEach((p, i) => {
    p.push(`0.85 G 0.5 w ${M} ${M - 6} m ${PW - M} ${M - 6} l S`);
    p.push(`0.5 g BT /F1 7.5 Tf ${M} ${M - 18} Td (${esc(stamp)}) Tj ET`);
    const pn = `Page ${i + 1} of ${total}`;
    p.push(`0.5 g BT /F1 7.5 Tf ${(PW - M - textWidth(pn, 7.5)).toFixed(2)} ${M - 18} Td (${pn}) Tj ET`);
  });

  return serialize(w.pages, PW, PH, T(docIn.title));
}

function serialize(pages: string[][], PW: number, PH: number, title: string): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length;
  const catalog = add('');
  const pagesObj = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const info = add(`<< /Title (${esc(title)}) /Producer (GUMADO) >>`);
  const kids: number[] = [];
  for (const p of pages) {
    const stream = p.join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
