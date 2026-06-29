const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, checkSystemPermission } = require('../middleware/auth');

router.use(requireAuth);

// Recursive CTE — fetch all goals in the org tree regardless of project_id
// Roots are goals where project_id IS NULL AND parent_id IS NULL
async function computeOrgTree() {
  const { rows: goals } = await query(`
    WITH RECURSIVE tree AS (
      SELECT g.id FROM project_goals g
      WHERE g.project_id IS NULL AND g.parent_id IS NULL AND g.user_id IS NULL
      UNION ALL
      SELECT g.id FROM project_goals g
      JOIN tree t ON t.id = g.parent_id
    )
    SELECT
      g.*,
      CASE WHEN u.id IS NOT NULL
        THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
        ELSE NULL END AS owner,
      CASE WHEN p.id IS NOT NULL
        THEN json_build_object('id', p.id, 'name', p.name, 'key', p.key)
        ELSE NULL END AS project,
      COUNT(DISTINCT tgl.ticket_id)::int AS linked_count,
      COUNT(DISTINCT tgl.ticket_id) FILTER (WHERE tk.status = 'done')::int AS completed_count
    FROM tree
    JOIN project_goals g ON g.id = tree.id
    LEFT JOIN users u ON u.id = g.owner_id
    LEFT JOIN projects p ON p.id = g.project_id
    LEFT JOIN ticket_goal_links tgl ON tgl.goal_id = g.id
    LEFT JOIN tickets tk ON tk.id = tgl.ticket_id
    GROUP BY g.id, u.id, u.name, u.color, u.avatar_url, p.id, p.name, p.key
    ORDER BY g.position, g.created_at
  `);

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
      if (node.metric_type === 'subgoals' || linked > 0) {
        node.progress = linked > 0 ? (done / linked) * 100 : 0;
      } else if (target > 0) {
        node.progress = Math.min((parseFloat(node.current_value || 0) / target) * 100, 100);
      } else {
        node.progress = 0;
      }
    }
    node.progress = Math.min(Math.max(Math.round(node.progress * 10) / 10, 0), 100);

    if (node.progress >= 100 || node.status === 'completed') {
      node.auto_status = 'completed';
    } else if (node.status === 'cancelled') {
      node.auto_status = 'cancelled';
    } else if (node.status === 'at_risk' || node.status === 'behind') {
      node.auto_status = node.status;
    } else {
      const now = new Date();
      const start = node.start_date ? new Date(node.start_date) : null;
      const due   = node.due_date   ? new Date(node.due_date)   : null;
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

    // Bubble worst child status up so problems are always visible on the parent
    if (node.children.length > 0 && node.auto_status !== 'cancelled' && node.auto_status !== 'completed') {
      const CHILD_SEVERITY = { completed: 0, on_track: 0, not_started: 1, at_risk: 1, behind: 2 };
      const nodeSev = CHILD_SEVERITY[node.auto_status] ?? 0;
      let worstSev = nodeSev;
      for (const child of node.children) {
        if (child.auto_status === 'cancelled') continue;
        const s = CHILD_SEVERITY[child.auto_status] ?? 0;
        if (s > worstSev) worstSev = s;
      }
      if (worstSev > nodeSev) {
        node.auto_status = worstSev >= 2 ? 'behind' : 'at_risk';
      }
    }
  }

  roots.forEach(computeProgress);
  return roots;
}

// GET / — full org goal tree
router.get('/', async (req, res, next) => {
  try {
    res.json(await computeOrgTree());
  } catch (err) { next(err); }
});

