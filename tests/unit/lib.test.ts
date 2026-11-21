import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, formatDate, isValidDate, rangeFor, todayIn } from '../../src/lib/dates.ts';
import { toAppError } from '../../src/lib/errors.ts';
import { matchPath } from '../../src/lib/path.ts';

test('todayIn uses the business timezone (Africa/Nairobi is UTC+3)', () => {
  // 22:30 UTC on 19 Nov is already 20 Nov in Nairobi.
  assert.equal(todayIn('Africa/Nairobi', new Date('2026-11-19T22:30:00Z')), '2026-11-20');
  assert.equal(todayIn('Africa/Nairobi', new Date('2026-11-19T20:59:00Z')), '2026-11-19');
});

test('date arithmetic is calendar-exact', () => {
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(daysBetween('2026-01-01', '2026-12-31'), 364);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-11-19'), true);
  assert.equal(formatDate('2026-11-19'), '19 Nov 2026');
});

test('range presets', () => {
  assert.deepEqual(rangeFor('30d', '2026-11-19'), { from: '2026-10-21', to: '2026-11-19' });
  assert.deepEqual(rangeFor('mtd', '2026-11-19'), { from: '2026-11-01', to: '2026-11-19' });
  assert.deepEqual(rangeFor('ytd', '2026-11-19'), { from: '2026-01-01', to: '2026-11-19' });
});

test('business errors from the database are shown; internals are not', () => {
  assert.deepEqual(toAppError({ message: 'Plot KJD/001 is sold and cannot be sold.', hint: 'PLOT_NOT_AVAILABLE', code: 'P0001' }), {
    code: 'PLOT_NOT_AVAILABLE', message: 'Plot KJD/001 is sold and cannot be sold.',
  });
  assert.equal(toAppError({ message: 'duplicate key value violates unique constraint "plots_reference_unique"', code: '23505' }).message,
    'A plot with this reference number already exists.');
  assert.equal(toAppError({ message: 'permission denied for table sales', code: '42501' }).code, 'FORBIDDEN');
  assert.equal(toAppError(new TypeError('Failed to fetch')).code, 'NETWORK');
  const leak = toAppError({ message: 'relation "secret_internal" does not exist', code: '42P01' });
  assert.equal(leak.message, 'Something went wrong. Please try again.');
  assert.equal(toAppError({ name: 'AuthApiError', message: 'Invalid login credentials' }).message, 'Incorrect email or password.');
  // Untrusted hints are ignored.
  assert.equal(toAppError({ message: 'internal detail', hint: 'SOMETHING_ELSE' }).code, 'UNKNOWN');
});

test('route matching', () => {
  assert.deepEqual(matchPath('/app/plots/:id', '/app/plots/abc-123'), { id: 'abc-123' });
  assert.deepEqual(matchPath('/app/plots/:id', '/app/plots/abc-123/'), { id: 'abc-123' });
  assert.equal(matchPath('/app/plots/:id', '/app/plots'), null);
  assert.equal(matchPath('/app/plots', '/app/plots/new'), null);
  assert.deepEqual(matchPath('/app/*', '/app/anything/here'), {});
  assert.equal(matchPath('/app/plots/:id', '/app/plots/%E0%A4%A'), null);
});
