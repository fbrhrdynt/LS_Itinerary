import crypto from 'node:crypto';

export function inviteCode() {
  return crypto.randomBytes(18).toString('base64url');
}

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function money(value, currency = 'IDR') {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(Number(value || 0));
}

export function dateKey(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(value) {
  const key = dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateLabel(value) {
  const date = dateFromKey(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function shortDate(value) {
  const date = dateFromKey(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function inputDate(value) {
  return dateKey(value);
}

export function todayDateKey(timeZone = process.env.APP_TIMEZONE || 'Asia/Jakarta') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function flash(req, type, message) {
  req.session.flash = { type, message };
}

export function safeReturnTo(path, fallback = '/dashboard') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return fallback;

  let parsed;
  try {
    parsed = new URL(path, 'http://local');
  } catch {
    return fallback;
  }

  const allowedPrefixes = ['/dashboard', '/admin', '/trips', '/join'];
  const allowed = allowedPrefixes.some(prefix => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`));
  if (!allowed) return fallback;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
