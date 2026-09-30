const router = require('express').Router({ mergeParams: true }); // /api/programs/:programId/goal-links
const { query } = require('../db');
const { requireAuth, checkSystemPermission } = require('../middleware/auth');

router.use(requireAuth);

// GET / — org-level goals linked to this program
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT g.id, g.title, g.goal_type, g.status, pgl.created_at AS linked_at
      FROM program_goal_links pgl
      JOIN project_goals g ON g.id = pgl.goal_id
      WHERE pgl.program_id = $1
      ORDER BY pgl.created_at ASC
    `, [req.params.programId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /candidates?q= — searchable org-level (project_id IS NULL) goals not yet linked
router.get('/candidates', async (req, res, next) => {
  try {
    const { q = '' } = req.query;
    const { rows } = await query(`
      SELECT id, title, goal_type, status
      FROM project_goals
      WHERE project_id IS NULL
        AND ($1 = '' OR title ILIKE '%' || $1 || '%')
        AND id NOT IN (SELECT goal_id FROM program_goal_links WHERE program_id = $2)
      ORDER BY created_at DESC
      LIMIT 20
    `, [q, req.params.programId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — link an org-level goal to this program
router.post('/', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'programs.write'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const { goal_id } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required' });

    const { rows: [goal] } = await query('SELECT id FROM project_goals WHERE id = $1 AND project_id IS NULL', [goal_id]);
    if (!goal) return res.status(404).json({ error: 'Strategic goal not found' });

    await query(
      'INSERT INTO program_goal_links (program_id, goal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.programId, goal_id]
    );
    res.status(201).json({ program_id: req.params.programId, goal_id });
  } catch (err) { next(err); }
});

// DELETE /:goalId — unlink
router.delete('/:goalId', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'programs.write'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    await query(
      'DELETE FROM program_goal_links WHERE program_id = $1 AND goal_id = $2',
      [req.params.programId, req.params.goalId]
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
