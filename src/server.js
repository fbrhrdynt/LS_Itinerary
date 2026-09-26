import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import methodOverride from 'method-override';
import { initializeDatabase, pool } from './database.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import tripRoutes from './routes/trips.js';
import adminRoutes from './routes/admin.js';
import { dateLabel, inputDate, money, shortDate } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PgSession = connectPgSimple(session);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) {
  console.warn('WARNING: SESSION_SECRET should be at least 24 characters.');
}

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-only-change-this-secret-now',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
}));

app.use((req, res, next) => {
  res.locals.appName = process.env.APP_NAME || 'LogiSource Itinerary';
  res.locals.currentUser = req.session.user || null;
  res.locals.isAdmin = req.session.user?.role === 'Administrator';
  res.locals.currentPath = req.path;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.money = money;
  res.locals.dateLabel = dateLabel;
  res.locals.shortDate = shortDate;
  res.locals.inputDate = inputDate;
  next();
});

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  return res.redirect(req.session.user.role === 'Administrator' ? '/admin' : '/dashboard');
});
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/health', (req, res) => res.json({ ok: true, service: process.env.APP_NAME || 'LogiSource Itinerary' }));
app.use(authRoutes);
app.use(dashboardRoutes);
app.use(adminRoutes);
app.use(tripRoutes);

app.use((req, res) => res.status(404).render('error', { title: 'Halaman tidak ditemukan', status: 404, message: 'Halaman yang Anda cari tidak tersedia.' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('error', { title: 'Terjadi kesalahan', status: 500, message: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan pada server.' : err.message });
});

await initializeDatabase();
app.listen(port, host, () => console.log(`LogiSource Itinerary running on http://${host}:${port}`));
