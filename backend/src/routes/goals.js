const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission, hasProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

// Contributing tickets = direct ticket links UNION epic sub-tickets (minus exclusions)
async function computeGoalTree(projectId) {
  const { rows: goals } = await query(`
    SELECT g.*,
      CASE WHEN u.id IS NOT NULL
        THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
        ELSE NULL END AS owner,
      COUNT(DISTINCT ct.ticket_id) AS linked_count,
      COUNT(DISTINCT ct.ticket_id) FILTER (WHERE ct.status = 'done') AS completed_count,
      COALESCE(SUM(DISTINCT CASE WHEN ct.status = 'done' THEN ct.story_points ELSE NULL END), 0) AS completed_points,
      COALESCE(SUM(DISTINCT ct.story_points), 0) AS total_points
    FROM project_goals g
    LEFT JOIN users u ON u.id = g.owner_id
    LEFT JOIN (
      SELECT tgl.goal_id, t.id AS ticket_id, t.status, t.story_points
      FROM ticket_goal_links tgl
      JOIN tickets t ON t.id = tgl.ticket_id

      UNION

      SELECT gel.goal_id, t.id AS ticket_id, t.status, t.story_points
      FROM goal_epic_links gel
      JOIN tickets t ON t.parent_id = gel.epic_id
      WHERE NOT EXISTS (
        SELECT 1 FROM goal_ticket_exclusions gte
        WHERE gte.goal_id = gel.goal_id AND gte.ticket_id = t.id
      )
    ) ct ON ct.goal_id = g.id
    WHERE g.project_id = $1 AND (g.user_id IS NULL OR g.is_public = true)
    GROUP BY g.id, u.id, u.name, u.color, u.avatar_url
    ORDER BY g.position, g.created_at
  `, [projectId]);

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

    // Determine this node's own auto_status
    if (node.progress >= 100 || node.status === 'completed') {
      node.auto_status = 'completed';
    } else if (node.status === 'cancelled') {
      node.auto_status = 'cancelled';
    } else if (node.status === 'at_risk' || node.status === 'behind') {
      // Explicit manual downgrade — respect it
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
        const expectedPct = Math.min((elapsed / total) * 100, 100);
        const gap = expectedPct - node.progress;
        node.auto_status = gap <= 10 ? 'on_track' : gap <= 25 ? 'at_risk' : 'behind';
      } else {
        node.auto_status = node.progress > 0 ? 'on_track' : 'not_started';
      }
    }

    // Bubble up worst child status so a behind/at-risk/not-started child is visible on the parent.
    // Severity: not_started and at_risk → parent at_risk; behind → parent behind.
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

// GET / — goal tree
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.view');
    if (!role) return;
    res.json(await computeGoalTree(projectId));
  } catch (err) { next(err); }
});

