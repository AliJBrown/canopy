const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

const DEFAULT_STATUSES = [
  { slug: 'backlog',     name: 'Backlog',     color: '#94a3b8', category: 'todo',        position: 0, is_default: true },
  { slug: 'todo',        name: 'To Do',       color: '#60a5fa', category: 'todo',        position: 1, is_default: false },
  { slug: 'in_progress', name: 'In Progress', color: '#f59e0b', category: 'in_progress', position: 2, is_default: false },
  { slug: 'in_review',   name: 'In Review',   color: '#8b5cf6', category: 'in_progress', position: 3, is_default: false },
  { slug: 'blocked',     name: 'Blocked',     color: '#ef4444', category: 'in_progress', position: 4, is_default: false },
  { slug: 'done',        name: 'Done',        color: '#10b981', category: 'done',        position: 5, is_default: false },
];

// Ensure project has statuses (seed on first access if somehow missing)
async function ensureStatuses(projectId) {
  const { rows } = await query('SELECT id FROM project_statuses WHERE project_id = $1 LIMIT 1', [projectId]);
  if (rows.length === 0) {
    for (const s of DEFAULT_STATUSES) {
      await query(
        `INSERT INTO project_statuses (project_id, slug, name, color, category, position, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [projectId, s.slug, s.name, s.color, s.category, s.position, s.is_default]
      );
    }
  }
}

// GET / — list project statuses
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await ensureStatuses(projectId);
    const { rows } = await query(
      'SELECT * FROM project_statuses WHERE project_id = $1 ORDER BY position ASC, created_at ASC',
      [projectId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — create status
router.post('/', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;

    const { name, color = '#6366f1', category = 'in_progress' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const { rows: [maxPos] } = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM project_statuses WHERE project_id = $1',
      [req.params.projectId]
    );

    const { rows } = await query(
      `INSERT INTO project_statuses (project_id, slug, name, color, category, position)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.projectId, slug, name.trim(), color, category, maxPos.next]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A status with that name already exists' });
    next(err);
  }
});

// PATCH /:statusId — update name/color/category/position
router.patch('/:statusId', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;

    const allowed = ['name', 'color', 'category', 'position', 'wip_limit'];
    const updates = [];
    const params = [];
    allowed.forEach(f => {
      if (f in req.body) {
        params.push(req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.statusId, req.params.projectId);
    const { rows } = await query(
      `UPDATE project_statuses SET ${updates.join(', ')}
       WHERE id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /reorder — bulk update positions
router.post('/reorder', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;

    const { order } = req.body; // array of status ids in new order
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });

    for (let i = 0; i < order.length; i++) {
      await query(
        'UPDATE project_statuses SET position = $1 WHERE id = $2 AND project_id = $3',
        [i, order[i], req.params.projectId]
      );
    }
    const { rows } = await query(
      'SELECT * FROM project_statuses WHERE project_id = $1 ORDER BY position ASC',
      [req.params.projectId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// DELETE /:statusId
router.delete('/:statusId', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'statuses.manage');
    if (!role) return;

    const { rows: [status] } = await query(
      'SELECT * FROM project_statuses WHERE id = $1 AND project_id = $2',
      [req.params.statusId, req.params.projectId]
    );
    if (!status) return res.status(404).json({ error: 'Not found' });

    // Prevent deleting if tickets exist with this status
    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*)::int AS count FROM tickets WHERE project_id = $1 AND status = $2',
      [req.params.projectId, status.slug]
    );
    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${count} ticket${count > 1 ? 's' : ''} still use this status. Move them first.`,
      });
    }

    await query('DELETE FROM project_statuses WHERE id = $1', [req.params.statusId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
