import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, dateLabel, inputDate, shortDate } from '../src/utils.js';

test('date-only strings stay stable', () => {
  assert.equal(dateKey('2026-09-25'), '2026-09-25');
  assert.equal(inputDate('2026-09-25'), '2026-09-25');
  assert.match(dateLabel('2026-09-25'), /25/);
  assert.notEqual(shortDate('2026-09-25'), '-');
});

test('Date objects from database-like values are accepted', () => {
  const value = new Date(2026, 8, 25);
  assert.equal(dateKey(value), '2026-09-25');
  assert.equal(inputDate(value), '2026-09-25');
  assert.match(dateLabel(value), /2026/);
});

test('invalid dates fail safely instead of throwing', () => {
  assert.equal(dateKey('not-a-date'), '');
  assert.equal(dateLabel('not-a-date'), '-');
  assert.equal(shortDate('not-a-date'), '-');
});
