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
      'SELECT * FROM project_labels WHERE project_id = $1 ORDER BY position ASC, name ASC',
      [projectId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'labels.manage');
    if (!role) return;

    const { name, color = '#6366F1', description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(`
      INSERT INTO project_labels (project_id, name, color, description)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [projectId, name, color, description]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A label with that name already exists' });
    next(err);
  }
});

router.patch('/:labelId', async (req, res, next) => {
  try {
    const { projectId, labelId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'labels.manage');
    if (!role) return;

    const allowed = ['name', 'color', 'description', 'position'];
    const updates = [], params = [];
    for (const key of allowed) {
      if (key in req.body) { params.push(req.body[key]); updates.push(`${key} = $${params.length}`); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(labelId, projectId);
    const { rows } = await query(
      `UPDATE project_labels SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Label not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:labelId', async (req, res, next) => {
  try {
    const { projectId, labelId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'labels.manage');
    if (!role) return;

    await query('DELETE FROM project_labels WHERE id = $1 AND project_id = $2', [labelId, projectId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
