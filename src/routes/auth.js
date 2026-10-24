import express from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { pool, query } from '../database.js';
import { flash, safeReturnTo } from '../utils.js';
import { csrfGuard, sameOrigin, isAdmin, normalizeEmail, validEmail, validPassword, tokenHash } from '../services/authSecurity.js';
import { smtpConfigured, sendReset, sendActivation } from '../services/mailer.js';
import { guestOnly } from '../middleware.js';
import { configured, startFlow, validFlow, exchangeCode, randomToken, safeEqual } from '../services/oidc.js';

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
const save = req => new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));

async function completeLogin(req, res, user) {
  if (user.status !== 'active' || user.activation_required) throw new Error('Account unavailable');
  if (!isAdmin(user)) user.role = 'User';
  const returnTo = req.session.returnTo;
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, auth_version:user.auth_version, email_verified_at:user.email_verified_at, verified_email:user.verified_email };
  let destination = safeReturnTo(returnTo, user.role === 'Administrator' ? '/admin' : '/dashboard');
  if (user.role !== 'Administrator' && destination.startsWith('/admin')) destination = '/dashboard';
  await save(req);
  res.redirect(destination);
}

router.get('/login', guestOnly, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    // Keep other open/restored login forms valid for this anonymous session.
    if (!req.session.loginCSRF) req.session.loginCSRF = randomToken();
    await save(req);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private').set('Pragma','no-cache');
    res.render('auth/login', { title: 'Masuk', ssoEnabled: configured(), febroSSO:process.env.FEBRO_SSO_ENABLED==='true', loginCSRF:req.session.loginCSRF });
  } catch (err) { next(err); }
});
async function formPage(req, res, view, title, extra={}) {
  res.set('Cache-Control','no-store, no-cache, must-revalidate, private').set('Pragma','no-cache');
  if (!req.session.loginCSRF) req.session.loginCSRF=randomToken();
  await save(req);
  res.render(view,{title,loginCSRF:req.session.loginCSRF,...extra});
}
router.get('/register', guestOnly, (req,res,next)=>formPage(req,res,'auth/register','Daftar Akun').catch(next));
router.post('/register',authLimiter,guestOnly,csrfGuard,async(req,res,next)=>{
 try {
  const name=String(req.body.name||'').trim(), email=normalizeEmail(req.body.email), password=req.body.password;
  if(name.length<2 || name.length>120 || !validEmail(email) || !validPassword(password)) {
   flash(req,'danger','Isi nama (2–120 karakter), email yang valid, dan password minimal 8 karakter (maksimal 72 byte).');
   await save(req); return res.redirect(303,'/register');
  }
  if(!smtpConfigured()){flash(req,'danger','Aktivasi email belum tersedia. Hubungi pengelola.');await save(req);return res.redirect(303,'/register');}
  const hash=await bcrypt.hash(password,12);
  const created=await query("INSERT INTO users(name,email,password_hash,role,status,activation_required) VALUES($1,$2,$3,'User','active',TRUE) RETURNING id,email",[name,email,hash]);
  try { await issueActivation(created.rows[0]); }
  catch(err){console.warn('activation_delivery_failed',err.code||err.name); }
  flash(req,'success','Akun dibuat. Periksa email aktivasi (termasuk spam), atau gunakan Kirim Ulang Aktivasi. Anda belum dapat masuk sebelum aktivasi.');
  await save(req); res.redirect(303,'/login');
 } catch(err) {
  if(err.code==='23505'){flash(req,'danger','Email sudah terdaftar. Silakan masuk atau gunakan Lupa Password.');await save(req);return res.redirect(303,'/register');} next(err);
 }
});