// POST / — create goal
router.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.write');
    if (!role) return;

    const {
      title, description = '', goal_type = 'objective', metric_type = 'completion',
      target_value, unit = '%', weight = 1.0, parent_id = null,
      owner_id = null, start_date = null, due_date = null, position = 0
    } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await query(`
      INSERT INTO project_goals
        (project_id, parent_id, title, description, goal_type, metric_type,
         target_value, unit, weight, owner_id, start_date, due_date, position)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [projectId, parent_id || null, title, description, goal_type, metric_type,
        target_value || null, unit, weight, owner_id || null, start_date || null, due_date || null, position]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /:goalId
router.patch('/:goalId', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.write');
    if (!role) return;

    const { rows: [existing] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND project_id = $2', [goalId, projectId]
    );
    if (!existing) return res.status(404).json({ error: 'Goal not found' });
    if (existing.user_id && existing.user_id !== req.user.id)
      return res.status(403).json({ error: 'Only the goal owner can edit their personal goal' });
    if (existing.is_locked && !(await hasProjectPermission(req.user.id, projectId, req.user.role, 'goals.lock')))
      return res.status(403).json({ error: 'This goal is locked — only a project admin can modify it' });

    const allowed = [
      'title', 'description', 'goal_type', 'metric_type', 'target_value',
      'current_value', 'unit', 'weight', 'parent_id', 'owner_id',
      'start_date', 'due_date', 'position', 'status'
    ];
    // Fields that are nullable in the DB — empty string must become NULL
    const nullableEmpty = new Set(['owner_id', 'parent_id', 'start_date', 'due_date', 'target_value', 'current_value']);
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

    values.push(goalId);
    const { rows } = await query(
      `UPDATE project_goals SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:goalId
router.delete('/:goalId', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;

    const { rows: [existing] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND project_id = $2', [goalId, projectId]
    );
    if (!existing) return res.status(404).json({ error: 'Goal not found' });

    // Personal goals: owner can delete their own; otherwise need goals.delete
    if (existing.user_id && existing.user_id === req.user.id) {
      // Author of personal goal — just verify they're a project member
      const role = await assertProjectPermission(req, res, projectId, 'goals.view');
      if (!role) return;
    } else {
      const role = await assertProjectPermission(req, res, projectId, 'goals.delete');
      if (!role) return;
    }

    if (existing.is_locked && !(await hasProjectPermission(req.user.id, projectId, req.user.role, 'goals.lock')))
      return res.status(403).json({ error: 'This goal is locked — only a project admin can delete it' });
    await query('DELETE FROM project_goals WHERE id = $1', [goalId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// PATCH /:goalId/lock — toggle lock (project admin+)
router.patch('/:goalId/lock', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.lock');
    if (!role) return;
    const { is_locked } = req.body;
    const { rows: [goal] } = await query(
      'UPDATE project_goals SET is_locked = $1 WHERE id = $2 AND project_id = $3 RETURNING *',
      [!!is_locked, goalId, projectId]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  } catch (err) { next(err); }
});

// ─── Epic links ───────────────────────────────────────────────────────────────

// GET /:goalId/epics — linked epics with sub-ticket detail + exclusion state
router.get('/:goalId/epics', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.view');
    if (!role) return;

    const { rows } = await query(`
      SELECT
        ep.id, ep.number, ep.title, ep.status, ep.type,
        CONCAT(p.key, '-', ep.number) AS ticket_key,
        COUNT(st.id) AS total_sub_tickets,
        COUNT(st.id) FILTER (
          WHERE st.status = 'done'
          AND NOT EXISTS (SELECT 1 FROM goal_ticket_exclusions gte WHERE gte.goal_id = $1 AND gte.ticket_id = st.id)
        ) AS done_sub_tickets,
        COUNT(st.id) FILTER (
          WHERE EXISTS (SELECT 1 FROM goal_ticket_exclusions gte WHERE gte.goal_id = $1 AND gte.ticket_id = st.id)
        ) AS excluded_count,
        COALESCE(json_agg(
          json_build_object(
            'id', st.id,
            'number', st.number,
            'title', st.title,
            'status', st.status,
            'type', st.type,
            'story_points', st.story_points,
            'ticket_key', CONCAT(p.key, '-', st.number),
            'is_excluded', EXISTS (
              SELECT 1 FROM goal_ticket_exclusions gte WHERE gte.goal_id = $1 AND gte.ticket_id = st.id
            ),
            'assignee', CASE WHEN u.id IS NOT NULL
              THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
              ELSE NULL END
          ) ORDER BY st.created_at
        ) FILTER (WHERE st.id IS NOT NULL), '[]') AS sub_tickets
      FROM goal_epic_links gel
      JOIN tickets ep ON ep.id = gel.epic_id
      JOIN projects p ON p.id = ep.project_id
      LEFT JOIN tickets st ON st.parent_id = ep.id
      LEFT JOIN users u ON u.id = st.assignee_id
      WHERE gel.goal_id = $1
      GROUP BY ep.id, ep.number, ep.title, ep.status, ep.type, p.key
      ORDER BY ep.created_at
    `, [goalId]);

    res.json(rows);
  } catch (err) { next(err); }
});

// POST /:goalId/epics — link an epic
router.post('/:goalId/epics', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.write');
    if (!role) return;

    const { epic_id } = req.body;
    if (!epic_id) return res.status(400).json({ error: 'epic_id is required' });

    const { rows: [goal] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND project_id = $2', [goalId, projectId]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const { rows: [epic] } = await query(
      `SELECT * FROM tickets WHERE id = $1 AND project_id = $2`, [epic_id, projectId]
    );
    if (!epic) return res.status(404).json({ error: 'Epic not found in this project' });

    await query(
      `INSERT INTO goal_epic_links (goal_id, epic_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [goalId, epic_id]
    );
    res.status(201).json({ goal_id: goalId, epic_id });
  } catch (err) { next(err); }
});

// DELETE /:goalId/epics/:epicId — unlink an epic
router.delete('/:goalId/epics/:epicId', async (req, res, next) => {
  try {
    const { projectId, goalId, epicId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.write');
    if (!role) return;

    await query(
      'DELETE FROM goal_epic_links WHERE goal_id = $1 AND epic_id = $2', [goalId, epicId]
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /:goalId/epic-candidates — epics in project not yet linked
router.get('/:goalId/epic-candidates', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.view');
    if (!role) return;

    const { search = '' } = req.query;
    const { rows } = await query(`
      SELECT t.id, t.number, t.title, t.status, t.type,
        CONCAT(p.key, '-', t.number) AS ticket_key,
        COUNT(children.id) AS sub_ticket_count
      FROM tickets t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN tickets children ON children.parent_id = t.id
      WHERE t.project_id = $1
        AND t.type = 'epic'
        AND t.id NOT IN (SELECT epic_id FROM goal_epic_links WHERE goal_id = $2)
        AND ($3 = '' OR t.title ILIKE '%' || $3 || '%' OR CONCAT(p.key, '-', t.number) ILIKE '%' || $3 || '%')
      GROUP BY t.id, t.number, t.title, t.status, t.type, p.key
      ORDER BY t.created_at DESC
      LIMIT 20
    `, [projectId, goalId, search]);

    res.json(rows);
  } catch (err) { next(err); }
});

// ─── Ticket exclusions ────────────────────────────────────────────────────────

// POST /:goalId/exclude/:ticketId — exclude a sub-ticket from this goal
router.post('/:goalId/exclude/:ticketId', async (req, res, next) => {
  try {
    const { projectId, goalId, ticketId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.write');
    if (!role) return;

    await query(
      `INSERT INTO goal_ticket_exclusions (goal_id, ticket_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [goalId, ticketId]
    );
    res.status(201).json({ goal_id: goalId, ticket_id: ticketId });
  } catch (err) { next(err); }
});

