import { query } from '../database.js';

export async function getTripAccess(tripId, userId) {
  const result = await query(
    `SELECT t.*,
            tm.id AS current_member_id,
            tm.role AS current_member_role
       FROM trips t
       LEFT JOIN trip_members tm
         ON tm.trip_id=t.id AND tm.user_id=$2
      WHERE t.id=$1
        AND (t.owner_id=$2 OR tm.user_id=$2)
      LIMIT 1`,
    [tripId, userId]
  );
  return result.rows[0] || null;
}

export async function requireTrip(req, res, next) {
  try {
    let trip;
    if (req.session.user?.role === 'Administrator') {
      const result = await query(
        `SELECT t.*, NULL::BIGINT AS current_member_id, 'administrator'::TEXT AS current_member_role
           FROM trips t WHERE t.id=$1 LIMIT 1`,
        [req.params.id]
      );
      trip = result.rows[0] || null;
    } else {
      trip = await getTripAccess(req.params.id, req.session.user.id);
    }

    if (!trip) {
      return res.status(404).render('error', {
        title: 'Trip tidak ditemukan',
        status: 404,
        message: 'Anda tidak memiliki akses ke trip ini.',
      });
    }

    req.trip = trip;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireOwner(req, res, next) {
  if (req.session.user?.role === 'Administrator') return next();
  if (Number(req.trip.owner_id) !== Number(req.session.user.id)) {
    return res.status(403).render('error', {
      title: 'Akses ditolak',
      status: 403,
      message: 'Hanya owner trip atau Administrator yang dapat melakukan tindakan ini.',
    });
  }
  next();
}
