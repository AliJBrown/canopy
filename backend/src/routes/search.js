const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/search?q=&limit=
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ tickets: [], projects: [] });

    const limit = Math.min(parseInt(req.query.limit) || 10, 30);
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const likeQ = `%${q}%`;

    let tickets, projects;

    if (isAdmin) {
      [{ rows: tickets }, { rows: projects }] = await Promise.all([
        query(`
          SELECT
            t.id, t.number, t.title, t.type, t.status, t.priority,
            p.key AS project_key, p.name AS project_name,
            p.key || '-' || t.number::text AS ticket_key
          FROM tickets t
          JOIN projects p ON p.id = t.project_id
          WHERE (
            t.title ILIKE $1
            OR (p.key || '-' || t.number::text) ILIKE $1
            OR COALESCE(t.description, '') ILIKE $1
            OR (LENGTH($2) >= 3 AND to_tsvector('english', t.title || ' ' || COALESCE(t.description, '')) @@ plainto_tsquery('english', $2))
          )
          ORDER BY
            CASE WHEN t.title ILIKE $1 THEN 0 ELSE 1 END,
            CASE WHEN (p.key || '-' || t.number::text) ILIKE $1 THEN 0 ELSE 1 END,
            t.updated_at DESC
          LIMIT $3
        `, [likeQ, q, limit]),
        query(`
          SELECT id, name, key FROM projects p
          WHERE p.name ILIKE $1 OR p.key ILIKE $1
          LIMIT 5
        `, [likeQ]),
      ]);
    } else {
      [{ rows: tickets }, { rows: projects }] = await Promise.all([
        query(`
          SELECT
            t.id, t.number, t.title, t.type, t.status, t.priority,
            p.key AS project_key, p.name AS project_name,
            p.key || '-' || t.number::text AS ticket_key
          FROM tickets t
          JOIN projects p ON p.id = t.project_id
          WHERE (
            t.title ILIKE $2
            OR (p.key || '-' || t.number::text) ILIKE $2
            OR COALESCE(t.description, '') ILIKE $2
            OR (LENGTH($3) >= 3 AND to_tsvector('english', t.title || ' ' || COALESCE(t.description, '')) @@ plainto_tsquery('english', $3))
          )
          AND (
            EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1)
            OR EXISTS (
              SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.team_id
              WHERE pt.project_id = t.project_id AND tm.user_id = $1
            )
          )
          ORDER BY
            CASE WHEN t.title ILIKE $2 THEN 0 ELSE 1 END,
            CASE WHEN (p.key || '-' || t.number::text) ILIKE $2 THEN 0 ELSE 1 END,
            t.updated_at DESC
          LIMIT $4
        `, [userId, likeQ, q, limit]),
        query(`
          SELECT id, name, key FROM projects p
          WHERE (p.name ILIKE $2 OR p.key ILIKE $2)
            AND (
              EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1)
              OR EXISTS (
                SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.team_id
                WHERE pt.project_id = p.id AND tm.user_id = $1
              )
            )
          LIMIT 5
        `, [userId, likeQ]),
      ]);
    }

    res.json({ tickets, projects });
  } catch (err) { next(err); }
});

module.exports = router;
