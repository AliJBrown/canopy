const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

async function getSprint(sprintId, projectId) {
  const { rows } = await query(
    'SELECT * FROM sprints WHERE id = $1 AND project_id = $2',
    [sprintId, projectId]
  );
  return rows[0] || null;
}

// GET /api/projects/:projectId/sprints
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'sprints.view');
    if (!role) return;

    const { rows } = await query(`
      WITH sprint_hours AS (
        -- Direct sprint tickets
        SELECT s.id AS sprint_id,
          COALESCE(t.story_points, 0) AS story_points,
          CASE WHEN t.status = 'done' THEN COALESCE(t.story_points, 0) ELSE 0 END AS done_points,
          COALESCE(t.estimate_hours, 0) AS estimate_hours,
          CASE WHEN t.status = 'done' THEN COALESCE(t.estimate_hours, 0) ELSE 0 END AS done_hours,
          1 AS ticket_unit
        FROM sprints s
        JOIN tickets t ON t.sprint_id = s.id
        WHERE s.project_id = $1
        UNION ALL
        -- Sub-tasks of sprint tickets that don't have their own sprint assignment
        SELECT s.id AS sprint_id,
          0 AS story_points, 0 AS done_points,
          COALESCE(child.estimate_hours, 0) AS estimate_hours,
          CASE WHEN child.status = 'done' THEN COALESCE(child.estimate_hours, 0) ELSE 0 END AS done_hours,
          0 AS ticket_unit
        FROM sprints s
        JOIN tickets parent ON parent.sprint_id = s.id
        JOIN tickets child ON child.parent_id = parent.id AND child.sprint_id IS NULL
        WHERE s.project_id = $1
      )
      SELECT s.*,
        COALESCE(SUM(h.ticket_unit), 0)::int AS ticket_count,
        COALESCE(SUM(h.story_points), 0)::int AS total_points,
        COALESCE(SUM(h.done_points), 0)::int AS done_points,
        ROUND(COALESCE(SUM(h.estimate_hours), 0)::numeric, 1) AS total_hours,
        ROUND(COALESCE(SUM(h.done_hours), 0)::numeric, 1) AS done_hours
      FROM sprints s
      LEFT JOIN sprint_hours h ON h.sprint_id = s.id
      WHERE s.project_id = $1
      GROUP BY s.id
      ORDER BY
        CASE s.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,
        s.start_date ASC NULLS LAST,
        s.created_at ASC
    `, [projectId]);

    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/projects/:projectId/sprints
