const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, checkSystemPermission } = require('../middleware/auth');

router.use(requireAuth);

// Compute progress and auto_status for a single tree node.
// Children must already have their own progress computed before calling this.
// Priority: directly linked tickets > sub-goal rollup > manual target/current.
function computeNodeProgress(node) {
  const linked = parseInt(node.linked_count) || 0;
  const done   = parseInt(node.completed_count) || 0;

  if (node.status === 'completed') {
    node.progress = 100;
  } else if (linked > 0) {
    node.progress = (done / linked) * 100;
  } else if (node.children.length > 0) {
    const totalW = node.children.reduce((s, c) => s + parseFloat(c.weight || 1), 0);
    node.progress = totalW > 0
      ? node.children.reduce((s, c) => s + c.progress * parseFloat(c.weight || 1), 0) / totalW
      : 0;
  } else {
    const target = parseFloat(node.target_value) || 0;
    node.progress = target > 0
      ? Math.min((parseFloat(node.current_value || 0) / target) * 100, 100)
      : 0;
  }
  node.progress = Math.min(Math.max(Math.round(node.progress * 10) / 10, 0), 100);

  if (node.progress >= 100 || node.status === 'completed') {
    node.auto_status = 'completed';
  } else if (node.status === 'cancelled') {
    node.auto_status = 'cancelled';
  } else if (node.status !== 'not_started') {
    // User explicitly set on_track / at_risk / behind — respect it as-is
    node.auto_status = node.status;
  } else {
    // Default 'not_started' state — derive from progress and dates
    const now   = new Date();
    const start = node.start_date ? new Date(node.start_date) : null;
    const due   = node.due_date   ? new Date(node.due_date)   : null;
    if (start && now < start) {
      node.auto_status = 'not_started';
    } else if (due) {
      const total   = Math.max(due - (start || now), 1);
      const elapsed = Math.max(0, now - (start || now));
      const gap     = Math.min((elapsed / total) * 100, 100) - node.progress;
      node.auto_status = gap <= 10 ? 'on_track' : gap <= 25 ? 'at_risk' : 'behind';
    } else {
      // No dates — stay 'not_started' until progress has been made
      node.auto_status = node.progress > 0 ? 'on_track' : 'not_started';
    }
  }

  // Only bubble up genuinely alarming child statuses.
  // 'not_started' children are normal — they should not escalate the parent.
  if (node.children.length > 0 && node.auto_status !== 'cancelled' && node.auto_status !== 'completed') {
    for (const child of node.children) {
      if (child.auto_status === 'cancelled') continue;
      if (child.auto_status === 'behind' && node.auto_status !== 'behind') {
        node.auto_status = 'behind';
      } else if (child.auto_status === 'at_risk' && node.auto_status !== 'behind' && node.auto_status !== 'at_risk') {
        node.auto_status = 'at_risk';
      }
    }
  }
}

// Returns the set of private goal IDs the given user has direct access to.
async function getPrivateAccessSet(userId) {
  const { rows } = await query(`
    SELECT id FROM project_goals WHERE is_private = true AND owner_id = $1
    UNION
    SELECT goal_id AS id FROM goal_members WHERE user_id = $1
  `, [userId]);
  return new Set(rows.map(r => r.id));
}

// Filter a tree of nodes based on privacy. A private node is removed (with its
// entire subtree) unless the user has direct access or a sealed parent does.
function filterPrivate(nodes, accessSet, sealedByParent = false) {
  return nodes.filter(node => {
    if (node.is_private && !sealedByParent && !accessSet.has(node.id)) {
      return false; // blocked — remove node and its entire subtree
    }
    const sealed = sealedByParent || (node.is_private && accessSet.has(node.id));
    node.children = filterPrivate(node.children, accessSet, sealed);
    return true;
  });
}

// Recursive CTE — fetch all goals in the org tree regardless of project_id
// Roots are goals where project_id IS NULL AND parent_id IS NULL
async function computeOrgTree(userId, bypassPrivacy) {
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
    computeNodeProgress(node);
  }
  roots.forEach(computeProgress);

  if (bypassPrivacy) return roots;

  const accessSet = await getPrivateAccessSet(userId);
  return filterPrivate(roots, accessSet);
}

