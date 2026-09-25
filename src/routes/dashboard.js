import express from 'express';
import { query } from '../database.js';
import { requireAuth } from '../middleware.js';
import { dateKey, todayDateKey } from '../utils.js';

const router = express.Router();

router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT DISTINCT t.*,
          (SELECT COUNT(*) FROM trip_members m WHERE m.trip_id=t.id) AS member_count,
          (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.trip_id=t.id) AS actual_spend
       FROM trips t
       LEFT JOIN trip_members tm ON tm.trip_id=t.id
       WHERE t.owner_id=$1 OR tm.user_id=$1
       ORDER BY t.start_date ASC`,
      [req.session.user.id]
    );

    const today = todayDateKey();
    const trips = result.rows.map(trip => {
      const start = dateKey(trip.start_date);
      const end = dateKey(trip.end_date);
      const status = today < start ? 'upcoming' : today > end ? 'completed' : 'ongoing';
      return { ...trip, status };
    });

    const stats = {
      total: trips.length,
      upcoming: trips.filter(trip => trip.status === 'upcoming').length,
      ongoing: trips.filter(trip => trip.status === 'ongoing').length,
      group: trips.filter(trip => trip.trip_type === 'group').length,
    };

    res.render('dashboard', { title: 'Dashboard', trips, stats });
  } catch (err) {
    next(err);
  }
});

export default router;
