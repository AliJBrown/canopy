const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission, hasProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

async function getTicketProject(ticketId) {
  const { rows } = await query('SELECT project_id FROM tickets WHERE id = $1', [ticketId]);
  return rows[0]?.project_id || null;
}

router.get('/', async (req, res, next) => {
  try {
    const projectId = await getTicketProject(req.params.ticketId);
    if (!projectId) return res.status(404).json({ error: 'Ticket not found' });
    const role = await assertProjectPermission(req, res, projectId, 'time.view');
    if (!role) return;

    const { rows } = await query(`
      SELECT tl.*,
        json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url) AS user
      FROM time_logs tl
      LEFT JOIN users u ON u.id = tl.user_id
      WHERE tl.ticket_id = $1
      ORDER BY tl.logged_date DESC, tl.created_at DESC
    `, [req.params.ticketId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const projectId = await getTicketProject(req.params.ticketId);
    if (!projectId) return res.status(404).json({ error: 'Ticket not found' });
    const role = await assertProjectPermission(req, res, projectId, 'time.log');
    if (!role) return;

    const { hours, description = '', logged_date } = req.body;
    if (!hours || isNaN(hours) || hours <= 0) {
      return res.status(400).json({ error: 'hours must be a positive number' });
    }
    if (hours > 24) {
      return res.status(400).json({ error: 'Cannot log more than 24 hours in a single entry' });
    }

    const date = logged_date || new Date().toISOString().split('T')[0];
    const { rows } = await query(
      'INSERT INTO time_logs (ticket_id, user_id, hours, description, logged_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.ticketId, req.user.id, parseFloat(hours), description, date]
    );
    const full = await query(`
      SELECT tl.*,
        json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url) AS user
      FROM time_logs tl LEFT JOIN users u ON u.id = tl.user_id WHERE tl.id = $1
    `, [rows[0].id]);
    res.status(201).json(full.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:logId', async (req, res, next) => {
  try {
    const { rows: [log] } = await query('SELECT * FROM time_logs WHERE id = $1', [req.params.logId]);
    if (!log) return res.status(404).json({ error: 'Not found' });

    const projectId = await getTicketProject(log.ticket_id);
    if (!projectId) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, projectId, 'time.log');
    if (!role) return;

    if (log.user_id !== req.user.id) {
      const canManage = await hasProjectPermission(req.user.id, projectId, req.user.role, 'project.settings');
      if (!canManage) return res.status(403).json({ error: 'You can only delete your own time logs' });
    }

    await query('DELETE FROM time_logs WHERE id = $1', [req.params.logId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
