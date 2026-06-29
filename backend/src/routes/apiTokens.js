const router = require('express').Router();
const crypto = require('crypto');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// GET / — list my tokens (never return the token itself)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT id, name, token_prefix, project_id, last_used_at, expires_at, created_at,
        p.name AS project_name, p.key AS project_key
      FROM api_tokens at
      LEFT JOIN projects p ON p.id = at.project_id
      WHERE at.user_id = $1
      ORDER BY at.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — create a new token (returns full token ONCE)
router.post('/', async (req, res, next) => {
  try {
    const { name, project_id, expires_in_days } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const rawToken = 'tf_' + crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const prefix = rawToken.slice(0, 12);

    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { rows: [token] } = await query(`
      INSERT INTO api_tokens (user_id, project_id, name, token_hash, token_prefix, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, token_prefix, project_id, expires_at, created_at
    `, [req.user.id, project_id || null, name, tokenHash, prefix, expiresAt]);

    // Return the full token this one time
    res.status(201).json({ ...token, token: rawToken });
  } catch (err) { next(err); }
});

// DELETE /:id — revoke token
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM api_tokens WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
