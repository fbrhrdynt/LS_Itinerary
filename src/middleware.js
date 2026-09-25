export function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

export function guestOnly(req, res, next) {
  if (req.session.user) return res.redirect('/dashboard');
  next();
}
