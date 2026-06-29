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
      'SELECT * FROM project_fields WHERE project_id = $1 ORDER BY position ASC, name ASC',
      [projectId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'fields.manage');
    if (!role) return;

    const { name, field_type = 'text', options = [], position = 0, is_required = false } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(`
      INSERT INTO project_fields (project_id, name, field_type, options, position, is_required)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [projectId, name, field_type, JSON.stringify(options), position, is_required]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A field with that name already exists' });
    next(err);
  }
});

router.patch('/:fieldId', async (req, res, next) => {
  try {
    const { projectId, fieldId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'fields.manage');
    if (!role) return;

    const allowed = ['name', 'options', 'position', 'is_required'];
    const updates = [], params = [];
    for (const key of allowed) {
      if (key in req.body) {
        const val = key === 'options' ? JSON.stringify(req.body[key]) : req.body[key];
        params.push(val); updates.push(`${key} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(fieldId, projectId);
    const { rows } = await query(
      `UPDATE project_fields SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Field not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:fieldId', async (req, res, next) => {
  try {
    const { projectId, fieldId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'fields.manage');
    if (!role) return;

    await query('DELETE FROM project_fields WHERE id = $1 AND project_id = $2', [fieldId, projectId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// PUT /api/projects/:projectId/fields/tickets/:ticketId — upsert all custom field values for a ticket
router.put('/tickets/:ticketId', async (req, res, next) => {
  try {
    const { projectId, ticketId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'tickets.write');
    if (!role) return;

    const { values } = req.body; // { [fieldId]: value }
    if (!values || typeof values !== 'object') return res.status(400).json({ error: 'values object required' });

    for (const [fieldId, value] of Object.entries(values)) {
      if (value === null || value === '') {
        await query('DELETE FROM ticket_field_values WHERE ticket_id = $1 AND field_id = $2', [ticketId, fieldId]);
      } else {
        await query(`
          INSERT INTO ticket_field_values (ticket_id, field_id, value)
          VALUES ($1, $2, $3)
          ON CONFLICT (ticket_id, field_id) DO UPDATE SET value = EXCLUDED.value
        `, [ticketId, fieldId, String(value)]);
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
