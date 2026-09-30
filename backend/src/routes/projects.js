const router = require('express').Router();
const { query } = require('../db');
const {
  requireAuth,
  assertProjectPermission,
  seedProjectPermissions,
  DEFAULT_PROJECT_PERMISSIONS,
} = require('../middleware/auth');

router.use(requireAuth);

const DEFAULT_STATUSES = [
  ['backlog',     'Backlog',     '#94a3b8', 'todo',        0, true],
  ['todo',        'To Do',       '#60a5fa', 'todo',        1, false],
  ['in_progress', 'In Progress', '#f59e0b', 'in_progress', 2, false],
  ['in_review',   'In Review',   '#8b5cf6', 'in_progress', 3, false],
  ['blocked',     'Blocked',     '#ef4444', 'in_progress', 4, false],
  ['done',        'Done',        '#10b981', 'done',        5, false],
];

// Creates a project plus its standard side effects (owner membership, default statuses,
// default role permissions). `runQuery` defaults to the pooled `query` helper but can be
// passed a transaction client's `.query.bind(client)` for callers that need atomicity
// (see services/programProjects.js).
async function createProjectWithDefaults({ name, key, description = '', ownerUserId, runQuery = query }) {
  const upperKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  const { rows } = await runQuery(
    'INSERT INTO projects (name, key, description) VALUES ($1, $2, $3) RETURNING *',
    [name, upperKey, description]
  );
  const project = rows[0];

  await runQuery(
    'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
    [project.id, ownerUserId, 'owner']
  );

  for (const [slug, sName, color, category, position, is_default] of DEFAULT_STATUSES) {
    await runQuery(
      `INSERT INTO project_statuses (project_id, slug, name, color, category, position, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [project.id, slug, sName, color, category, position, is_default]
    );
  }

  await seedProjectPermissions(project.id, runQuery);

  return project;
}

router.get('/', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const { rows } = await query(`
      SELECT p.*,
        COUNT(DISTINCT t.id)::int AS ticket_count,
        CASE WHEN $2 THEN 'owner'
          ELSE COALESCE(
            (SELECT pm.role FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1),
            (SELECT pt.role FROM project_teams pt
             JOIN team_members tm ON tm.team_id = pt.team_id
             WHERE pt.project_id = p.id AND tm.user_id = $1
             ORDER BY CASE pt.role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'member' THEN 1 ELSE 0 END DESC
             LIMIT 1)
          )
        END AS my_role
      FROM projects p
      LEFT JOIN tickets t ON t.project_id = p.id
      WHERE $2
         OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1)
         OR EXISTS (
           SELECT 1 FROM project_teams pt
           JOIN team_members tm ON tm.team_id = pt.team_id
           WHERE pt.project_id = p.id AND tm.user_id = $1
         )
      GROUP BY p.id
      ORDER BY p.created_at ASC
    `, [req.user.id, isAdmin]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.id, 'tickets.view');
    if (!role) return;
    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ...rows[0], my_role: role });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, key, description = '' } = req.body;
    if (!name || !key) return res.status(400).json({ error: 'name and key are required' });

    const project = await createProjectWithDefaults({ name, key, description, ownerUserId: req.user.id });
    res.status(201).json({ ...project, my_role: 'owner' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Project key already exists' });
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.id, 'project.settings');
    if (!role) return;
    const { name, description } = req.body;
    const { rows } = await query(
      'UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
      [name, description, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.id, 'project.delete');
    if (!role) return;
    await query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── Role Permission Matrix ─────────────────────────────────────────────────

// GET /:id/role-permissions
// Returns { viewer: [...], member: [...], admin: [...], owner: [...] }
router.get('/:id/role-permissions', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.id, 'members.view');
    if (!role) return;

    const { rows } = await query(
      'SELECT role, permission FROM project_role_permissions WHERE project_id = $1 ORDER BY role, permission',
      [req.params.id]
    );

    const result = { viewer: [], member: [], admin: [], owner: [] };
    for (const row of rows) {
      if (result[row.role]) result[row.role].push(row.permission);
    }
    res.json(result);
  } catch (err) { next(err); }
});

// PUT /:id/role-permissions/:role  — full replace for one role
router.put('/:id/role-permissions/:role', async (req, res, next) => {
  try {
    const callerRole = await assertProjectPermission(req, res, req.params.id, 'project.settings');
    if (!callerRole) return;

    const { role } = req.params;
    const validRoles = ['viewer', 'member', 'admin', 'owner'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    // Only owners can modify the owner permission set
    if (role === 'owner' && callerRole !== 'owner') {
      return res.status(403).json({ error: 'Only project owners can modify owner permissions' });
    }

    const { permissions = [] } = req.body;

    await query(
      'DELETE FROM project_role_permissions WHERE project_id = $1 AND role = $2',
      [req.params.id, role]
    );

    for (const perm of permissions) {
      await query(
        'INSERT INTO project_role_permissions (project_id, role, permission) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [req.params.id, role, perm]
      );
    }

    const { rows } = await query(
      'SELECT permission FROM project_role_permissions WHERE project_id = $1 AND role = $2 ORDER BY permission',
      [req.params.id, role]
    );
    res.json(rows.map(r => r.permission));
  } catch (err) { next(err); }
});

// POST /:id/role-permissions/reset  — restore all roles to defaults
router.post('/:id/role-permissions/reset', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.id, 'project.settings');
    if (!role) return;

    await query('DELETE FROM project_role_permissions WHERE project_id = $1', [req.params.id]);
    await seedProjectPermissions(req.params.id);

    const { rows } = await query(
      'SELECT role, permission FROM project_role_permissions WHERE project_id = $1 ORDER BY role, permission',
      [req.params.id]
    );

    const result = { viewer: [], member: [], admin: [], owner: [] };
    for (const row of rows) {
      if (result[row.role]) result[row.role].push(row.permission);
    }
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.createProjectWithDefaults = createProjectWithDefaults;
