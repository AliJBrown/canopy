const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'tickets.view');
    if (!role) return;
    const { rows } = await query(
      'SELECT * FROM saved_filters WHERE user_id = $1 AND project_id = $2 ORDER BY created_at ASC',
      [req.user.id, projectId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'tickets.view');
    if (!role) return;
    const { name, filter_config } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(`
      INSERT INTO saved_filters (user_id, project_id, name, filter_config)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.user.id, projectId, name, JSON.stringify(filter_config || {})]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:filterId', async (req, res, next) => {
  try {
    const { projectId, filterId } = req.params;
    const { name, filter_config } = req.body;
    const updates = [], params = [];
    if (name) { params.push(name); updates.push(`name = $${params.length}`); }
    if (filter_config) { params.push(JSON.stringify(filter_config)); updates.push(`filter_config = $${params.length}`); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(filterId, req.user.id, projectId);
    const { rows } = await query(
      `UPDATE saved_filters SET ${updates.join(', ')} WHERE id = $${params.length - 2} AND user_id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Filter not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:filterId', async (req, res, next) => {
  try {
    const { projectId, filterId } = req.params;
    await query(
      'DELETE FROM saved_filters WHERE id = $1 AND user_id = $2 AND project_id = $3',
      [filterId, req.user.id, projectId]
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
