import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnTo } from '../src/utils.js';

test('safeReturnTo keeps valid application destinations', () => {
  assert.equal(safeReturnTo('/trips/2', '/dashboard'), '/trips/2');
  assert.equal(safeReturnTo('/join/abc123?from=share', '/dashboard'), '/join/abc123?from=share');
  assert.equal(safeReturnTo('/admin/users', '/admin'), '/admin/users');
});

test('safeReturnTo rejects browser assets and external paths', () => {
  assert.equal(safeReturnTo('/favicon.ico', '/admin'), '/admin');
  assert.equal(safeReturnTo('/app.css', '/dashboard'), '/dashboard');
  assert.equal(safeReturnTo('//evil.example/path', '/dashboard'), '/dashboard');
});
