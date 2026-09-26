import express from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { query } from '../database.js';
import { flash, safeReturnTo } from '../utils.js';
import { guestOnly } from '../middleware.js';

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

router.get('/login', guestOnly, (req, res) => res.render('auth/login', { title: 'Masuk' }));
router.get('/register', guestOnly, (req, res) => res.render('auth/register', { title: 'Buat akun' }));

router.post('/register', authLimiter, guestOnly, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      flash(req, 'danger', 'Isi nama dan email dengan benar. Password minimal 8 karakter.');
      return res.redirect('/register');
    }

    const existing = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
    if (existing.rowCount) {
      flash(req, 'danger', 'Email sudah terdaftar. Silakan login.');
      return res.redirect('/login');
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users(name,email,password_hash,role,status)
       VALUES($1,$2,$3,'User','active')
       RETURNING id,name,email,role,status`,
      [name, email, hash]
    );

    req.session.user = result.rows[0];
    const redirectTo = safeReturnTo(req.session.returnTo);
    delete req.session.returnTo;
    res.redirect(redirectTo);
  } catch (err) { next(err); }
});

router.post('/login', authLimiter, guestOnly, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await query(
      'SELECT id,name,email,password_hash,role,status FROM users WHERE email=$1 LIMIT 1',
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      flash(req, 'danger', 'Email atau password salah.');
      return res.redirect('/login');
    }

    if (user.status !== 'active') {
      flash(req, 'danger', user.status === 'hold'
        ? 'Akun sedang di-hold oleh Administrator.'
        : 'Akun diblokir. Hubungi Administrator.');
      return res.redirect('/login');
    }

    await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    const destination = returnTo
      ? safeReturnTo(returnTo)
      : user.role === 'Administrator' ? '/admin' : '/dashboard';
    res.redirect(destination);
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

export default router;
