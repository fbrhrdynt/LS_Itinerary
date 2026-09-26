import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../database.js';
import { requireAdmin, requireAuth } from '../middleware.js';
import { flash } from '../utils.js';

const router = express.Router();
router.use('/admin', requireAuth, requireAdmin);

const ROLES = new Set(['Administrator', 'User']);
const STATUSES = new Set(['active', 'hold', 'blocked']);

async function audit(req, action, targetType, targetId = null, details = '') {
  await query(
    `INSERT INTO admin_audit_logs(administrator_id,action,target_type,target_id,details)
     VALUES($1,$2,$3,$4,$5)`,
    [req.session.user.id, action, targetType, targetId, details]
  );
}

async function ensureAdminCanChange(targetId, nextRole, nextStatus, action) {
  const targetResult = await query('SELECT id,role,status FROM users WHERE id=$1 LIMIT 1', [targetId]);
  const target = targetResult.rows[0];
  if (!target) return { ok: false, status: 404, message: 'User tidak ditemukan.' };

  if (target.role === 'Administrator') {
    const adminCount = Number((await query(`SELECT COUNT(*) AS total FROM users WHERE role='Administrator'`)).rows[0].total);
    const removesAdminAccess = action === 'delete' || nextRole === 'User' || nextStatus !== 'active';
    if (adminCount <= 1 && removesAdminAccess) {
      return { ok: false, status: 400, message: 'Administrator terakhir tidak dapat dinonaktifkan atau dihapus.' };
    }
  }

  return { ok: true, target };
}

router.get('/admin', async (req, res, next) => {
  try {
    const statsResult = await query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users_total,
        (SELECT COUNT(*) FROM users WHERE status='active') AS users_active,
        (SELECT COUNT(*) FROM users WHERE status='hold') AS users_hold,
        (SELECT COUNT(*) FROM users WHERE status='blocked') AS users_blocked,
        (SELECT COUNT(*) FROM trips) AS trips_total,
        (SELECT COUNT(*) FROM trips WHERE trip_type='group') AS trips_group,
        (SELECT COUNT(*) FROM itinerary_items) AS itinerary_total,
        (SELECT COUNT(*) FROM expenses) AS expenses_total
    `);

    const usersResult = await query(`
      SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,u.last_login_at,
             COUNT(DISTINCT t.id) AS owned_trips,
             COUNT(DISTINCT tm.trip_id) AS joined_trips
        FROM users u
        LEFT JOIN trips t ON t.owner_id=u.id
        LEFT JOIN trip_members tm ON tm.user_id=u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 8
    `);

    const tripsResult = await query(`
      SELECT t.id,t.name,t.destination,t.trip_type,t.start_date,t.end_date,t.currency,
             u.name AS owner_name,
             COUNT(DISTINCT tm.id) AS member_count,
             COUNT(DISTINCT ii.id) AS itinerary_count,
             COUNT(DISTINCT e.id) AS expense_count
        FROM trips t
        JOIN users u ON u.id=t.owner_id
        LEFT JOIN trip_members tm ON tm.trip_id=t.id
        LEFT JOIN itinerary_items ii ON ii.trip_id=t.id
        LEFT JOIN expenses e ON e.trip_id=t.id
       GROUP BY t.id,u.name
       ORDER BY t.created_at DESC
       LIMIT 10
    `);

    const auditResult = await query(`
      SELECT l.*,u.name AS administrator_name
        FROM admin_audit_logs l
        LEFT JOIN users u ON u.id=l.administrator_id
       ORDER BY l.created_at DESC
       LIMIT 10
    `);

    res.render('admin/dashboard', {
      title: 'Administrator',
      stats: statsResult.rows[0],
      users: usersResult.rows,
      trips: tripsResult.rows,
      auditLogs: auditResult.rows,
    });
  } catch (err) { next(err); }
});

router.get('/admin/users', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,u.updated_at,u.last_login_at,
             COUNT(DISTINCT t.id) AS owned_trips,
             COUNT(DISTINCT tm.trip_id) AS joined_trips
        FROM users u
        LEFT JOIN trips t ON t.owner_id=u.id
        LEFT JOIN trip_members tm ON tm.user_id=u.id
       GROUP BY u.id
       ORDER BY CASE WHEN u.role='Administrator' THEN 0 ELSE 1 END,u.created_at DESC
    `);
    res.render('admin/users', { title: 'Kelola User', users: result.rows });
  } catch (err) { next(err); }
});

