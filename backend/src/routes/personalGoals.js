const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

async function computePersonalGoalTree(userId) {
  const { rows: goals } = await query(`
    SELECT g.*,
      CASE WHEN p.id IS NOT NULL
        THEN json_build_object('id', p.id, 'name', p.name, 'key', p.key)
        ELSE NULL END AS project,
      COUNT(DISTINCT ct.ticket_id)::int AS linked_count,
      COUNT(DISTINCT ct.ticket_id) FILTER (WHERE ct.status = 'done')::int AS completed_count,
      COALESCE(SUM(DISTINCT CASE WHEN ct.status = 'done' THEN ct.story_points ELSE NULL END), 0) AS completed_points,
      COALESCE(SUM(DISTINCT ct.story_points), 0) AS total_points
    FROM project_goals g
    LEFT JOIN projects p ON p.id = g.project_id
    LEFT JOIN (
      SELECT tgl.goal_id, t.id AS ticket_id, t.status, t.story_points
      FROM ticket_goal_links tgl
      JOIN tickets t ON t.id = tgl.ticket_id
    ) ct ON ct.goal_id = g.id
    WHERE g.user_id = $1
    GROUP BY g.id, p.id, p.name, p.key
    ORDER BY g.position, g.created_at
  `, [userId]);

  const byId = {};
  const roots = [];
  goals.forEach(g => { byId[g.id] = { ...g, children: [] }; });
  goals.forEach(g => {
    if (g.parent_id && byId[g.parent_id]) byId[g.parent_id].children.push(byId[g.id]);
    else roots.push(byId[g.id]);
  });

  function computeProgress(node) {
    node.children.forEach(computeProgress);
    if (node.children.length > 0) {
      if (node.metric_type === 'subgoals') {
        const completedChildren = node.children.filter(c => c.auto_status === 'completed').length;
        node.progress = (completedChildren / node.children.length) * 100;
      } else {
        const totalW = node.children.reduce((s, c) => s + parseFloat(c.weight || 1), 0);
        node.progress = totalW > 0
          ? node.children.reduce((s, c) => s + c.progress * parseFloat(c.weight || 1), 0) / totalW
          : 0;
      }
    } else {
      const linked = parseInt(node.linked_count) || 0;
      const done = parseInt(node.completed_count) || 0;
      const target = parseFloat(node.target_value) || 0;
      switch (node.metric_type) {
        case 'subgoals':
        case 'completion': node.progress = linked > 0 ? (done / linked) * 100 : 0; break;
        case 'points': node.progress = target > 0 ? (parseFloat(node.completed_points) / target) * 100 : 0; break;
        case 'count': node.progress = target > 0 ? (done / target) * 100 : 0; break;
        default: node.progress = target > 0 ? (parseFloat(node.current_value) / target) * 100 : 0;
      }
      node.progress = Math.min(Math.max(node.progress, 0), 100);
    }
    node.progress = Math.round(node.progress * 10) / 10;

    if (node.progress >= 100 || node.status === 'completed') {
      node.auto_status = 'completed';
    } else if (node.status === 'cancelled') {
      node.auto_status = 'cancelled';
    } else if (node.status === 'at_risk' || node.status === 'behind') {
      node.auto_status = node.status;
    } else {
      const now = new Date();
      const start = node.start_date ? new Date(node.start_date) : null;
      const due = node.due_date ? new Date(node.due_date) : null;
      if (start && now < start) {
        node.auto_status = 'not_started';
      } else if (due) {
        const total = Math.max(due - (start || now), 1);
        const elapsed = Math.max(0, now - (start || now));
        const gap = Math.min((elapsed / total) * 100, 100) - node.progress;
        node.auto_status = gap <= 10 ? 'on_track' : gap <= 25 ? 'at_risk' : 'behind';
      } else {
        node.auto_status = node.progress > 0 ? 'on_track' : 'not_started';
      }
    }

    if (node.children.length > 0 && node.auto_status !== 'cancelled' && node.auto_status !== 'completed') {
      const CHILD_SEVERITY = { completed: 0, on_track: 0, not_started: 1, at_risk: 1, behind: 2 };
      const nodeSev = CHILD_SEVERITY[node.auto_status] ?? 0;
      let worstSev = nodeSev;
      for (const child of node.children) {
        if (child.auto_status === 'cancelled') continue;
        const s = CHILD_SEVERITY[child.auto_status] ?? 0;
        if (s > worstSev) worstSev = s;
      }
      if (worstSev > nodeSev) node.auto_status = worstSev >= 2 ? 'behind' : 'at_risk';
    }
  }

  roots.forEach(computeProgress);
  return roots;
}

// GET / — personal goal tree for authenticated user
router.get('/', async (req, res, next) => {
  try {
    res.json(await computePersonalGoalTree(req.user.id));
  } catch (err) { next(err); }
});

