import express from 'express';
import { query, pool } from '../database.js';
import { requireAuth } from '../middleware.js';
import { getTripAccess, requireTrip, requireOwner } from '../services/tripAccess.js';
import { dateKey, flash, inviteCode, todayDateKey, toNumber } from '../utils.js';

const router = express.Router();
router.use(requireAuth);

function arrayify(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function settlement(members, expenses, splits) {
  const paid = new Map(members.map(m => [String(m.id), 0]));
  const owed = new Map(members.map(m => [String(m.id), 0]));
  for (const e of expenses) paid.set(String(e.paid_by_member_id), (paid.get(String(e.paid_by_member_id)) || 0) + Number(e.amount));
  for (const s of splits) owed.set(String(s.member_id), (owed.get(String(s.member_id)) || 0) + Number(s.share_amount));
  const balances = members.map(m => ({
    ...m,
    paid: paid.get(String(m.id)) || 0,
    owed: owed.get(String(m.id)) || 0,
    balance: (paid.get(String(m.id)) || 0) - (owed.get(String(m.id)) || 0),
  }));
  const creditors = balances.filter(x => x.balance > 0.005).map(x => ({...x, left:x.balance})).sort((a,b)=>b.left-a.left);
  const debtors = balances.filter(x => x.balance < -0.005).map(x => ({...x, left:-x.balance})).sort((a,b)=>b.left-a.left);
  const transfers = [];
  let i=0, j=0;
  while (i<debtors.length && j<creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount > 0.005) transfers.push({ from: debtors[i].display_name, to: creditors[j].display_name, amount });
    debtors[i].left -= amount; creditors[j].left -= amount;
    if (debtors[i].left < 0.005) i++;
    if (creditors[j].left < 0.005) j++;
  }
  return { balances, transfers };
}

router.get('/trips/new', (req, res) => res.render('trips/new', { title: 'Buat Trip' }));

