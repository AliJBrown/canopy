const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission, ROLE_LEVEL } = require('../middleware/auth');

const USER_FIELDS = 'u.id, u.name, u.email, u.color, u.avatar_url, u.role AS system_role';

router.use(requireAuth);

// --- Individual members ---

router.get('/', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'members.view');
    if (!role) return;
    const { rows } = await query(`
      SELECT pm.role, pm.created_at, pm.invited_by, ${USER_FIELDS}
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1
      ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, u.name ASC
    `, [req.params.projectId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const callerRole = await assertProjectPermission(req, res, req.params.projectId, 'members.manage');
    if (!callerRole) return;

    const { user_id, role = 'member' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    // You can only assign roles strictly below your own level
    if (ROLE_LEVEL[role] >= ROLE_LEVEL[callerRole]) {
      return res.status(403).json({ error: 'You cannot assign a role equal to or higher than your own' });
    }

    const { rows } = await query(`
      INSERT INTO project_members (project_id, user_id, role, invited_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
      RETURNING *
    `, [req.params.projectId, user_id, role, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:userId', async (req, res, next) => {
  try {
    const callerRole = await assertProjectPermission(req, res, req.params.projectId, 'members.manage');
    if (!callerRole) return;

    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role required' });

    const { rows: [target] } = await query(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [req.params.projectId, req.params.userId]
    );
    if (!target) return res.status(404).json({ error: 'Member not found' });

    // Users with system-level permissions are protected — only a system admin can change their project role
    if (req.user.role !== 'admin') {
      const { rows: sysPerms } = await query(
        'SELECT 1 FROM user_permissions WHERE user_id = $1 LIMIT 1',
        [req.params.userId]
      );
      if (sysPerms.length > 0) {
        return res.status(403).json({ error: 'Users with system-level permissions can only have their project role changed by a system admin' });
      }
    }

    // You can only manage members strictly below your own level
    if (ROLE_LEVEL[target.role] >= ROLE_LEVEL[callerRole]) {
      return res.status(403).json({ error: 'You can only change the role of members below your own level' });
    }
    // You can only assign roles strictly below your own level
    if (ROLE_LEVEL[role] >= ROLE_LEVEL[callerRole]) {
      return res.status(403).json({ error: 'You cannot assign a role equal to or higher than your own' });
    }

    const { rows } = await query(
      'UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3 RETURNING *',
      [role, req.params.projectId, req.params.userId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:userId', async (req, res, next) => {
  try {
    const callerRole = await assertProjectPermission(req, res, req.params.projectId, 'members.manage');
    if (!callerRole) return;

    const { rows: [target] } = await query(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [req.params.projectId, req.params.userId]
    );
    if (!target) return res.status(404).json({ error: 'Member not found' });

    // Users with system-level permissions are protected — only a system admin can remove them from a project
    if (req.user.role !== 'admin') {
      const { rows: sysPerms } = await query(
        'SELECT 1 FROM user_permissions WHERE user_id = $1 LIMIT 1',
        [req.params.userId]
      );
      if (sysPerms.length > 0) {
        return res.status(403).json({ error: 'Users with system-level permissions can only be removed by a system admin' });
      }
    }

    // You can only remove members strictly below your own level
    if (ROLE_LEVEL[target.role] >= ROLE_LEVEL[callerRole]) {
      return res.status(403).json({ error: 'You can only remove members below your own level' });
    }

    await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
      [req.params.projectId, req.params.userId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// --- Project teams ---

router.get('/teams', async (req, res, next) => {
  try {
    const role = await assertProjectPermission(req, res, req.params.projectId, 'members.view');
    if (!role) return;
    const { rows } = await query(`
      SELECT pt.role, pt.created_at, t.id, t.name, t.description,
        (SELECT COUNT(*)::int FROM team_members WHERE team_id = t.id) AS member_count
      FROM project_teams pt
      JOIN teams t ON t.id = pt.team_id
      WHERE pt.project_id = $1
      ORDER BY t.name ASC
    `, [req.params.projectId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/teams', async (req, res, next) => {
  try {
    const myRole = await assertProjectPermission(req, res, req.params.projectId, 'members.manage');
    if (!myRole) return;
    const { team_id, role = 'member' } = req.body;
    if (!team_id) return res.status(400).json({ error: 'team_id required' });
    const { rows } = await query(`
      INSERT INTO project_teams (project_id, team_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (project_id, team_id) DO UPDATE SET role = $3
      RETURNING *
    `, [req.params.projectId, team_id, role]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/teams/:teamId', async (req, res, next) => {
  try {
    const myRole = await assertProjectPermission(req, res, req.params.projectId, 'members.manage');
    if (!myRole) return;
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role required' });
    const { rows } = await query(
      'UPDATE project_teams SET role = $1 WHERE project_id = $2 AND team_id = $3 RETURNING *',
      [role, req.params.projectId, req.params.teamId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Team not assigned to project' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/teams/:teamId', async (req, res, next) => {
  try {
    const myRole = await assertProjectPermission(req, res, req.params.projectId, 'members.manage');
    if (!myRole) return;
    await query('DELETE FROM project_teams WHERE project_id = $1 AND team_id = $2',
      [req.params.projectId, req.params.teamId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