// GET / — full org goal tree
router.get('/', async (req, res, next) => {
  try {
    const bypass = req.user.role === 'admin' || await checkSystemPermission(req.user, 'org_goals.write');
    res.json(await computeOrgTree(req.user.id, bypass));
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

// Fetch the full subtree rooted at goalId and compute progress recursively.
// Returns the root node with .children[] fully computed, or null if not found.
async function computeGoalSubtree(goalId) {
  const { rows: flat } = await query(`
    WITH RECURSIVE sub AS (
      SELECT g.id FROM project_goals g WHERE g.id = $1
      UNION ALL
      SELECT g.id FROM project_goals g JOIN sub s ON g.parent_id = s.id
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
    FROM sub
    JOIN project_goals g ON g.id = sub.id
    LEFT JOIN users u ON u.id = g.owner_id
    LEFT JOIN projects p ON p.id = g.project_id
    LEFT JOIN ticket_goal_links tgl ON tgl.goal_id = g.id
    LEFT JOIN tickets tk ON tk.id = tgl.ticket_id
    GROUP BY g.id, u.id, u.name, u.color, u.avatar_url, p.id, p.name, p.key
    ORDER BY g.position, g.created_at
  `, [goalId]);

  if (flat.length === 0) return null;

  const byId = {};
  flat.forEach(g => { byId[g.id] = { ...g, children: [] }; });
  flat.forEach(g => {
    if (g.parent_id && byId[g.parent_id]) byId[g.parent_id].children.push(byId[g.id]);
  });

  function recurse(node) {
    node.children.forEach(recurse);
    computeNodeProgress(node);
  }
  recurse(byId[goalId]);

  return byId[goalId];
}

// GET /:id — single goal with direct children, linked tickets, and ancestor breadcrumb chain
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

    // Privacy check: admins and org_goals.write users bypass; others need access to
    // every private node in the ancestor chain (including this goal itself).
    const bypass = req.user.role === 'admin' || await checkSystemPermission(req.user, 'org_goals.write');
    if (!bypass) {
      const accessSet = await getPrivateAccessSet(req.user.id);
      const { rows: blockedAncestors } = await query(`
        WITH RECURSIVE chain AS (
          SELECT id, parent_id, is_private
          FROM project_goals WHERE id = $1
          UNION ALL
          SELECT g.id, g.parent_id, g.is_private
          FROM project_goals g JOIN chain c ON g.id = c.parent_id
        )
        SELECT id FROM chain WHERE is_private = true
      `, [req.params.id]);
      const blocked = blockedAncestors.some(r => !accessSet.has(r.id));
      if (blocked) return res.status(403).json({ error: 'This goal is private' });
    }

    // Ancestor chain for breadcrumb (root → direct parent order)
    const { rows: ancestors } = await query(`
      WITH RECURSIVE anc AS (
        SELECT id, parent_id, title, 0 AS depth
        FROM project_goals
        WHERE id = (SELECT parent_id FROM project_goals WHERE id = $1)
        UNION ALL
        SELECT g.id, g.parent_id, g.title, a.depth + 1
        FROM project_goals g
        JOIN anc a ON g.id = a.parent_id
        WHERE a.parent_id IS NOT NULL
      )
      SELECT id, title FROM anc ORDER BY depth DESC
    `, [req.params.id]);

    // Fetch the full subtree to compute progress recursively (tickets > sub-goals > target)
    const subtree = await computeGoalSubtree(req.params.id);
    const children = subtree ? subtree.children : [];

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

    res.json({
      ...goal,
      // Merge computed values from the recursive subtree calculation
      progress:        subtree?.progress        ?? 0,
      auto_status:     subtree?.auto_status     ?? null,
      linked_count:    subtree?.linked_count    ?? 0,
      completed_count: subtree?.completed_count ?? 0,
      ancestors,
      children,
      tickets,
    });
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
                     'start_date','due_date','parent_id','position','project_id','is_private'];
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

// GET /:id/members — list users with explicit access to a private goal
router.get('/:id/members', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT u.id, u.name, u.email, u.color, u.avatar_url
      FROM goal_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.goal_id = $1
      ORDER BY u.name
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /:id/members — grant a user access to a private goal
router.post('/:id/members', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.write')))
      return res.status(403).json({ error: 'You do not have permission to modify company goals' });
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    await query(
      'INSERT INTO goal_members (goal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, user_id]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /:id/members/:userId — remove a user's access
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'org_goals.write')))
      return res.status(403).json({ error: 'You do not have permission to modify company goals' });
    await query(
      'DELETE FROM goal_members WHERE goal_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.status(204).send();
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
