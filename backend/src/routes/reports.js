const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

async function checkAccess(req, res) {
  const role = await assertProjectPermission(req, res, req.params.projectId, 'reports.view');
  return !!role;
}

// GET /overview — status/type/priority distributions + health metrics
router.get('/overview', async (req, res, next) => {
  try {
    if (!await checkAccess(req, res)) return;
    const { projectId } = req.params;

    const [statusRows, typeRows, priorityRows, healthRows] = await Promise.all([
      query(`
        SELECT status, COUNT(*)::int AS count
        FROM tickets WHERE project_id = $1
        GROUP BY status
      `, [projectId]),
      query(`
        SELECT type, COUNT(*)::int AS count
        FROM tickets WHERE project_id = $1
        GROUP BY type
      `, [projectId]),
      query(`
        SELECT priority, COUNT(*)::int AS count
        FROM tickets WHERE project_id = $1 AND status != 'done'
        GROUP BY priority
      `, [projectId]),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status != 'done')::int AS open_tickets,
          COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
          COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done')::int AS overdue,
          COUNT(*) FILTER (WHERE story_points IS NULL AND status != 'done')::int AS unestimated,
          COUNT(*) FILTER (WHERE estimate_hours IS NULL AND status != 'done')::int AS unestimated_hours,
          COUNT(*) FILTER (WHERE assignee_id IS NULL AND status != 'done')::int AS unassigned,
          COUNT(*) FILTER (WHERE sprint_id IS NULL AND status != 'done')::int AS backlog_count
        FROM tickets WHERE project_id = $1
      `, [projectId]),
    ]);

    res.json({
      status: statusRows.rows,
      type: typeRows.rows,
      priority: priorityRows.rows,
      health: healthRows.rows[0],
    });
  } catch (err) { next(err); }
});

// GET /velocity — story points per sprint
router.get('/velocity', async (req, res, next) => {
  try {
    if (!await checkAccess(req, res)) return;
    const { projectId } = req.params;

    const { rows } = await query(`
      SELECT
        s.id AS sprint_id,
        s.name,
        s.start_date,
        s.end_date,
        s.status,
        COALESCE(SUM(COALESCE(t.story_points, 0)), 0)::int AS total_points,
        COALESCE(SUM(CASE WHEN t.status = 'done' THEN COALESCE(t.story_points, 0) ELSE 0 END), 0)::int AS completed_points,
        COUNT(t.id)::int AS ticket_count,
        COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS completed_count
      FROM sprints s
      LEFT JOIN tickets t ON t.sprint_id = s.id
      WHERE s.project_id = $1 AND s.status IN ('active', 'completed')
      GROUP BY s.id
      ORDER BY s.start_date ASC NULLS LAST, s.created_at ASC
    `, [projectId]);

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /cycle-time — avg/median hours from created_at → completed_at per week
router.get('/cycle-time', async (req, res, next) => {
  try {
    if (!await checkAccess(req, res)) return;
    const { projectId } = req.params;

    const { rows } = await query(`
      SELECT
        DATE_TRUNC('week', completed_at)::date AS week,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600))::int AS avg_hours,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600
        ))::int AS median_hours,
        COUNT(*)::int AS count
      FROM tickets
      WHERE project_id = $1
        AND status = 'done'
        AND completed_at IS NOT NULL
        AND completed_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', completed_at)
      ORDER BY week ASC
    `, [projectId]);

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /throughput — tickets + points completed per week
router.get('/throughput', async (req, res, next) => {
  try {
    if (!await checkAccess(req, res)) return;
    const { projectId } = req.params;

    const { rows } = await query(`
      SELECT
        DATE_TRUNC('week', completed_at)::date AS week,
        COUNT(*)::int AS tickets_count,
        COALESCE(SUM(COALESCE(story_points, 0)), 0)::int AS points_count
      FROM tickets
      WHERE project_id = $1
        AND status = 'done'
        AND completed_at IS NOT NULL
        AND completed_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', completed_at)
      ORDER BY week ASC
    `, [projectId]);

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /workload — open tickets + points per assignee
router.get('/workload', async (req, res, next) => {
  try {
    if (!await checkAccess(req, res)) return;
    const { projectId } = req.params;

    const { rows } = await query(`
      SELECT
        u.id,
        u.name,
        u.color,
        u.avatar_url,
        COUNT(t.id) FILTER (WHERE t.status != 'done')::int AS open_tickets,
        COALESCE(SUM(COALESCE(t.story_points, 0)) FILTER (WHERE t.status != 'done'), 0)::int AS open_points,
        COUNT(t.id) FILTER (WHERE t.status = 'in_progress')::int AS in_progress_count,
        COUNT(t.id) FILTER (WHERE t.due_date < NOW() AND t.status != 'done')::int AS overdue_count
      FROM users u
      LEFT JOIN tickets t ON t.assignee_id = u.id AND t.project_id = $1
      WHERE u.id IN (
        SELECT user_id FROM project_members WHERE project_id = $1
        UNION
        SELECT tm.user_id FROM team_members tm
        JOIN project_teams pt ON pt.team_id = tm.team_id WHERE pt.project_id = $1
      )
      GROUP BY u.id, u.name, u.color, u.avatar_url
      ORDER BY open_points DESC, open_tickets DESC
    `, [projectId]);

    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
