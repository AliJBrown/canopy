const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

// GET / — get workflow + transitions for project
router.get('/', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'tickets.view');
    if (!role) return;
    const { projectId } = req.params;

    const { rows: [wf] } = await query(
      'SELECT * FROM project_workflows WHERE project_id = $1', [projectId]
    );

    if (!wf) return res.json({ workflow: null, transitions: [] });

    const { rows: transitions } = await query(
      'SELECT * FROM workflow_transitions WHERE workflow_id = $1 ORDER BY from_status, to_status',
      [wf.id]
    );

    res.json({ workflow: wf, transitions });
  } catch (err) { next(err); }
});

// POST / — create or replace workflow for project
router.post('/', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    const { name = 'Default Workflow', is_enforced = false } = req.body;
    const { projectId } = req.params;

    // Upsert workflow
    const { rows: [wf] } = await query(`
      INSERT INTO project_workflows (project_id, name, is_enforced)
      VALUES ($1, $2, $3)
      ON CONFLICT (project_id) DO UPDATE SET name = EXCLUDED.name, is_enforced = EXCLUDED.is_enforced
      RETURNING *
    `, [projectId, name, is_enforced]);

    res.status(201).json(wf);
  } catch (err) { next(err); }
});

// PATCH /settings — update workflow name/enforcement
router.patch('/settings', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    const { name, is_enforced } = req.body;
    const { projectId } = req.params;

    const { rows: [wf] } = await query(
      'SELECT id FROM project_workflows WHERE project_id = $1', [projectId]
    );
    if (!wf) return res.status(404).json({ error: 'No workflow for this project. Create one first.' });

    const updates = [];
    const params = [];
    if (name !== undefined) { params.push(name); updates.push(`name = $${params.length}`); }
    if (is_enforced !== undefined) { params.push(is_enforced); updates.push(`is_enforced = $${params.length}`); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(wf.id);
    const { rows } = await query(
      `UPDATE project_workflows SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`, params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /transitions — add a transition
router.post('/transitions', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    const { from_status, to_status, name = '' } = req.body;
    if (!from_status || !to_status) return res.status(400).json({ error: 'from_status and to_status required' });

    // Get or create workflow
    let { rows: [wf] } = await query(
      'SELECT * FROM project_workflows WHERE project_id = $1', [req.params.projectId]
    );
    if (!wf) {
      const result = await query(
        'INSERT INTO project_workflows (project_id) VALUES ($1) RETURNING *', [req.params.projectId]
      );
      wf = result.rows[0];
    }

    const { rows } = await query(`
      INSERT INTO workflow_transitions (workflow_id, from_status, to_status, name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workflow_id, from_status, to_status) DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `, [wf.id, from_status, to_status, name]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /transitions/:transitionId
router.delete('/transitions/:transitionId', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    await query('DELETE FROM workflow_transitions WHERE id = $1', [req.params.transitionId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// DELETE / — remove workflow (and all its transitions) for project
router.delete('/', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;
    await query('DELETE FROM project_workflows WHERE project_id = $1', [req.params.projectId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
