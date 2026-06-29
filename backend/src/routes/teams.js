const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth);

const TEAM_SELECT = `
  SELECT t.*,
    (SELECT COUNT(*)::int FROM team_members WHERE team_id = t.id) AS member_count,
    row_to_json(u) AS created_by_user
  FROM teams t
  LEFT JOIN (SELECT id, name, color, avatar_url FROM users) u ON u.id = t.created_by
`;

router.get('/', async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      ({ rows } = await query(`${TEAM_SELECT} ORDER BY t.name ASC`));
    } else {
      ({ rows } = await query(`
        ${TEAM_SELECT}
        WHERE t.id IN (SELECT team_id FROM team_members WHERE user_id = $1)
        ORDER BY t.name ASC
      `, [req.user.id]));
    }
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const { rows } = await query(
      'INSERT INTO teams (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      const { rows } = await query(
        'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (!rows[0] || rows[0].role !== 'owner') {
        return res.status(403).json({ error: 'Team owner or admin required' });
      }
    }
    const { name, description } = req.body;
    const { rows } = await query(
      'UPDATE teams SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
      [name, description, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await query('DELETE FROM teams WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/:id/members', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT tm.role, tm.created_at,
        u.id, u.name, u.email, u.color, u.avatar_url, u.role AS system_role
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
      ORDER BY CASE tm.role WHEN 'owner' THEN 0 ELSE 1 END, u.name ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:id/members', requireAdmin, async (req, res, next) => {
  try {
    const { user_id, role = 'member' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const { rows } = await query(
      'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (team_id, user_id) DO UPDATE SET role = $3 RETURNING *',
      [req.params.id, user_id, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id/members/:userId', requireAdmin, async (req, res, next) => {
  try {
    await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
