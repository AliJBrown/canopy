const router = require('express').Router({ mergeParams: true }); // /api/programs/:programId/stage-progress
const { query } = require('../db');
const { requireAuth, checkSystemPermission } = require('../middleware/auth');

router.use(requireAuth);

// GET /:stageId — the manual override + notes for one (program, stage), or defaults if unset
router.get('/:stageId', async (req, res, next) => {
  try {
    const { rows: [row] } = await query(
      'SELECT * FROM program_stage_progress WHERE program_id = $1 AND stage_id = $2',
      [req.params.programId, req.params.stageId]
    );
    res.json(row || { program_id: req.params.programId, stage_id: req.params.stageId, manual_state: null, notes: '' });
  } catch (err) { next(err); }
});

// PUT /:stageId — set/clear the manual state override and/or notes (upsert).
// The request always carries the full intended state for both fields (manual_state: null means
// "Auto" / cleared) — the client loads current values via GET first, so there's no ambiguity
// between "field omitted, leave as-is" and "field explicitly cleared" to resolve here.
router.put('/:stageId', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'programs.write'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const { manual_state = null, notes = '' } = req.body;
    if (manual_state !== null && !['not_started', 'active', 'done'].includes(manual_state)) {
      return res.status(400).json({ error: 'Invalid manual_state' });
    }

    const { rows: [row] } = await query(`
      INSERT INTO program_stage_progress (program_id, stage_id, manual_state, notes, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (program_id, stage_id) DO UPDATE SET
        manual_state = EXCLUDED.manual_state,
        notes = EXCLUDED.notes,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `, [req.params.programId, req.params.stageId, manual_state, notes, req.user.id]);
    res.json(row);
  } catch (err) { next(err); }
});

module.exports = router;
