import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildXlsx, crc32 } from '../../src/lib/xlsx.ts';
import { buildPdf, textWidth, toWinAnsi } from '../../src/lib/pdf.ts';

const dir = mkdtempSync(join(tmpdir(), 'gumado-'));
const has = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('xlsx opens in a real spreadsheet reader with correct values and types', { skip: !has('python3', ['-c', 'import openpyxl']) }, () => {
  const bytes = buildXlsx([
    {
      name: 'Sales: Nov/2026',
      preface: ['GUMADO — Sales by date', 'Period: 1 Nov 2026 – 19 Nov 2026'],
      columns: [{ header: 'Reference' }, { header: 'Buyer' }, { header: 'Price (KES)', kind: 'money' }, { header: 'Plots', kind: 'integer' }],
      rows: [
        ['SAL-2026-000001', 'Wanjiru & Sons <Ltd>', 1_500_000.5, 2],
        ['SAL-2026-000002', '=HYPERLINK("http://evil")', 900_000, 1],
      ],
    },
    { name: 'Sales: Nov/2026', columns: [{ header: 'Second' }], rows: [['x']] },
  ]);
  const file = join(dir, 'test.xlsx');
  writeFileSync(file, bytes);
  const out = execFileSync('python3', ['-c', `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb.worksheets[0]
print(json.dumps({"sheets": wb.sheetnames, "title": ws["A1"].value, "hdr": [c.value for c in ws[4]],
  "r1": [c.value for c in ws[5]], "r2": [c.value for c in ws[6]], "fmt": ws["C5"].number_format, "type": ws["C5"].data_type,
  "freeze": ws.freeze_panes}))
`, file]).toString();
  const r = JSON.parse(out);
  assert.equal(r.sheets.length, 2);
  assert.notEqual(r.sheets[0], r.sheets[1], 'sheet names are de-duplicated');
  assert.ok(!r.sheets[0].includes('/') && !r.sheets[0].includes(':'), 'invalid sheet-name characters removed');
  assert.equal(r.title, 'GUMADO — Sales by date');
  assert.deepEqual(r.hdr, ['Reference', 'Buyer', 'Price (KES)', 'Plots']);
  assert.deepEqual(r.r1, ['SAL-2026-000001', 'Wanjiru & Sons <Ltd>', 1500000.5, 2]);
  assert.equal(r.r2[1], '=HYPERLINK("http://evil")', 'formula-like text stays plain text');
  assert.equal(r.type, 'n');
  assert.equal(r.fmt, '#,##0.00');
  assert.equal(r.freeze, 'A5');
});

test('pdf is valid, paginates with repeated headers, and contains the text', { skip: !has('pdftotext', ['-v']) }, () => {
  const rows = Array.from({ length: 120 }, (_, i) => [`KJD/${String(i + 1).padStart(3, '0')}`, `Buyer ${i + 1} — “Ltd”`, `KES ${(i + 1) * 1000}`]);
  const bytes = buildPdf({
    title: 'Outstanding balances',
    businessName: 'GUMADO Estates',
    subtitle: 'As at 19 Nov 2026',
    meta: [['Prepared by', 'Fay Finance (finance@gumado.test)']],
    tables: [{ columns: [{ header: 'Plot' }, { header: 'Buyer' }, { header: 'Outstanding', align: 'right' }], rows, totals: ['Total', '', 'KES 7,260,000'] }],
    notes: ['Figures are generated from confirmed payments only. Pending payments are excluded.'],
    generatedAt: '19 Nov 2026, 16:40',
  });
  const file = join(dir, 'test.pdf');
  writeFileSync(file, bytes);
  const info = execFileSync('pdfinfo', [file]).toString();
  const pages = Number(/Pages:\s+(\d+)/.exec(info)![1]);
  assert.ok(pages >= 3, `expected several pages, got ${pages}`);
  const text = execFileSync('pdftotext', ['-layout', file, '-']).toString();
  assert.match(text, /Outstanding balances/);
  assert.match(text, /KJD\/120/);
  assert.match(text, /Buyer 7 — “Ltd”/);
  assert.match(text, /KES 7,260,000/);
  assert.match(text, new RegExp(`Page ${pages} of ${pages}`));
  assert.equal((text.match(/Outstanding\s*\n|Plot\s+Buyer\s+Outstanding/g) ?? []).length >= pages, true, 'table header repeats on every page');
});

test('pdf text helpers', () => {
  assert.equal(toWinAnsi('KES −500'), 'KES -500');
  assert.equal(toWinAnsi('漢字'), '??');
  assert.ok(textWidth('WWW', 10) > textWidth('iii', 10));
});