router.post('/trips', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const name = String(req.body.name || '').trim();
    const tripType = req.body.trip_type === 'group' ? 'group' : 'solo';
    const destination = String(req.body.destination || '').trim();
    const start = String(req.body.start_date || '');
    const end = String(req.body.end_date || '');
    const currency = String(req.body.currency || 'IDR').toUpperCase().slice(0,3);
    const budget = Math.max(0, toNumber(req.body.overall_budget));
    const notes = String(req.body.notes || '').trim();
    if (!name || !destination || !start || !end || end < start) {
      flash(req, 'danger', 'Nama trip, tujuan, dan tanggal wajib diisi dengan benar.');
      return res.redirect('/trips/new');
    }
    await client.query('BEGIN');
    const t = await client.query(
      `INSERT INTO trips(owner_id,name,trip_type,destination,start_date,end_date,currency,overall_budget,notes,invite_code)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.session.user.id, name, tripType, destination, start, end, currency, budget, notes, tripType === 'group' ? inviteCode() : null]
    );
    await client.query(
      `INSERT INTO trip_members(trip_id,user_id,display_name,email,role,budget_limit)
       VALUES($1,$2,$3,$4,'owner',$5)`,
      [t.rows[0].id, req.session.user.id, req.session.user.name, req.session.user.email, tripType === 'solo' ? budget : 0]
    );
    await client.query('COMMIT');
    flash(req, 'success', 'Trip berhasil dibuat.');
    res.redirect(`/trips/${t.rows[0].id}`);
  } catch (err) {
    await client.query('ROLLBACK'); next(err);
  } finally { client.release(); }
});

router.get('/join/:code', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM trips WHERE invite_code=$1 AND trip_type=\'group\' LIMIT 1', [req.params.code]);
    const trip = result.rows[0];
    if (!trip) return res.status(404).render('error', { title: 'Undangan tidak valid', status: 404, message: 'Link undangan sudah tidak berlaku atau tidak ditemukan.' });
    const access = await getTripAccess(trip.id, req.session.user.id);
    res.render('trips/join', { title: 'Gabung Trip', trip, alreadyJoined: Boolean(access) });
  } catch (err) { next(err); }
});

router.post('/join/:code', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM trips WHERE invite_code=$1 AND trip_type=\'group\' LIMIT 1', [req.params.code]);
    const trip = result.rows[0];
    if (!trip) return res.status(404).render('error', { title: 'Undangan tidak valid', status: 404, message: 'Trip tidak ditemukan.' });
    const existing = await getTripAccess(trip.id, req.session.user.id);
    if (!existing) {
      const manual = await query(
        `SELECT id FROM trip_members WHERE trip_id=$1 AND user_id IS NULL AND LOWER(email)=LOWER($2) ORDER BY id LIMIT 1`,
        [trip.id, req.session.user.email]
      );
      if (manual.rowCount) {
        await query('UPDATE trip_members SET user_id=$1, display_name=$2 WHERE id=$3', [req.session.user.id, req.session.user.name, manual.rows[0].id]);
      } else {
        await query(
          `INSERT INTO trip_members(trip_id,user_id,display_name,email,role) VALUES($1,$2,$3,$4,'member')`,
          [trip.id, req.session.user.id, req.session.user.name, req.session.user.email]
        );
      }
    }
    flash(req, 'success', `Anda sudah bergabung ke ${trip.name}.`);
    res.redirect(`/trips/${trip.id}`);
  } catch (err) { next(err); }
});

router.get('/trips/:id', requireTrip, async (req, res, next) => {
  try {
    const tripId = req.trip.id;
    const [membersR, itineraryR, accomR, transportR, expensesR, splitsR] = await Promise.all([
      query('SELECT * FROM trip_members WHERE trip_id=$1 ORDER BY role DESC, joined_at, id', [tripId]),
      query('SELECT * FROM itinerary_items WHERE trip_id=$1 ORDER BY item_date,start_time NULLS LAST,id', [tripId]),
      query('SELECT * FROM accommodations WHERE trip_id=$1 ORDER BY check_in,id', [tripId]),
      query('SELECT * FROM transportation WHERE trip_id=$1 ORDER BY departure_at NULLS LAST,id', [tripId]),
      query(`SELECT e.*, m.display_name AS paid_by_name FROM expenses e JOIN trip_members m ON m.id=e.paid_by_member_id WHERE e.trip_id=$1 ORDER BY e.expense_date DESC,e.id DESC`, [tripId]),
      query(`SELECT s.* FROM expense_splits s JOIN expenses e ON e.id=s.expense_id WHERE e.trip_id=$1`, [tripId]),
    ]);
    const members = membersR.rows;
    const itinerary = itineraryR.rows;
    const accommodations = accomR.rows;
    const transportation = transportR.rows;
    const expenses = expensesR.rows;
    const splits = splitsR.rows;
    const planned = itinerary.reduce((a,x)=>a+Number(x.estimated_cost||0),0)
      + accommodations.reduce((a,x)=>a+Number(x.total_cost||0),0)
      + transportation.reduce((a,x)=>a+Number(x.total_cost||0),0);
    const actual = expenses.reduce((a,x)=>a+Number(x.amount||0),0);
    const overallBudget = Number(req.trip.overall_budget || 0);
    const groupedItinerary = Object.groupBy ? Object.groupBy(itinerary, i => dateKey(i.item_date)) : itinerary.reduce((acc,i)=>{const k=dateKey(i.item_date);(acc[k] ||= []).push(i);return acc;},{});
    const settle = settlement(members, expenses, splits);
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.render('trips/detail', {
      title: req.trip.name, trip: req.trip, members, itinerary, groupedItinerary, accommodations, transportation, expenses,
      summary: { planned, actual, overallBudget, remaining: overallBudget - actual },
      balances: settle.balances, transfers: settle.transfers,
      inviteUrl: req.trip.invite_code ? `${appUrl.replace(/\/$/,'')}/join/${req.trip.invite_code}` : null,
    });
  } catch (err) { next(err); }
});

router.post('/trips/:id/update', requireTrip, requireOwner, async (req, res, next) => {
  try {
    const start = String(req.body.start_date || ''); const end = String(req.body.end_date || '');
    if (!req.body.name || !req.body.destination || !start || !end || end < start) throw new Error('Invalid trip data');
    await query(
      `UPDATE trips SET name=$1,destination=$2,start_date=$3,end_date=$4,currency=$5,overall_budget=$6,notes=$7,updated_at=NOW() WHERE id=$8`,
      [String(req.body.name).trim(), String(req.body.destination).trim(), start, end, String(req.body.currency||'IDR').toUpperCase().slice(0,3), Math.max(0,toNumber(req.body.overall_budget)), String(req.body.notes||'').trim(), req.trip.id]
    );
    flash(req,'success','Detail trip diperbarui.'); res.redirect(`/trips/${req.trip.id}#overview`);
  } catch (err) { next(err); }
});

