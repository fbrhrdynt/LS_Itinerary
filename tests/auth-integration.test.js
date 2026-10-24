import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

// Explicit opt-in: all data lives in a random schema, dropped after the test.
test('isolated PostgreSQL registration/login/reset/admin regression', {skip:process.env.RUN_AUTH_DB_TESTS!=='1'}, async t=>{
 process.env.APP_URL='https://itinerary.febro.id';
 const {pool}=await import('../src/database.js');
 const db=new pg.Client(pool.options); await db.connect();
 const schema='auth_test_'+randomBytes(8).toString('hex');
 await db.query(`CREATE SCHEMA ${schema}`); await db.query(`SET search_path TO ${schema}`);
 t.after(async()=>{await db.query('SET search_path TO public');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();await pool.end();});
 await db.query(fs.readFileSync(new URL('../db/init.sql',import.meta.url),'utf8'));
 await db.query('CREATE TABLE session(sid text PRIMARY KEY,sess json NOT NULL,expire timestamp NOT NULL)');
 pool.query=(...args)=>db.query(...args); pool.connect=async()=>({query:(...args)=>db.query(...args),release(){}});
 const {default:auth}=await import('../src/routes/auth.js');
 const {default:admin}=await import('../src/routes/admin.js');
 const {requireAuth}=await import('../src/middleware.js');
 const {tokenHash}=await import('../src/services/authSecurity.js');
 const app=express(); app.set('trust proxy',1);app.set('view engine','ejs');app.set('views',path.resolve('views'));
 app.use(express.urlencoded({extended:true}));
 app.use(session({secret:'isolated-test-secret-long-enough',resave:false,saveUninitialized:false,cookie:{secure:true,httpOnly:true,sameSite:'lax'}}));
 app.use((req,res,next)=>{Object.assign(res.locals,{appName:'Itinerary',currentUser:req.session.user||null,isAdmin:false,currentPath:req.path,flash:req.session.flash||null});delete req.session.flash;next();});
 app.use(auth); app.use(admin);app.get('/private',requireAuth,(req,res)=>res.json({role:req.session.user.role}));
 app.use((err,req,res,next)=>{console.error(err.code||err.name);res.status(500).send('error');});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 let cookie='';
 const request=async(p,body,headers={})=>{
  const r=await fetch(base+p,{method:body?'POST':'GET',redirect:'manual',headers:{'x-forwarded-proto':'https',cookie,...(body?{'content-type':'application/x-www-form-urlencoded',origin:process.env.APP_URL}:{}),...headers},...(body?{body:new URLSearchParams(body)}:{})});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
 };
 const form=async(p)=>{const r=await request(p);assert.equal(r.status,200);const html=await r.text();return html.match(/name="csrf" value="([^"]+)"/)[1];};
 const csrf=await form('/register');
 const password='test-only-password-123';
 assert.equal((await request('/register',{csrf,name:'Test',email:'PERSON@example.invalid',password,role:'Administrator'})).status,303);
 let user=(await db.query('SELECT * FROM users')).rows[0];assert.equal(user.role,'User');assert.equal(user.email,'person@example.invalid');assert.notEqual(user.password_hash,password);
 assert.equal((await request('/register',{csrf,name:'Test',email:user.email.toUpperCase(),password})).status,303);
 assert.equal((await db.query('SELECT count(*) n FROM users')).rows[0].n,'1');
 assert.equal((await request('/register',{csrf:'bad',name:'Test',email:'other@example.invalid',password})).status,403);
 assert.equal((await request('/register',{csrf,name:'X',email:'bad',password:'short'})).status,303);
 assert.equal(await form('/login'),csrf);assert.equal(await form('/login'),csrf);
 assert.equal((await request('/login',{csrf,email:user.email,password:'wrong'})).status,302);
 assert.equal(await form('/login'),csrf);
 const login=await request('/login',{csrf,email:user.email,password},{origin:process.env.APP_URL});assert.equal(login.status,302);assert.equal(login.headers.get('location'),'/dashboard');
 assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/Secure/);assert.match(login.headers.get('set-cookie'),/SameSite=Lax/);
 assert.equal((await request('/private')).status,200);assert.equal((await request('/admin')).status,403);assert.equal((await request('/admin/users')).status,403);
 // A forged database role cannot promote an unauthorized or unverified user.
 await assert.rejects(db.query("UPDATE users SET role='Administrator' WHERE id=$1",[user.id]),{code:'23514'});
 await db.query("INSERT INTO users(name,email,password_hash) VALUES('Allowed','febroherdyanto98@gmail.com',$1)",[user.password_hash]);
 await assert.rejects(db.query("UPDATE users SET role='Administrator' WHERE email='febroherdyanto98@gmail.com'"),{code:'23514'});
 const oldCookie=cookie;cookie='';
 const resetCSRF=await form('/reset-password');
 const token=randomBytes(32).toString('base64url');
 await db.query("INSERT INTO password_resets(token_hash,user_id,expires_at,auth_version) VALUES($1,$2,NOW()+INTERVAL '30 minutes',0)",[tokenHash(token),user.id]);
 const reset={csrf:resetCSRF,token,password:'new-test-password-123',confirm_password:'new-test-password-123'};
 assert.equal((await request('/reset-password',reset)).headers.get('location'),'/login');
 user=(await db.query('SELECT * FROM users WHERE id=$1',[user.id])).rows[0];assert.equal(user.auth_version,1);assert.ok(user.email_verified_at);assert.equal(user.role,'User');
 cookie=oldCookie;assert.equal((await request('/private')).headers.get('location'),'/login');
 cookie='';const newCSRF=await form('/reset-password');
 assert.equal((await request('/reset-password',{...reset,csrf:newCSRF})).headers.get('location'),'/forgot-password');
 const expired=randomBytes(32).toString('base64url');await db.query("INSERT INTO password_resets(token_hash,user_id,expires_at,auth_version) VALUES($1,$2,NOW()-INTERVAL '1 second',1)",[tokenHash(expired),user.id]);
 assert.equal((await request('/reset-password',{...reset,csrf:newCSRF,token:expired})).headers.get('location'),'/forgot-password');
 // No cookie / stale form rejects even with a legitimate token.
 cookie='';assert.equal((await request('/login',{csrf,email:user.email,password:reset.password})).status,403);
 const fresh=await form('/login');assert.equal((await request('/login',{csrf:fresh,email:user.email,password:reset.password})).status,302);
 cookie='';const forgot=await form('/forgot-password');
 delete process.env.SMTP_URL;delete process.env.SMTP_HOST;
 assert.equal((await request('/forgot-password',{csrf:forgot,email:user.email})).headers.get('location'),'/forgot-password');
 assert.match(await (await request('/forgot-password')).text(),/belum tersedia/);
 for(let i=0;i<4;i++)assert.equal((await request('/forgot-password',{csrf:forgot,email:'unknown@example.invalid'})).status,303);
 assert.equal((await request('/forgot-password',{csrf:forgot,email:'unknown@example.invalid'})).status,429,'reset request limiter enforced');
 // A verified allowlisted account may be promoted, but changing email removes verification and privileges.
 await db.query("UPDATE users SET email_verified_at=NOW(),verified_email=email WHERE email='febroherdyanto98@gmail.com'");
 await db.query("UPDATE users SET role='Administrator' WHERE email='febroherdyanto98@gmail.com'");
 await db.query("UPDATE users SET email='changed@example.invalid' WHERE email='febroherdyanto98@gmail.com'");
 const changed=(await db.query("SELECT * FROM users WHERE email='changed@example.invalid'")).rows[0];
 assert.equal(changed.role,'User');assert.equal(changed.email_verified_at,null);

});
