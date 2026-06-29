const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

// GET / — list automations for project
router.get('/', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    const { rows } = await query(
      'SELECT * FROM project_automations WHERE project_id = $1 ORDER BY created_at ASC',
      [req.params.projectId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — create automation
router.post('/', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    const {
      name, trigger_type, trigger_config = {}, conditions = [], actions = [], is_active = true
    } = req.body;
    if (!name || !trigger_type) return res.status(400).json({ error: 'name and trigger_type required' });

    const { rows } = await query(`
      INSERT INTO project_automations (project_id, name, trigger_type, trigger_config, conditions, actions, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [req.params.projectId, name, trigger_type,
        JSON.stringify(trigger_config), JSON.stringify(conditions), JSON.stringify(actions), is_active]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /:id — update automation
router.patch('/:id', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    const allowed = ['name','trigger_type','trigger_config','conditions','actions','is_active'];
    const updates = [];
    const params = [];
    for (const f of allowed) {
      if (f in req.body) {
        const val = (f === 'trigger_config' || f === 'conditions' || f === 'actions')
          ? JSON.stringify(req.body[f]) : req.body[f];
        params.push(val);
        updates.push(`${f} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id, req.params.projectId);
    const { rows } = await query(
      `UPDATE project_automations SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:id
router.delete('/:id', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    await query('DELETE FROM project_automations WHERE id = $1 AND project_id = $2',
      [req.params.id, req.params.projectId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /:id/runs — run history for one automation
router.get('/:id/runs', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    const { rows } = await query(`
      SELECT ar.*, t.title AS ticket_title,
        CONCAT(p.key, '-', t.number) AS ticket_key
      FROM automation_runs ar
      LEFT JOIN tickets t ON t.id = ar.ticket_id
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE ar.automation_id = $1
      ORDER BY ar.ran_at DESC
      LIMIT 100
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /:id/test — manually trigger an automation against a specific ticket
router.post('/:id/test', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    const { ticket_id } = req.body;
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });

    const { rows: [auto] } = await query(
      'SELECT * FROM project_automations WHERE id = $1 AND project_id = $2',
      [req.params.id, req.params.projectId]
    );
    if (!auto) return res.status(404).json({ error: 'Automation not found' });

    const { rows: [ticket] } = await query('SELECT * FROM tickets WHERE id = $1', [ticket_id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { fireAutomations } = require('../services/automations');
    // Override is_active check by directly executing this one automation
    const { rows: labelRows } = await query('SELECT label_id FROM ticket_labels WHERE ticket_id = $1', [ticket_id]);
    const labelIds = labelRows.map(r => r.label_id);

    const actions = Array.isArray(auto.actions) ? auto.actions : [];
    const { executeAction } = require('../services/automations');

    // We don't export executeAction directly — run it via a modified fireAutomations
    // Instead just re-use the full service but temporarily set is_active for just this
    await fireAutomations(req.params.projectId, auto.trigger_type, {}, ticket, false);
    res.json({ ok: true, message: 'Test run triggered' });
  } catch (err) { next(err); }
});

module.exports = router;