router.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'sprints.manage');
    if (!role) return;

    const { name, goal = '', start_date, end_date, metric = 'points' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(`
      INSERT INTO sprints (project_id, name, goal, start_date, end_date, metric, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [projectId, name, goal, start_date || null, end_date || null, metric, req.user.id]);

    res.status(201).json({ ...rows[0], ticket_count: 0, total_points: 0, done_points: 0, total_hours: 0, done_hours: 0 });
  } catch (err) { next(err); }
});

// PATCH /api/projects/:projectId/sprints/:sprintId
router.patch('/:sprintId', async (req, res, next) => {
  try {
    const { projectId, sprintId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'sprints.manage');
    if (!role) return;

    const sprint = await getSprint(sprintId, projectId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });

    const allowed = ['name', 'goal', 'start_date', 'end_date', 'metric', 'retrospective'];
    const updates = [];
    const params = [];
    for (const key of allowed) {
      if (key in req.body) {
        params.push(req.body[key] === '' ? null : req.body[key]);
        updates.push(`${key} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(sprintId);
    const { rows } = await query(
      `UPDATE sprints SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/projects/:projectId/sprints/:sprintId
router.delete('/:sprintId', async (req, res, next) => {
  try {
    const { projectId, sprintId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'sprints.manage');
    if (!role) return;

    const sprint = await getSprint(sprintId, projectId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    if (sprint.status === 'active') {
      return res.status(400).json({ error: 'Cannot delete an active sprint. Complete it first.' });
    }

    // Move any assigned tickets back to backlog
    await query('UPDATE tickets SET sprint_id = NULL WHERE sprint_id = $1', [sprintId]);
    await query('DELETE FROM sprints WHERE id = $1', [sprintId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/projects/:projectId/sprints/:sprintId/start
router.post('/:sprintId/start', async (req, res, next) => {
  try {
    const { projectId, sprintId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'sprints.manage');
    if (!role) return;

    const sprint = await getSprint(sprintId, projectId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    if (sprint.status !== 'planned') {
      return res.status(400).json({ error: `Sprint is already ${sprint.status}` });
    }

    try {
      const { rows } = await query(
        `UPDATE sprints SET
           status = 'active',
           committed_points = COALESCE((
             SELECT SUM(COALESCE(story_points, 0)) FROM tickets WHERE sprint_id = $1
           ), 0),
           committed_hours = COALESCE((
             SELECT ROUND(SUM(COALESCE(estimate_hours, 0))::numeric, 1) FROM tickets WHERE sprint_id = $1
           ), 0)
         WHERE id = $1 RETURNING *`,
        [sprintId]
      );
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Another sprint is already active on this project. Complete it before starting a new one.' });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

// POST /api/projects/:projectId/sprints/:sprintId/complete
router.post('/:sprintId/complete', async (req, res, next) => {
  try {
    const { projectId, sprintId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'sprints.manage');
    if (!role) return;

    const sprint = await getSprint(sprintId, projectId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    if (sprint.status !== 'active') {
      return res.status(400).json({ error: 'Only active sprints can be completed' });
    }

    const { move_to_sprint_id } = req.body;

    // If moving to another sprint, verify it exists and belongs to project
    if (move_to_sprint_id) {
      const target = await getSprint(move_to_sprint_id, projectId);
      if (!target) return res.status(400).json({ error: 'Target sprint not found' });
    }

    // Move non-done tickets
    await query(
      `UPDATE tickets SET sprint_id = $1 WHERE sprint_id = $2 AND status != 'done'`,
      [move_to_sprint_id || null, sprintId]
    );

    const { rows } = await query(
      `UPDATE sprints SET status = 'completed', completed_at = NOW() WHERE id = $1 RETURNING *`,
      [sprintId]
    );

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/projects/:projectId/sprints/:sprintId/burndown
router.get('/:sprintId/burndown', async (req, res, next) => {
  try {
    const { projectId, sprintId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'sprints.view');
    if (!role) return;

    const sprint = await getSprint(sprintId, projectId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    if (!sprint.start_date || !sprint.end_date) {
      return res.json([]);
    }

    const useHours = sprint.metric === 'hours';
    const { rows } = await query(
      useHours
        ? `
          WITH sprint_tickets AS (
            SELECT estimate_hours, completed_at, status FROM tickets WHERE sprint_id = $1
            UNION ALL
            SELECT child.estimate_hours, child.completed_at, child.status
            FROM tickets child
            JOIN tickets parent ON parent.id = child.parent_id
            WHERE parent.sprint_id = $1 AND child.sprint_id IS NULL
          ),
          total AS (
            SELECT COALESCE(SUM(COALESCE(estimate_hours, 0)), 0)::float AS val FROM sprint_tickets
          ),
          days AS (
            SELECT generate_series($2::date, LEAST($3::date, CURRENT_DATE), '1 day')::date AS day
          )
          SELECT
            d.day::text AS date,
            CASE
              WHEN d.day >= LEAST($3::date, CURRENT_DATE) THEN
                ROUND((SELECT COALESCE(SUM(COALESCE(estimate_hours, 0)), 0) FROM sprint_tickets WHERE status != 'done')::numeric, 1)
              ELSE
                ROUND((SELECT COALESCE(SUM(COALESCE(estimate_hours, 0)), 0)
                 FROM sprint_tickets
                 WHERE completed_at IS NULL OR completed_at::date > d.day
                )::numeric, 1)
            END AS remaining,
            GREATEST(0, ROUND((t.val * (1 - (d.day - $2::date)::float / NULLIF(($3::date - $2::date), 0)))::numeric, 1)) AS ideal
          FROM days d, total t
          ORDER BY d.day
        `
        : `
          WITH sprint_tickets AS (
            SELECT story_points, completed_at, status FROM tickets WHERE sprint_id = $1
          ),
          total AS (
            SELECT COALESCE(SUM(COALESCE(story_points, 1)), 0)::float AS val FROM sprint_tickets
          ),
          days AS (
            SELECT generate_series($2::date, LEAST($3::date, CURRENT_DATE), '1 day')::date AS day
          )
          SELECT
            d.day::text AS date,
            CASE
              WHEN d.day >= LEAST($3::date, CURRENT_DATE) THEN
                (SELECT COALESCE(SUM(COALESCE(story_points, 1)), 0) FROM sprint_tickets WHERE status != 'done')::int
              ELSE
                (SELECT COALESCE(SUM(COALESCE(story_points, 1)), 0)
                 FROM sprint_tickets
                 WHERE completed_at IS NULL OR completed_at::date > d.day
                )::int
            END AS remaining,
            GREATEST(0, ROUND(t.val * (1 - (d.day - $2::date)::float / NULLIF(($3::date - $2::date), 0))))::int AS ideal
          FROM days d, total t
          ORDER BY d.day
        `,
      [sprintId, sprint.start_date, sprint.end_date]
    );

    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
