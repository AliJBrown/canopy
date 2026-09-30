const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, checkSystemPermission } = require('../middleware/auth');

router.use(requireAuth);

async function assertProgramsWrite(req, res) {
  if (!(await checkSystemPermission(req.user, 'programs.write'))) {
    res.status(403).json({ error: 'Permission denied' });
    return false;
  }
  return true;
}

// GET / — the global pipeline stage list, shared by every program
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM pipeline_stages ORDER BY position ASC, created_at ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — create a stage
router.post('/', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;

    const { name, color = '#6366f1' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const { rows: [maxPos] } = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM pipeline_stages'
    );

    const { rows } = await query(
      `INSERT INTO pipeline_stages (name, slug, color, position)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), slug, color, maxPos.next]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A stage with that name already exists' });
    next(err);
  }
});

// PATCH /:stageId — update name/color/position
router.patch('/:stageId', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;

    const allowed = ['name', 'color', 'position'];
    const updates = [];
    const params = [];
    allowed.forEach(f => {
      if (f in req.body) {
        params.push(req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.stageId);
    const { rows } = await query(
      `UPDATE pipeline_stages SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /reorder — bulk update positions
router.post('/reorder', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;

    const { order } = req.body; // array of stage ids in new order
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });

    for (let i = 0; i < order.length; i++) {
      await query('UPDATE pipeline_stages SET position = $1 WHERE id = $2', [i, order[i]]);
    }
    const { rows } = await query('SELECT * FROM pipeline_stages ORDER BY position ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// DELETE /:stageId
router.delete('/:stageId', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;

    const { rows: [stage] } = await query('SELECT * FROM pipeline_stages WHERE id = $1', [req.params.stageId]);
    if (!stage) return res.status(404).json({ error: 'Not found' });

    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*)::int AS count FROM program_checklist_items WHERE stage_id = $1',
      [req.params.stageId]
    );
    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${count} checklist item${count > 1 ? 's' : ''} still use this stage.`,
      });
    }

    await query('DELETE FROM pipeline_stages WHERE id = $1', [req.params.stageId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