// POST / — create a root org goal
router.post('/', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.write')))
      return res.status(403).json({ error: 'You do not have permission to create company goals' });
    const {
      title, description = '', goal_type = 'objective', metric_type = 'manual',
      target_value, unit = '%', weight = 1.0, status = 'not_started',
      owner_id, start_date, due_date, position = 0,
    } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const { rows } = await query(`
      INSERT INTO project_goals
        (project_id, parent_id, title, description, goal_type, metric_type,
         target_value, unit, weight, status, owner_id, start_date, due_date, position)
      VALUES (NULL, NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [title, description, goal_type, metric_type, target_value || null,
        unit, weight, status, owner_id || null, start_date || null, due_date || null, position]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /:id — single goal with direct children and linked tickets
router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [goal] } = await query(`
      SELECT g.*,
        CASE WHEN u.id IS NOT NULL
          THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
          ELSE NULL END AS owner,
        CASE WHEN p.id IS NOT NULL
          THEN json_build_object('id', p.id, 'name', p.name, 'key', p.key)
          ELSE NULL END AS project
      FROM project_goals g
      LEFT JOIN users u ON u.id = g.owner_id
      LEFT JOIN projects p ON p.id = g.project_id
      WHERE g.id = $1
    `, [req.params.id]);
    if (!goal) return res.status(404).json({ error: 'Not found' });

    // Direct children (with project info)
    const { rows: children } = await query(`
      SELECT g.*,
        CASE WHEN u.id IS NOT NULL
          THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
          ELSE NULL END AS owner,
        CASE WHEN p.id IS NOT NULL
          THEN json_build_object('id', p.id, 'name', p.name, 'key', p.key)
          ELSE NULL END AS project,
        COUNT(DISTINCT tgl.ticket_id)::int AS linked_count,
        COUNT(DISTINCT tgl.ticket_id) FILTER (WHERE tk.status = 'done')::int AS completed_count
      FROM project_goals g
      LEFT JOIN users u ON u.id = g.owner_id
      LEFT JOIN projects p ON p.id = g.project_id
      LEFT JOIN ticket_goal_links tgl ON tgl.goal_id = g.id
      LEFT JOIN tickets tk ON tk.id = tgl.ticket_id
      WHERE g.parent_id = $1
      GROUP BY g.id, u.id, u.name, u.color, u.avatar_url, p.id, p.name, p.key
      ORDER BY g.position, g.created_at
    `, [req.params.id]);

    // Linked tickets
    const { rows: tickets } = await query(`
      SELECT t.id, t.title, t.type, t.status, t.priority, t.story_points,
        CONCAT(p.key, '-', t.number) AS ticket_key,
        p.name AS project_name, p.key AS project_key,
        json_build_object('id', u.id, 'name', u.name, 'color', u.color) AS assignee
      FROM ticket_goal_links tgl
      JOIN tickets t ON t.id = tgl.ticket_id
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE tgl.goal_id = $1
      ORDER BY t.created_at DESC
    `, [req.params.id]);

    res.json({ ...goal, children, tickets });
  } catch (err) { next(err); }
});

// POST /:id/sub-goals — create sub-goal (optionally assigned to a project)
router.post('/:id/sub-goals', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.write')))
      return res.status(403).json({ error: 'You do not have permission to create company goals' });
    const {
      title, description = '', goal_type = 'key_result', metric_type = 'completion',
      target_value, unit = '%', weight = 1.0, status = 'not_started',
      owner_id, start_date, due_date, project_id, position = 0,
    } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const { rows } = await query(`
      INSERT INTO project_goals
        (project_id, parent_id, title, description, goal_type, metric_type,
         target_value, unit, weight, status, owner_id, start_date, due_date, position)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [project_id || null, req.params.id, title, description, goal_type, metric_type,
        target_value || null, unit, weight, status, owner_id || null,
        start_date || null, due_date || null, position]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /:id/ticket-candidates?q=search — search tickets across all projects
router.get('/:id/ticket-candidates', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.write')))
      return res.status(403).json({ error: 'You do not have permission to modify company goals' });
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
    `, [req.params.id, q]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /:id/tickets — link a ticket to this goal
router.post('/:id/tickets', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.write')))
      return res.status(403).json({ error: 'You do not have permission to modify company goals' });
    const { ticket_id } = req.body;
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });
    await query(
      'INSERT INTO ticket_goal_links (ticket_id, goal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [ticket_id, req.params.id]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /:id/tickets/:ticketId — unlink
router.delete('/:id/tickets/:ticketId', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.write')))
      return res.status(403).json({ error: 'You do not have permission to modify company goals' });
    await query(
      'DELETE FROM ticket_goal_links WHERE goal_id = $1 AND ticket_id = $2',
      [req.params.id, req.params.ticketId]
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

// PATCH /:id — update any goal in the org tree
router.patch('/:id', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.write')))
      return res.status(403).json({ error: 'You do not have permission to edit company goals' });

    const { rows: [existing] } = await query('SELECT * FROM project_goals WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.is_locked && !(await checkSystemPermission(req.user, 'org_goals.lock')))
      return res.status(403).json({ error: 'This goal is locked — only a system admin can modify it' });

    const allowed = ['title','description','goal_type','metric_type','target_value',
                     'current_value','unit','weight','status','owner_id',
                     'start_date','due_date','parent_id','position','project_id'];
    const nullableEmpty = new Set(['owner_id', 'parent_id', 'project_id', 'start_date', 'due_date', 'target_value', 'current_value']);
    const updates = [];
    const params = [];
    allowed.forEach(f => {
      if (f in req.body) {
        const val = req.body[f];
        params.push(nullableEmpty.has(f) && (val === '' || val == null) ? null : val);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE project_goals SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /:id/lock — toggle lock on an org goal
router.patch('/:id/lock', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.lock')))
      return res.status(403).json({ error: 'You do not have permission to lock company goals' });
    const { is_locked } = req.body;
    const { rows: [goal] } = await query(
      'UPDATE project_goals SET is_locked = $1 WHERE id = $2 RETURNING *',
      [!!is_locked, req.params.id]
    );
    if (!goal) return res.status(404).json({ error: 'Not found' });
    res.json(goal);
  } catch (err) { next(err); }
});

// DELETE /:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.delete')))
      return res.status(403).json({ error: 'You do not have permission to delete company goals' });

    const { rows: [existing] } = await query('SELECT * FROM project_goals WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.is_locked && !(await checkSystemPermission(req.user, 'org_goals.lock')))
      return res.status(403).json({ error: 'This goal is locked — only a system admin can delete it' });

    await query('DELETE FROM project_goals WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