// DELETE /:goalId/exclude/:ticketId — re-include a sub-ticket
router.delete('/:goalId/exclude/:ticketId', async (req, res, next) => {
  try {
    const { projectId, goalId, ticketId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.write');
    if (!role) return;

    await query(
      'DELETE FROM goal_ticket_exclusions WHERE goal_id = $1 AND ticket_id = $2',
      [goalId, ticketId]
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Direct ticket links (kept for tickets not under epics) ──────────────────

router.get('/:goalId/tickets', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.view');
    if (!role) return;

    const { rows: [goal] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND project_id = $2', [goalId, projectId]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const { rows } = await query(`
      SELECT t.id, t.number, t.title, t.status, t.type, t.priority, t.story_points,
        CONCAT(p.key, '-', t.number) AS ticket_key,
        tgl.contribution_weight,
        CASE WHEN u.id IS NOT NULL
          THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
          ELSE NULL END AS assignee
      FROM ticket_goal_links tgl
      JOIN tickets t ON t.id = tgl.ticket_id
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE tgl.goal_id = $1
      ORDER BY t.created_at ASC
    `, [goalId]);

    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:goalId/tickets', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.write');
    if (!role) return;

    const { ticket_id, contribution_weight = 1.0 } = req.body;
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id is required' });

    const { rows: [goal] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND project_id = $2', [goalId, projectId]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const { rows: [ticket] } = await query(
      'SELECT * FROM tickets WHERE id = $1 AND project_id = $2', [ticket_id, projectId]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found in this project' });

    await query(`
      INSERT INTO ticket_goal_links (ticket_id, goal_id, contribution_weight)
      VALUES ($1, $2, $3)
      ON CONFLICT (ticket_id, goal_id) DO UPDATE SET contribution_weight = EXCLUDED.contribution_weight
    `, [ticket_id, goalId, contribution_weight]);

    res.status(201).json({ ticket_id, goal_id: goalId, contribution_weight });
  } catch (err) { next(err); }
});

router.delete('/:goalId/tickets/:ticketId', async (req, res, next) => {
  try {
    const { projectId, goalId, ticketId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.write');
    if (!role) return;

    const { rowCount } = await query(
      'DELETE FROM ticket_goal_links WHERE goal_id = $1 AND ticket_id = $2', [goalId, ticketId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Link not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/:goalId/ticket-candidates', async (req, res, next) => {
  try {
    const { projectId, goalId } = req.params;
    const role = await assertProjectPermission(req, res, projectId, 'goals.view');
    if (!role) return;

    const { search = '' } = req.query;
    const { rows } = await query(`
      SELECT t.id, t.number, t.title, t.status, t.type, t.priority,
        CONCAT(p.key, '-', t.number) AS ticket_key,
        CASE WHEN u.id IS NOT NULL
          THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
          ELSE NULL END AS assignee
      FROM tickets t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = $1
        AND t.type != 'epic'
        AND t.id NOT IN (SELECT ticket_id FROM ticket_goal_links WHERE goal_id = $2)
        AND t.id NOT IN (
          SELECT st.id FROM goal_epic_links gel
          JOIN tickets st ON st.parent_id = gel.epic_id
          WHERE gel.goal_id = $2
        )
        AND ($3 = '' OR t.title ILIKE '%' || $3 || '%' OR CONCAT(p.key, '-', t.number) ILIKE '%' || $3 || '%')
      ORDER BY t.created_at DESC
      LIMIT 20
    `, [projectId, goalId, search]);

    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