const activationLimiter=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,message:'Terlalu banyak permintaan. Coba lagi dalam 15 menit.'});
async function issueActivation(user) {
 const token=randomToken(), hash=tokenHash(token);
 const inserted=await query(`INSERT INTO email_activations(token_hash,user_id,expires_at)
 SELECT $1,$2,NOW()+INTERVAL '15 minutes'
 WHERE NOT EXISTS (SELECT 1 FROM email_activations WHERE user_id=$2 AND created_at>NOW()-INTERVAL '2 minutes')
 RETURNING token_hash`,[hash,user.id]);
 if(!inserted.rowCount)return;
 try { await sendActivation(user.email,token); }
 catch(err){await query('DELETE FROM email_activations WHERE token_hash=$1',[hash]);throw err;}
}
router.get('/resend-activation',guestOnly,(req,res,next)=>formPage(req,res,'auth/resend','Kirim Ulang Aktivasi').catch(next));
router.post('/resend-activation',activationLimiter,guestOnly,csrfGuard,async(req,res,next)=>{
 try {
  const email=normalizeEmail(req.body.email);
  if(validEmail(email)&&smtpConfigured()){
   const user=(await query("SELECT id,email FROM users WHERE lower(trim(email))=$1 AND activation_required=TRUE AND status='active'",[email])).rows[0];
   if(user)try{await issueActivation(user);}catch(err){console.warn('activation_delivery_failed',err.code||err.name);}
  }
  flash(req,'success','Jika akun memerlukan aktivasi, tautan baru akan dikirim. Periksa inbox dan spam.');
  await save(req);res.redirect(303,'/resend-activation');
 }catch(err){next(err);}
});
router.get('/verify-email',guestOnly,(req,res,next)=>{
 res.set('Referrer-Policy','no-referrer');
 const token = typeof req.query.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(req.query.token) ? req.query.token : '';
 return formPage(req,res,'auth/verify','Aktivasi Email',{activationToken:token}).catch(next);
});
router.post('/verify-email',activationLimiter,guestOnly,csrfGuard,async(req,res,next)=>{
 const token=typeof req.body.token==='string'?req.body.token:'';
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)){flash(req,'danger','Tautan aktivasi tidak valid atau kedaluwarsa.');await save(req);return res.redirect(303,'/resend-activation');}
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const found=await client.query(`SELECT u.id FROM users u JOIN email_activations a ON a.user_id=u.id
   WHERE a.token_hash=$1 AND a.used_at IS NULL AND a.expires_at>NOW() AND u.activation_required=TRUE
   AND u.status='active' FOR UPDATE OF u,a`,[tokenHash(token)]);
  if(!found.rowCount){await client.query('ROLLBACK');flash(req,'danger','Tautan aktivasi tidak valid atau kedaluwarsa.');await save(req);return res.redirect(303,'/resend-activation');}
  const id=found.rows[0].id;
  await client.query("UPDATE users SET activation_required=FALSE,email_verified_at=NOW(),verified_email=email,updated_at=NOW() WHERE id=$1",[id]);
  await client.query('UPDATE email_activations SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[id]);
  await client.query('COMMIT');
  flash(req,'success','Email berhasil diaktifkan. Silakan masuk.');await save(req);res.redirect(303,'/login');
 }catch(err){await client.query('ROLLBACK');next(err);}finally{client.release();}
});