router.post('/trips/:id/members', requireTrip, requireOwner, async (req, res, next) => {
  try {
    if (req.trip.trip_type !== 'group') return res.redirect(`/trips/${req.trip.id}`);
    const name=String(req.body.display_name||'').trim(); const email=String(req.body.email||'').trim().toLowerCase();
    if (!name) { flash(req,'danger','Nama peserta wajib diisi.'); return res.redirect(`/trips/${req.trip.id}#people`); }
    await query(`INSERT INTO trip_members(trip_id,display_name,email,role,budget_limit) VALUES($1,$2,$3,'member',$4)`, [req.trip.id,name,email||null,Math.max(0,toNumber(req.body.budget_limit))]);
    flash(req,'success','Peserta ditambahkan.'); res.redirect(`/trips/${req.trip.id}#people`);
  } catch (err) { next(err); }
});

router.post('/trips/:id/members/:memberId/budget', requireTrip, requireOwner, async (req,res,next)=>{
  try {
    await query('UPDATE trip_members SET budget_limit=$1 WHERE id=$2 AND trip_id=$3',[Math.max(0,toNumber(req.body.budget_limit)),req.params.memberId,req.trip.id]);
    flash(req,'success','Budget peserta diperbarui.'); res.redirect(`/trips/${req.trip.id}#budget`);
  } catch(err){next(err);}
});

router.post('/trips/:id/members/:memberId/delete', requireTrip, requireOwner, async (req,res,next)=>{
  try {
    const m=await query('SELECT * FROM trip_members WHERE id=$1 AND trip_id=$2',[req.params.memberId,req.trip.id]);
    if (m.rows[0]?.role === 'owner') { flash(req,'danger','Owner tidak dapat dihapus.'); return res.redirect(`/trips/${req.trip.id}#people`); }
    const used=await query(`SELECT 1 FROM expenses WHERE paid_by_member_id=$1 UNION ALL SELECT 1 FROM expense_splits WHERE member_id=$1 LIMIT 1`,[req.params.memberId]);
    if (used.rowCount) { flash(req,'danger','Peserta sudah memiliki transaksi/split dan tidak dapat dihapus.'); return res.redirect(`/trips/${req.trip.id}#people`); }
    await query('DELETE FROM trip_members WHERE id=$1 AND trip_id=$2',[req.params.memberId,req.trip.id]);
    flash(req,'success','Peserta dihapus.'); res.redirect(`/trips/${req.trip.id}#people`);
  } catch(err){next(err);}
});

