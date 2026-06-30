const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const NOTIF_SELECT = `
  SELECT
    n.*,
    json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url) AS actor,
    t.title AS ticket_title,
    p.key  AS project_key,
    t.number AS ticket_number
  FROM notifications n
  LEFT JOIN users u ON u.id = n.actor_id
  LEFT JOIN tickets t ON t.id = n.ticket_id
  LEFT JOIN projects p ON p.id = t.project_id
`;

// GET /api/notifications — recent notifications for the current user
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const { rows } = await query(
      `${NOTIF_SELECT} WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT $2`,
      [req.user.id, limit]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
  try {
    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ count });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/mark-read
router.patch('/mark-read', async (req, res, next) => {
  try {
    const { ids, all } = req.body;
    if (all) {
      await query(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
        [req.user.id]
      );
    } else if (Array.isArray(ids) && ids.length) {
      await query(
        'UPDATE notifications SET read_at = NOW() WHERE id = ANY($1::uuid[]) AND user_id = $2',
        [ids, req.user.id]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/mark-unread
router.patch('/mark-unread', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length) {
      await query(
        'UPDATE notifications SET read_at = NULL WHERE id = ANY($1::uuid[]) AND user_id = $2',
        [ids, req.user.id]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