const resetLimiter=rateLimit({windowMs:30*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,message:'Terlalu banyak permintaan. Coba lagi dalam 30 menit.'});
router.get('/forgot-password',guestOnly,(req,res,next)=>formPage(req,res,'auth/forgot','Lupa Password?',{smtpReady:smtpConfigured(),resetTTL:Math.max(5,Math.min(120,Number(process.env.PASSWORD_RESET_TTL_MINUTES)||30))}).catch(next));
router.post('/forgot-password',resetLimiter,guestOnly,csrfGuard,async(req,res,next)=>{
 try {
  if(!smtpConfigured()){flash(req,'danger','Pengiriman email belum tersedia. Hubungi pengelola untuk konfigurasi SMTP.');await save(req);return res.redirect(303,'/forgot-password');}
  const email=normalizeEmail(req.body.email);
  if(!validEmail(email)){flash(req,'danger','Masukkan alamat email yang valid.');await save(req);return res.redirect(303,'/forgot-password');}
  const user=(await query("SELECT * FROM users WHERE lower(trim(email))=$1 AND status='active'",[email])).rows[0];
  if(user?.password_hash){
   const token=randomToken(), hash=tokenHash(token);
   // Per-account throttling, independent of client IP; never reveals account existence.
   const result=await query(`INSERT INTO password_resets(token_hash,user_id,expires_at,auth_version)
    SELECT $1,$2,NOW()+($4::int * INTERVAL '1 minute'),$3 WHERE NOT EXISTS
    (SELECT 1 FROM password_resets WHERE user_id=$2 AND created_at>NOW()-INTERVAL '2 minutes') RETURNING token_hash`,[hash,user.id,user.auth_version,Math.max(5,Math.min(120,Number(process.env.PASSWORD_RESET_TTL_MINUTES)||30))]);
   if(result.rowCount)try{await sendReset(user.email,token);}catch{await query('DELETE FROM password_resets WHERE token_hash=$1',[hash]);console.warn('password_reset_delivery_failed');}
  }
  flash(req,'success','Jika email terdaftar dan dapat menggunakan password, tautan pemulihan akan dikirim. Periksa kotak masuk dan spam.');await save(req);res.redirect(303,'/forgot-password');
 }catch(err){next(err);}
});
router.get('/reset-password',guestOnly,(req,res,next)=>{res.set('Referrer-Policy','no-referrer');return formPage(req,res,'auth/reset','Atur ulang password').catch(next);});
router.post('/reset-password',authLimiter,guestOnly,csrfGuard,async(req,res,next)=>{
 const token=typeof req.body.token==='string'?req.body.token:'';
 if(!validPassword(req.body.password)||req.body.password!==req.body.confirm_password){flash(req,'danger','Password minimal 8 karakter (maksimal 72 byte) dan konfirmasi harus sama.');await save(req);return res.redirect(303,'/reset-password');}
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)){flash(req,'danger','Tautan tidak valid atau kedaluwarsa. Minta tautan baru.');await save(req);return res.redirect(303,'/forgot-password');}
 const client=await pool.connect();
 try {
  const hash=await bcrypt.hash(req.body.password,12);
  await client.query('BEGIN');
  const found=await client.query(`SELECT u.id FROM users u JOIN password_resets r ON r.user_id=u.id
   WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at>NOW() AND r.auth_version=u.auth_version AND u.status='active' FOR UPDATE OF u,r`,[tokenHash(token)]);
  if(!found.rowCount){await client.query('ROLLBACK');flash(req,'danger','Tautan tidak valid atau kedaluwarsa. Minta tautan baru.');await save(req);return res.redirect(303,'/forgot-password');}
  const id=found.rows[0].id;
  await client.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2',[hash,id]);
  await client.query('UPDATE password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[id]);
  await client.query(`DELETE FROM session WHERE sess->'user'->>'id'=$1`,[String(id)]);
  await client.query('COMMIT');
  await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
  flash(req,'success','Password berhasil diperbarui. Semua sesi sebelumnya telah berakhir. Silakan masuk.');await save(req);res.redirect(303,'/login');
 }catch(err){await client.query('ROLLBACK');next(err);}finally{client.release();}
});
router.post('/login',authLimiter,guestOnly,csrfGuard,async(req,res,next)=>{try{
 const user=(await query('SELECT * FROM users WHERE LOWER(email)=$1',[String(req.body.email||'').trim().toLowerCase()])).rows[0];
 if(!user||user.status!=='active'||!user.password_hash||!await bcrypt.compare(String(req.body.password||''),user.password_hash)){flash(req,'danger','Email atau password tidak valid.');await save(req);return res.redirect('/login');}
 if(user.activation_required){flash(req,'danger','Aktifkan email terlebih dahulu. <a href="/resend-activation">Kirim ulang aktivasi</a>.');await save(req);return res.redirect(303,'/login');}
 await completeLogin(req,res,user);
}catch(e){next(e);}});

router.get(['/auth/febro', '/auth/google'], authLimiter, guestOnly, async (req, res, next) => {
  try {
    if (!configured()) {
      flash(req, 'danger', 'Login belum dikonfigurasi. Hubungi Administrator.');
      await save(req);
      return res.redirect('/login');
    }
    const { flow, url } = startFlow(req.path === '/auth/google');
    req.session.oidcFlow = flow;
    delete req.session.pendingIdentity;
    await save(req);
    res.set('Cache-Control', 'no-store').redirect(url);
  } catch (err) { next(err); }
});