// GET /assigned — strategic/project goals where this user is in goal_assignees
router.get('/assigned', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT g.*,
        CASE WHEN p.id IS NOT NULL
          THEN json_build_object('id', p.id, 'name', p.name, 'key', p.key)
          ELSE NULL END AS project,
        COUNT(DISTINCT tgl.ticket_id)::int AS linked_count,
        COUNT(DISTINCT tgl.ticket_id) FILTER (WHERE t.status = 'done')::int AS completed_count
      FROM project_goals g
      JOIN goal_assignees ga ON ga.goal_id = g.id
      LEFT JOIN projects p ON p.id = g.project_id
      LEFT JOIN ticket_goal_links tgl ON tgl.goal_id = g.id
      LEFT JOIN tickets t ON t.id = tgl.ticket_id
      WHERE ga.user_id = $1
        AND (g.user_id IS NULL OR g.user_id != $1)
      GROUP BY g.id, p.id, p.name, p.key
      ORDER BY g.position, g.created_at
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — create root personal goal
router.post('/', async (req, res, next) => {
  try {
    const {
      title, description = '', goal_type = 'objective', metric_type = 'manual',
      target_value, unit = '%', weight = 1.0, status = 'not_started',
      start_date = null, due_date = null, position = 0,
    } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await query(`
      INSERT INTO project_goals
        (user_id, parent_id, title, description, goal_type, metric_type,
         target_value, unit, weight, status, start_date, due_date, position)
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [req.user.id, title, description, goal_type, metric_type,
        target_value || null, unit, weight, status, start_date || null, due_date || null, position]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// POST /:goalId/sub-goals — create sub-goal under a personal goal
router.post('/:goalId/sub-goals', async (req, res, next) => {
  try {
    const { rows: [parent] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!parent) return res.status(404).json({ error: 'Goal not found' });

    const {
      title, description = '', goal_type = 'key_result', metric_type = 'completion',
      target_value, unit = '%', weight = 1.0, status = 'not_started',
      start_date = null, due_date = null, position = 0,
    } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await query(`
      INSERT INTO project_goals
        (user_id, parent_id, title, description, goal_type, metric_type,
         target_value, unit, weight, status, start_date, due_date, position)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [req.user.id, req.params.goalId, title, description, goal_type, metric_type,
        target_value || null, unit, weight, status, start_date || null, due_date || null, position]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /:goalId
router.patch('/:goalId', async (req, res, next) => {
  try {
    const { rows: [existing] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Goal not found' });

    const allowed = [
      'title', 'description', 'goal_type', 'metric_type', 'target_value',
      'current_value', 'unit', 'weight', 'start_date', 'due_date', 'position', 'status',
    ];
    const nullableEmpty = new Set(['start_date', 'due_date', 'target_value', 'current_value']);
    const updates = [];
    const values = [];
    let idx = 1;
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        const val = req.body[field];
        values.push(nullableEmpty.has(field) && val === '' ? null : val);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.goalId);
    const { rows } = await query(
      `UPDATE project_goals SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /:goalId/publish — assign to a project and make visible there
router.post('/:goalId/publish', async (req, res, next) => {
  try {
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const { rows: [existing] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Goal not found' });

    const { rows: [project] } = await query('SELECT id FROM projects WHERE id = $1', [project_id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { rows } = await query(
      'UPDATE project_goals SET project_id = $1, is_public = true WHERE id = $2 RETURNING *',
      [project_id, req.params.goalId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /:goalId/unpublish — make private again
router.post('/:goalId/unpublish', async (req, res, next) => {
  try {
    const { rows: [existing] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Goal not found' });

    const { rows } = await query(
      'UPDATE project_goals SET project_id = NULL, is_public = false WHERE id = $1 RETURNING *',
      [req.params.goalId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:goalId
router.delete('/:goalId', async (req, res, next) => {
  try {
    const { rows: [existing] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Goal not found' });
    await query('DELETE FROM project_goals WHERE id = $1', [req.params.goalId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /:goalId/tickets — linked tickets
router.get('/:goalId/tickets', async (req, res, next) => {
  try {
    const { rows: [goal] } = await query(
      'SELECT id FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const { rows } = await query(`
      SELECT t.id, t.number, t.title, t.status, t.type, t.priority, t.story_points,
        CONCAT(p.key, '-', t.number) AS ticket_key,
        p.name AS project_name, p.key AS project_key,
        CASE WHEN u.id IS NOT NULL
          THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color)
          ELSE NULL END AS assignee
      FROM ticket_goal_links tgl
      JOIN tickets t ON t.id = tgl.ticket_id
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE tgl.goal_id = $1
      ORDER BY t.created_at DESC
    `, [req.params.goalId]);

    res.json(rows);
  } catch (err) { next(err); }
});

// POST /:goalId/tickets — link a ticket
router.post('/:goalId/tickets', async (req, res, next) => {
  try {
    const { rows: [goal] } = await query(
      'SELECT id FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const { ticket_id } = req.body;
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id is required' });

    await query(
      'INSERT INTO ticket_goal_links (ticket_id, goal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [ticket_id, req.params.goalId]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /:goalId/tickets/:ticketId — unlink a ticket
router.delete('/:goalId/tickets/:ticketId', async (req, res, next) => {
  try {
    const { rows: [goal] } = await query(
      'SELECT id FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    await query(
      'DELETE FROM ticket_goal_links WHERE goal_id = $1 AND ticket_id = $2',
      [req.params.goalId, req.params.ticketId]
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /:goalId/ticket-candidates — search tickets across all projects
router.get('/:goalId/ticket-candidates', async (req, res, next) => {
  try {
    const { rows: [goal] } = await query(
      'SELECT id FROM project_goals WHERE id = $1 AND user_id = $2',
      [req.params.goalId, req.user.id]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const { q = '' } = req.query;
    const { rows } = await query(`
      SELECT t.id, t.title, t.type, t.status, t.priority, t.story_points,
        CONCAT(p.key, '-', t.number) AS ticket_key,
        p.name AS project_name, p.key AS project_key
      FROM tickets t
      JOIN projects p ON p.id = t.project_id
      WHERE t.status != 'done'
        AND t.id NOT IN (SELECT ticket_id FROM ticket_goal_links WHERE goal_id = $1)
        AND ($2 = ''
          OR t.title ILIKE '%' || $2 || '%'
          OR CONCAT(p.key, '-', t.number::text) ILIKE '%' || $2 || '%')
      ORDER BY t.created_at DESC
      LIMIT 25
    `, [req.params.goalId, q]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
