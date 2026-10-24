import { isAdmin } from './services/authSecurity.js';
import { query } from './database.js';

export async function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  try {
    const result = await query(
      'SELECT id,name,email,role,status,auth_version,email_verified_at,verified_email FROM users WHERE id=$1 LIMIT 1',
      [req.session.user.id]
    );
    const user = result.rows[0];

    if (!user || user.status !== 'active' || req.session.user.auth_version !== user.auth_version) {
      req.session.user = null;
      req.session.flash = {
        type: 'danger',
        message: user?.status === 'hold'
          ? 'Akun Anda sedang di-hold oleh Administrator.'
          : 'Akun Anda tidak dapat digunakan. Hubungi Administrator.',
      };
      return req.session.save(() => res.redirect('/login'));
    }

    if (!isAdmin(user)) user.role='User';
    req.session.user = user;
    res.locals.currentUser = user;
    res.locals.isAdmin = user.role === 'Administrator';
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req.session.user)) {
    return res.status(403).render('error', {
      title: 'Akses ditolak',
      status: 403,
      message: 'Halaman ini hanya dapat diakses oleh Administrator.',
    });
  }
  next();
}

export function guestOnly(req, res, next) {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'Administrator' ? '/admin' : '/dashboard');
  }
  next();
}