router.post('/trips/:id/itinerary', requireTrip, async (req,res,next)=>{
  try {
    const date=String(req.body.item_date||''); const title=String(req.body.title||'').trim();
    if(!date||!title||date<dateKey(req.trip.start_date)||date>dateKey(req.trip.end_date)) { flash(req,'danger','Tanggal itinerary harus berada dalam periode trip.'); return res.redirect(`/trips/${req.trip.id}#itinerary`); }
    await query(`INSERT INTO itinerary_items(trip_id,item_date,start_time,end_time,title,category,location,notes,estimated_cost,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[
      req.trip.id,date,req.body.start_time||null,req.body.end_time||null,title,String(req.body.category||'activity'),String(req.body.location||'').trim()||null,String(req.body.notes||'').trim()||null,Math.max(0,toNumber(req.body.estimated_cost)),req.session.user.id]);
    flash(req,'success','Agenda ditambahkan.'); res.redirect(`/trips/${req.trip.id}#itinerary`);
  }catch(err){next(err);}
});

router.post('/trips/:id/itinerary/:itemId/delete', requireTrip, async(req,res,next)=>{try{await query('DELETE FROM itinerary_items WHERE id=$1 AND trip_id=$2',[req.params.itemId,req.trip.id]);flash(req,'success','Agenda dihapus.');res.redirect(`/trips/${req.trip.id}#itinerary`);}catch(err){next(err);}});

router.post('/trips/:id/accommodations', requireTrip, async(req,res,next)=>{
  try{
    const ci=String(req.body.check_in||''); const co=String(req.body.check_out||''); const name=String(req.body.name||'').trim();
    if(!name||!ci||!co||co<ci){flash(req,'danger','Data akomodasi belum benar.');return res.redirect(`/trips/${req.trip.id}#bookings`);}
    await query(`INSERT INTO accommodations(trip_id,name,location,check_in,check_out,booking_ref,total_cost,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[req.trip.id,name,String(req.body.location||'').trim()||null,ci,co,String(req.body.booking_ref||'').trim()||null,Math.max(0,toNumber(req.body.total_cost)),String(req.body.notes||'').trim()||null]);
    flash(req,'success','Akomodasi ditambahkan.');res.redirect(`/trips/${req.trip.id}#bookings`);
  }catch(err){next(err);}
});
router.post('/trips/:id/accommodations/:itemId/delete', requireTrip, async(req,res,next)=>{try{await query('DELETE FROM accommodations WHERE id=$1 AND trip_id=$2',[req.params.itemId,req.trip.id]);flash(req,'success','Akomodasi dihapus.');res.redirect(`/trips/${req.trip.id}#bookings`);}catch(err){next(err);}});

router.post('/trips/:id/transport', requireTrip, async(req,res,next)=>{
  try{
    const origin=String(req.body.origin||'').trim(); const destination=String(req.body.destination||'').trim();
    if(!origin||!destination){flash(req,'danger','Asal dan tujuan transport wajib diisi.');return res.redirect(`/trips/${req.trip.id}#bookings`);}
    await query(`INSERT INTO transportation(trip_id,mode,provider,origin,destination,departure_at,arrival_at,booking_ref,total_cost,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[req.trip.id,String(req.body.mode||'Other'),String(req.body.provider||'').trim()||null,origin,destination,req.body.departure_at||null,req.body.arrival_at||null,String(req.body.booking_ref||'').trim()||null,Math.max(0,toNumber(req.body.total_cost)),String(req.body.notes||'').trim()||null]);
    flash(req,'success','Transport ditambahkan.');res.redirect(`/trips/${req.trip.id}#bookings`);
  }catch(err){next(err);}
});
router.post('/trips/:id/transport/:itemId/delete', requireTrip, async(req,res,next)=>{try{await query('DELETE FROM transportation WHERE id=$1 AND trip_id=$2',[req.params.itemId,req.trip.id]);flash(req,'success','Transport dihapus.');res.redirect(`/trips/${req.trip.id}#bookings`);}catch(err){next(err);}});

router.post('/trips/:id/expenses', requireTrip, async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const amount=Math.max(0,toNumber(req.body.amount)); const paidBy=String(req.body.paid_by_member_id||'');
    let selected=arrayify(req.body.participants).map(String);
    const members=await client.query('SELECT id FROM trip_members WHERE trip_id=$1 ORDER BY id',[req.trip.id]);
    const valid=new Set(members.rows.map(m=>String(m.id)));
    if(!valid.has(paidBy)||amount<=0){flash(req,'danger','Nominal dan pembayar wajib diisi.');return res.redirect(`/trips/${req.trip.id}#expenses`);}
    selected=selected.filter(id=>valid.has(id)); if(!selected.length) selected=[...valid];
    const cents=Math.round(amount*100); const base=Math.floor(cents/selected.length); let remainder=cents-base*selected.length;
    await client.query('BEGIN');
    const e=await client.query(`INSERT INTO expenses(trip_id,expense_date,description,category,amount,paid_by_member_id,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[req.trip.id,String(req.body.expense_date || todayDateKey()),String(req.body.description||'Expense').trim(),String(req.body.category||'other'),amount,paidBy,String(req.body.notes||'').trim()||null,req.session.user.id]);
    for(const memberId of selected){const share=(base+(remainder>0?1:0))/100;if(remainder>0)remainder--;await client.query('INSERT INTO expense_splits(expense_id,member_id,share_amount) VALUES($1,$2,$3)',[e.rows[0].id,memberId,share]);}
    await client.query('COMMIT'); flash(req,'success','Expense ditambahkan dan dibagi otomatis.');res.redirect(`/trips/${req.trip.id}#expenses`);
  }catch(err){await client.query('ROLLBACK');next(err);}finally{client.release();}
});
router.post('/trips/:id/expenses/:itemId/delete', requireTrip, async(req,res,next)=>{try{await query('DELETE FROM expenses WHERE id=$1 AND trip_id=$2',[req.params.itemId,req.trip.id]);flash(req,'success','Expense dihapus.');res.redirect(`/trips/${req.trip.id}#expenses`);}catch(err){next(err);}});

router.post('/trips/:id/invite/regenerate', requireTrip, requireOwner, async(req,res,next)=>{try{if(req.trip.trip_type==='group')await query('UPDATE trips SET invite_code=$1 WHERE id=$2',[inviteCode(),req.trip.id]);flash(req,'success','Link undangan baru dibuat.');res.redirect(`/trips/${req.trip.id}#people`);}catch(err){next(err);}});

router.post('/trips/:id/delete', requireTrip, requireOwner, async(req,res,next)=>{try{await query('DELETE FROM trips WHERE id=$1',[req.trip.id]);flash(req,'success','Trip dihapus.');res.redirect('/dashboard');}catch(err){next(err);}});

export default router;
