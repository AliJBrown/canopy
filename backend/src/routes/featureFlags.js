const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

// Any authenticated user can read these — the nav needs them to decide what to show. Writing
// them is admin-only, handled in admin.js (PUT /api/admin/feature-flags).
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows: [flags] } = await query('SELECT * FROM feature_flags WHERE id = 1');
    res.json(flags);
  } catch (err) { next(err); }
});

module.exports = router;