router.get('/auth/febro/callback', authLimiter, guestOnly, async (req, res, next) => {
  try {
    const flow = req.session.oidcFlow;
    delete req.session.oidcFlow;
    await save(req);
    if (!validFlow(flow, req.query.state) || req.query.error || typeof req.query.code !== 'string') throw new Error('Invalid callback');
    const identity = await exchangeCode(req.query.code, flow);
    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identity.email]);
      const result = await client.query('SELECT * FROM users WHERE febro_sub=$1 OR LOWER(email)=$2 FOR UPDATE', [identity.sub, identity.email]);
      const linked = result.rows.find(row => row.febro_sub === identity.sub);
      const existing = result.rows.find(row => row.email.toLowerCase() === identity.email);
      if (linked) {
        if (linked.status !== 'active' || linked.activation_required) throw new Error('Account unavailable');
        user = linked;
        if (normalizeEmail(linked.email) === identity.email) user = (await client.query('UPDATE users SET email_verified_at=NOW(),verified_email=email WHERE id=$1 RETURNING *',[linked.id])).rows[0];
        else user = (await client.query("UPDATE users SET role='User',email_verified_at=NULL,verified_email=NULL WHERE id=$1 RETURNING *",[linked.id])).rows[0];
      } else if (existing) {
        if (existing.status !== 'active' || existing.febro_sub || existing.activation_required) throw new Error('Account unavailable');
        req.session.pendingIdentity = { ...identity, userId: existing.id, csrf: randomToken(), expires: Date.now() + 600000 };
      } else {
        user = (await client.query(`INSERT INTO users(name,email,password_hash,febro_sub,role,status,email_verified_at,verified_email)
          VALUES($1,$2,NULL,$3,'User','active',NOW(),$2) RETURNING *`, [identity.name, identity.email, identity.sub])).rows[0];
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    if (user) return await completeLogin(req, res, user);
    await save(req);
    res.redirect('/auth/link');
  } catch (err) {
    delete req.session.pendingIdentity;
    console.error('SSO login failed:', err.code || err.name);
    flash(req, 'danger', 'Login tidak berhasil. Akun mungkin dibatasi atau sesi sudah kedaluwarsa. Coba masuk kembali; hubungi Administrator jika masalah berlanjut.');
    try { await save(req); res.redirect('/login'); } catch (error) { next(error); }
  }
});

router.get('/auth/link', guestOnly, (req, res) => {
  const pending = req.session.pendingIdentity;
  if (!pending || pending.expires <= Date.now()) return res.redirect('/login');
  res.set('Cache-Control', 'no-store').render('auth/link', { title: 'Hubungkan akun', email: pending.email, csrf: pending.csrf });
});
router.post('/auth/link', authLimiter, guestOnly, async (req, res, next) => {
  try {
    const pending = req.session.pendingIdentity;
    if (!pending || pending.expires <= Date.now() || !sameOrigin(req) || !safeEqual(req.body.csrf, pending.csrf)) return res.redirect('/login');
    const result = await query('SELECT * FROM users WHERE id=$1', [pending.userId]);
    const user = result.rows[0];
    if (!user || user.status !== 'active' || user.activation_required || user.email.toLowerCase() !== pending.email || !user.password_hash
      || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
      flash(req, 'danger', 'Password akun lama tidak cocok atau akun tidak aktif. Coba lagi atau hubungi Administrator.');
      await save(req);
      return res.redirect('/auth/link');
    }
    const linked = await query(`UPDATE users SET febro_sub=$1, email_verified_at=NOW(),verified_email=email,updated_at=NOW()
      WHERE id=$2 AND febro_sub IS NULL AND status='active' RETURNING *`, [pending.sub, user.id]);
    if (!linked.rowCount) throw new Error('Account already linked');
    await completeLogin(req, res, linked.rows[0]);
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});
export default router;
