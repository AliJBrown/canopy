const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

// Public user listing for assignee dropdowns — auth required but no admin needed
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, email, color, avatar_url, role, is_active FROM users WHERE is_active = true ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
