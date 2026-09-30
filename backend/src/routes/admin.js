const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const USER_FIELDS = 'id, name, email, role, color, avatar_url, is_active, created_at';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Definitions of all grantable system permissions
const SYSTEM_PERMISSION_DEFS = [
  { key: 'org_goals.write',  label: 'Create & edit strategic goals', category: 'Strategic Goals' },
  { key: 'org_goals.delete', label: 'Delete strategic goals',         category: 'Strategic Goals' },
  { key: 'org_goals.lock',   label: 'Lock / unlock strategic goals',  category: 'Strategic Goals' },
  { key: 'programs.write',   label: 'Create & edit programs, clients, and engagements', category: 'Programs' },
  { key: 'programs.delete',  label: 'Delete programs',                category: 'Programs' },
  { key: 'clients.write',    label: 'Create & edit client records',   category: 'Programs' },
];

router.use(requireAuth, requireAdmin);

// ── Users ──────────────────────────────────────────────────────────────────

router.get('/users', async (req, res, next) => {
  try {
    const { rows: users } = await query(`SELECT ${USER_FIELDS} FROM users ORDER BY name ASC`);

    // Attach system permissions to each user
    const { rows: allGrants } = await query(
      'SELECT user_id, permission FROM user_permissions ORDER BY user_id'
    );
    const grantsByUser = {};
    for (const g of allGrants) {
      (grantsByUser[g.user_id] ??= []).push(g.permission);
    }

    res.json(users.map(u => ({
      ...u,
      systemPermissions: u.role === 'admin' ? null : (grantsByUser[u.id] ?? []),
    })));
  } catch (err) { next(err); }
});

router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, role = 'member', color = '#6366F1' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_FIELDS}`,
      [name, email.toLowerCase().trim(), hash, role, color]
    );
    res.status(201).json({ ...rows[0], systemPermissions: [] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    next(err);
  }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const { name, email, role, color, is_active, password } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined)      { params.push(name);  updates.push(`name = $${params.length}`); }
    if (email !== undefined) {
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });
      params.push(email.toLowerCase().trim()); updates.push(`email = $${params.length}`);
    }
    if (role !== undefined)      { params.push(role);  updates.push(`role = $${params.length}`); }
    if (color !== undefined)     { params.push(color); updates.push(`color = $${params.length}`); }
    if (is_active !== undefined) { params.push(is_active); updates.push(`is_active = $${params.length}`); }
    if (password !== undefined) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const hash = await bcrypt.hash(password, 10);
      params.push(hash); updates.push(`password_hash = $${params.length}`);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    // Prevent demoting the last admin
    if (role && role !== 'admin' && req.params.id !== req.user.id) {
      const { rows } = await query(`SELECT id FROM users WHERE role = 'admin' AND id != $1`, [req.params.id]);
      if (rows.length === 0) {
        return res.status(400).json({ error: 'Cannot remove the last admin' });
      }
    }

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING ${USER_FIELDS}`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    const { rows: grants } = await query(
      'SELECT permission FROM user_permissions WHERE user_id = $1',
      [req.params.id]
    );
    res.json({
      ...rows[0],
      systemPermissions: rows[0].role === 'admin' ? null : grants.map(g => g.permission),
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── System Permissions ─────────────────────────────────────────────────────

// Returns permission definitions + which non-admin users hold each one
router.get('/system-permissions', async (req, res, next) => {
  try {
    const { rows: grants } = await query(`
      SELECT up.user_id, up.permission, u.name, u.email, u.color, u.avatar_url
      FROM user_permissions up
      JOIN users u ON u.id = up.user_id
      ORDER BY u.name
    `);

    const result = {};
    for (const def of SYSTEM_PERMISSION_DEFS) {
      result[def.key] = {
        ...def,
        users: grants
          .filter(g => g.permission === def.key)
          .map(g => ({ id: g.user_id, name: g.name, email: g.email, color: g.color, avatar_url: g.avatar_url })),
      };
    }
    res.json({ definitions: SYSTEM_PERMISSION_DEFS, grants: result });
  } catch (err) { next(err); }
});

// Returns the permission keys granted to a specific user
router.get('/users/:id/permissions', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT permission FROM user_permissions WHERE user_id = $1 ORDER BY permission',
      [req.params.id]
    );
    res.json(rows.map(r => r.permission));
  } catch (err) { next(err); }
});

// Full-replace a user's system permissions
router.put('/users/:id/permissions', async (req, res, next) => {
  try {
    const { permissions = [] } = req.body;
    const userId = req.params.id;

    const validKeys = SYSTEM_PERMISSION_DEFS.map(d => d.key);
    const invalid = permissions.filter(p => !validKeys.includes(p));
    if (invalid.length) {
      return res.status(400).json({ error: `Unknown permissions: ${invalid.join(', ')}` });
    }

    await query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);

    for (const perm of permissions) {
      await query(
        'INSERT INTO user_permissions (user_id, permission, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, perm, req.user.id]
      );
    }

    const { rows } = await query(
      'SELECT permission FROM user_permissions WHERE user_id = $1 ORDER BY permission',
      [userId]
    );
    res.json(rows.map(r => r.permission));
  } catch (err) { next(err); }
});

// ── Program settings (global, admin-only) ───────────────────────────────────

router.get('/program-settings', async (req, res, next) => {
  try {
    const { rows: [settings] } = await query('SELECT * FROM program_settings WHERE id = 1');
    res.json(settings);
  } catch (err) { next(err); }
});

router.put('/program-settings', async (req, res, next) => {
  try {
    const { ticket_project_mode, shared_project_id } = req.body;
    const updates = [];
    const params = [];

    if (ticket_project_mode !== undefined) {
      if (!['single', 'per_client', 'per_program'].includes(ticket_project_mode)) {
        return res.status(400).json({ error: 'Invalid ticket_project_mode' });
      }
      params.push(ticket_project_mode);
      updates.push(`ticket_project_mode = $${params.length}`);
    }

    // shared_project_id: pass an existing project's id to reuse it instead of auto-creating one,
    // or null to go back to auto-creating a new shared project on next use.
    if (shared_project_id !== undefined) {
      if (shared_project_id !== null) {
        const { rows: [project] } = await query('SELECT id FROM projects WHERE id = $1', [shared_project_id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });
      }
      params.push(shared_project_id);
      updates.push(`shared_project_id = $${params.length}`);
    }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    updates.push('updated_at = NOW()');

    const { rows: [settings] } = await query(
      `UPDATE program_settings SET ${updates.join(', ')} WHERE id = 1 RETURNING *`,
      params
    );
    res.json(settings);
  } catch (err) { next(err); }
});

// ── Feature flags (global, admin-only to write; read publicly via /api/feature-flags) ───────

router.put('/feature-flags', async (req, res, next) => {
  try {
    const { clients_enabled, programs_enabled } = req.body;
    const updates = [];
    const params = [];

    if (clients_enabled !== undefined) {
      params.push(!!clients_enabled);
      updates.push(`clients_enabled = $${params.length}`);
    }
    if (programs_enabled !== undefined) {
      params.push(!!programs_enabled);
      updates.push(`programs_enabled = $${params.length}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    updates.push('updated_at = NOW()');

    const { rows: [flags] } = await query(
      `UPDATE feature_flags SET ${updates.join(', ')} WHERE id = 1 RETURNING *`,
      params
    );
    res.json(flags);
  } catch (err) { next(err); }
});

module.exports = router;
