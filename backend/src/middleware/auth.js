const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ROLE_LEVEL = { viewer: 0, member: 1, admin: 2, owner: 3 };

// Default permissions granted to each project role.
// These are seeded into project_role_permissions on project creation.
const DEFAULT_PROJECT_PERMISSIONS = {
  viewer: [
    'tickets.view',
    'goals.view',
    'sprints.view',
    'members.view',
    'time.view',
    'reports.view',
  ],
  member: [
    'tickets.view',
    'tickets.write',
    'goals.view',
    'goals.write',
    'sprints.view',
    'members.view',
    'time.view',
    'time.log',
    'reports.view',
  ],
  admin: [
    'tickets.view',
    'tickets.write',
    'tickets.delete',
    'goals.view',
    'goals.write',
    'goals.delete',
    'goals.lock',
    'sprints.view',
    'sprints.manage',
    'members.view',
    'members.manage',
    'time.view',
    'time.log',
    'reports.view',
    'labels.manage',
    'fields.manage',
    'statuses.manage',
    'project.settings',
  ],
  owner: [
    'tickets.view',
    'tickets.write',
    'tickets.delete',
    'goals.view',
    'goals.write',
    'goals.delete',
    'goals.lock',
    'sprints.view',
    'sprints.manage',
    'members.view',
    'members.manage',
    'time.view',
    'time.log',
    'reports.view',
    'labels.manage',
    'fields.manage',
    'statuses.manage',
    'project.settings',
    'project.delete',
  ],
};

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = auth.slice(7);

    // API token (long-lived, prefix tf_)
    if (token.startsWith('tf_')) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const { rows: [apiToken] } = await query(
        `SELECT at.*, u.id AS uid, u.name, u.email, u.role, u.color, u.avatar_url, u.is_active
         FROM api_tokens at JOIN users u ON u.id = at.user_id
         WHERE at.token_hash = $1 AND (at.expires_at IS NULL OR at.expires_at > NOW())`,
        [tokenHash]
      );
      if (!apiToken) return res.status(401).json({ error: 'Invalid or expired API token' });
      if (!apiToken.is_active) return res.status(401).json({ error: 'Account disabled' });
      query('UPDATE api_tokens SET last_used_at = NOW() WHERE token_hash = $1', [tokenHash]).catch(() => {});
      req.user = { id: apiToken.uid, name: apiToken.name, email: apiToken.email,
                   role: apiToken.role, color: apiToken.color, avatar_url: apiToken.avatar_url };
      req.apiTokenProjectId = apiToken.project_id;
      return next();
    }

    // JWT token
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await query(
      'SELECT id, name, email, role, color, avatar_url, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!rows[0]) return res.status(401).json({ error: 'User not found' });
    if (!rows[0].is_active) return res.status(401).json({ error: 'Account disabled' });
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function getEffectiveProjectRole(userId, projectId, userSystemRole) {
  if (userSystemRole === 'admin') return 'owner';

  const { rows: [direct] } = await query(
    'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId]
  );

  const { rows: teamRoles } = await query(`
    SELECT pt.role FROM project_teams pt
    JOIN team_members tm ON tm.team_id = pt.team_id
    WHERE pt.project_id = $1 AND tm.user_id = $2
  `, [projectId, userId]);

  let best = direct?.role || null;
  for (const { role } of teamRoles) {
    if (best === null || ROLE_LEVEL[role] > ROLE_LEVEL[best]) best = role;
  }
  return best;
}

// Permission check that sends 403 and returns null on failure.
// Returns the user's project role string on success.
async function assertProjectPermission(req, res, projectId, permission) {
  if (req.apiTokenProjectId && req.apiTokenProjectId !== projectId) {
    res.status(403).json({ error: 'This API token is scoped to a different project' });
    return null;
  }
  if (req.user.role === 'admin') return 'owner';

  const role = await getEffectiveProjectRole(req.user.id, projectId, req.user.role);
  if (!role) {
    res.status(403).json({ error: 'You are not a member of this project' });
    return null;
  }

  let { rows } = await query(
    'SELECT 1 FROM project_role_permissions WHERE project_id = $1 AND role = $2 AND permission = $3',
    [projectId, role, permission]
  );

  // If no hit, check whether the project has ANY permissions. If not, it's a project created
  // before the RBAC migration — seed defaults now and retry.
  if (rows.length === 0) {
    const { rows: anyExist } = await query(
      'SELECT 1 FROM project_role_permissions WHERE project_id = $1 LIMIT 1',
      [projectId]
    );
    if (anyExist.length === 0) {
      await seedProjectPermissions(projectId);
      ({ rows } = await query(
        'SELECT 1 FROM project_role_permissions WHERE project_id = $1 AND role = $2 AND permission = $3',
        [projectId, role, permission]
      ));
    }
  }

  if (rows.length === 0) {
    res.status(403).json({ error: 'Permission denied' });
    return null;
  }

  return role;
}

// Boolean check — does not send a response. Use for conditional logic inside handlers.
async function hasProjectPermission(userId, projectId, userSystemRole, permission) {
  if (userSystemRole === 'admin') return true;
  const role = await getEffectiveProjectRole(userId, projectId, userSystemRole);
  if (!role) return false;

  let { rows } = await query(
    'SELECT 1 FROM project_role_permissions WHERE project_id = $1 AND role = $2 AND permission = $3',
    [projectId, role, permission]
  );

  if (rows.length === 0) {
    const { rows: anyExist } = await query(
      'SELECT 1 FROM project_role_permissions WHERE project_id = $1 LIMIT 1',
      [projectId]
    );
    if (anyExist.length === 0) {
      await seedProjectPermissions(projectId);
      ({ rows } = await query(
        'SELECT 1 FROM project_role_permissions WHERE project_id = $1 AND role = $2 AND permission = $3',
        [projectId, role, permission]
      ));
    }
  }

  return rows.length > 0;
}

// Check a system-level permission (e.g. 'org_goals.write').
// System admin (role === 'admin') always passes.
async function checkSystemPermission(user, permission) {
  if (user.role === 'admin') return true;
  const { rows } = await query(
    'SELECT 1 FROM user_permissions WHERE user_id = $1 AND permission = $2',
    [user.id, permission]
  );
  return rows.length > 0;
}

// Returns an array of system permission keys granted to this user.
async function getUserSystemPermissions(userId) {
  const { rows } = await query(
    'SELECT permission FROM user_permissions WHERE user_id = $1 ORDER BY permission',
    [userId]
  );
  return rows.map(r => r.permission);
}

// Seeds default role permissions for a newly-created project.
// `runQuery` defaults to the pooled `query` helper but can be passed a transaction
// client's `.query.bind(client)` so this runs atomically with the project insert.
async function seedProjectPermissions(projectId, runQuery = query) {
  const entries = Object.entries(DEFAULT_PROJECT_PERMISSIONS)
    .flatMap(([role, perms]) => perms.map(perm => [role, perm]));

  if (entries.length === 0) return;

  const placeholders = entries.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
  const values = [projectId, ...entries.flatMap(([role, perm]) => [role, perm])];

  await runQuery(
    `INSERT INTO project_role_permissions (project_id, role, permission) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values
  );
}

// Legacy helper — kept for routes not yet migrated to assertProjectPermission.
async function assertRole(req, res, projectId, minRole) {
  const role = await getEffectiveProjectRole(req.user.id, projectId, req.user.role);
  if (!role || ROLE_LEVEL[role] < ROLE_LEVEL[minRole]) {
    res.status(403).json({ error: `Requires ${minRole} access on this project` });
    return null;
  }
  return role;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = {
  requireAuth,
  requireAdmin,
  getEffectiveProjectRole,
  assertRole,
  assertProjectPermission,
  hasProjectPermission,
  checkSystemPermission,
  getUserSystemPermissions,
  seedProjectPermissions,
  signToken,
  ROLE_LEVEL,
  DEFAULT_PROJECT_PERMISSIONS,
};
