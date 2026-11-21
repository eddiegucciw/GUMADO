import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, parseMoney, percentChange, sumMinor, toInputValue, toMajorNumber } from '../../src/lib/money.ts';

test('parseMoney converts user input to integer minor units without floating point', () => {
  assert.equal(parseMoney('1,500,000'), 150_000_000);
  assert.equal(parseMoney('1 500 000.5'), 150_000_050);
  assert.equal(parseMoney('0.1'), 10);
  assert.equal(parseMoney('0.29'), 29); // 0.29 * 100 = 28.999999999999996 in floating point
  assert.equal(parseMoney('KES 2,000'), 200_000);
  assert.equal(parseMoney('12345678.99'), 1_234_567_899);
});

test('parseMoney rejects invalid input', () => {
  for (const bad of ['', 'abc', '1.234', '-5', '1e5', '1..2', '99999999999999999999']) {
    assert.equal(parseMoney(bad), null, bad);
  }
});

test('parseMoney respects zero-decimal currencies', () => {
  assert.equal(parseMoney('1500', 0), 1500);
  assert.equal(parseMoney('15.5', 0), null);
});

test('formatMoney formats exactly', () => {
  assert.equal(formatMoney(150_000_050), 'KES 1,500,000.50');
  assert.equal(formatMoney(150_000_000), 'KES 1,500,000');
  assert.equal(formatMoney(150_000_000, undefined, { fixed: true }), 'KES 1,500,000.00');
  assert.equal(formatMoney(5), 'KES 0.05');
  assert.equal(formatMoney(-2500), '−KES 25');
  assert.equal(formatMoney(null), '—');
  assert.equal(formatMoney(100, { code: 'UGX', minorUnits: 0 }), 'UGX 100');
});

test('toInputValue round-trips with parseMoney', () => {
  for (const v of [0, 5, 10, 99, 100, 150_000_050, 123_456_789_012]) {
    assert.equal(parseMoney(toInputValue(v)), v);
  }
});

test('sumMinor adds exactly and guards the safe range', () => {
  assert.equal(sumMinor([10, 20, null, 30]), 60);
  assert.equal(sumMinor(Array(1000).fill(1)), 1000);
  assert.throws(() => sumMinor([Number.MAX_SAFE_INTEGER, 1]));
});

test('toMajorNumber is exact for spreadsheet cells', () => {
  assert.equal(toMajorNumber(150_000_050), 1_500_000.5);
  assert.equal(toMajorNumber(29), 0.29);
});

test('percentChange handles empty baselines', () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 0), null);
});