router.post('/admin/users', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = ROLES.has(req.body.role) ? req.body.role : 'User';
    const status = STATUSES.has(req.body.status) ? req.body.status : 'active';

    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      flash(req, 'danger', 'Nama, email, dan password minimal 8 karakter wajib diisi dengan benar.');
      return res.redirect('/admin/users');
    }

    const existing = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
    if (existing.rowCount) {
      flash(req, 'danger', 'Email sudah terdaftar.');
      return res.redirect('/admin/users');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users(name,email,password_hash,role,status)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id,name,email`,
      [name, email, passwordHash, role, status]
    );
    await audit(req, 'create_user', 'user', result.rows[0].id, `${role} · ${status}`);
    flash(req, 'success', `${result.rows[0].name} berhasil ditambahkan.`);
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

router.get('/admin/users/:id', async (req, res, next) => {
  try {
    const userResult = await query(
      'SELECT id,name,email,role,status,created_at,updated_at,last_login_at FROM users WHERE id=$1 LIMIT 1',
      [req.params.id]
    );
    if (!userResult.rowCount) {
      return res.status(404).render('error', { title: 'User tidak ditemukan', status: 404, message: 'User yang Anda cari tidak tersedia.' });
    }

    const ownedTrips = await query(`
      SELECT id,name,destination,trip_type,start_date,end_date
        FROM trips WHERE owner_id=$1 ORDER BY start_date DESC
    `, [req.params.id]);

    const joinedTrips = await query(`
      SELECT t.id,t.name,t.destination,t.trip_type,t.start_date,t.end_date,tm.role
        FROM trip_members tm
        JOIN trips t ON t.id=tm.trip_id
       WHERE tm.user_id=$1
       ORDER BY t.start_date DESC
    `, [req.params.id]);

    res.render('admin/user-detail', {
      title: 'Detail User',
      user: userResult.rows[0],
      ownedTrips: ownedTrips.rows,
      joinedTrips: joinedTrips.rows,
    });
  } catch (err) { next(err); }
});

router.post('/admin/users/:id', async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const role = ROLES.has(req.body.role) ? req.body.role : 'User';
    const status = STATUSES.has(req.body.status) ? req.body.status : 'active';
    const password = String(req.body.password || '');

    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
      flash(req, 'danger', 'Nama dan email wajib diisi dengan benar.');
      return res.redirect(`/admin/users/${targetId}`);
    }

    if (targetId === Number(req.session.user.id) && (role !== 'Administrator' || status !== 'active')) {
      flash(req, 'danger', 'Akun Administrator yang sedang digunakan harus tetap aktif dan berlevel Administrator.');
      return res.redirect(`/admin/users/${targetId}`);
    }

    const allowed = await ensureAdminCanChange(targetId, role, status, 'update');
    if (!allowed.ok) {
      flash(req, 'danger', allowed.message);
      return res.redirect(`/admin/users/${targetId}`);
    }

    const duplicate = await query('SELECT id FROM users WHERE email=$1 AND id<>$2 LIMIT 1', [email, targetId]);
    if (duplicate.rowCount) {
      flash(req, 'danger', 'Email sudah digunakan oleh user lain.');
      return res.redirect(`/admin/users/${targetId}`);
    }

    if (password) {
      if (password.length < 8) {
        flash(req, 'danger', 'Password baru minimal 8 karakter.');
        return res.redirect(`/admin/users/${targetId}`);
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await query(
        `UPDATE users SET name=$1,email=$2,role=$3,status=$4,password_hash=$5,updated_at=NOW() WHERE id=$6`,
        [name, email, role, status, passwordHash, targetId]
      );
    } else {
      await query(
        `UPDATE users SET name=$1,email=$2,role=$3,status=$4,updated_at=NOW() WHERE id=$5`,
        [name, email, role, status, targetId]
      );
    }

    await audit(req, 'update_user', 'user', targetId, `${role} · ${status}${password ? ' · password reset' : ''}`);
    flash(req, 'success', 'User berhasil diperbarui.');
    res.redirect(`/admin/users/${targetId}`);
  } catch (err) { next(err); }
});

router.post('/admin/users/:id/delete', async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    if (targetId === Number(req.session.user.id)) {
      flash(req, 'danger', 'Akun yang sedang digunakan tidak dapat dihapus.');
      return res.redirect(`/admin/users/${targetId}`);
    }

    const allowed = await ensureAdminCanChange(targetId, 'User', 'blocked', 'delete');
    if (!allowed.ok) {
      flash(req, 'danger', allowed.message);
      return res.redirect(`/admin/users/${targetId}`);
    }

    await audit(req, 'delete_user', 'user', targetId, 'User deleted by Administrator');
    await query('DELETE FROM users WHERE id=$1', [targetId]);
    flash(req, 'success', 'User dan data yang dimilikinya berhasil dihapus.');
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

export default router;
