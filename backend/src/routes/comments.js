const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

async function getTicketProject(ticketId) {
  const { rows } = await query('SELECT project_id FROM tickets WHERE id = $1', [ticketId]);
  return rows[0]?.project_id || null;
}

function extractMentions(body) {
  const re = /@\[([a-f0-9-]{36}):[^\]]+\]/g;
  const ids = []; let m;
  while ((m = re.exec(body)) !== null) ids.push(m[1]);
  return [...new Set(ids)];
}

router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.query;
    if (!ticketId) return res.status(400).json({ error: 'ticketId required' });

    const projectId = await getTicketProject(ticketId);
    if (!projectId) return res.status(404).json({ error: 'Ticket not found' });
    const role = await assertProjectPermission(req, res, projectId, 'tickets.view');
    if (!role) return;

    const { rows } = await query(`
      SELECT c.*,
        json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url) AS author,
        COALESCE(
          (SELECT json_agg(json_build_object('id', mu.id, 'name', mu.name))
           FROM comment_mentions cm JOIN users mu ON mu.id = cm.user_id
           WHERE cm.comment_id = c.id), '[]'
        ) AS mentions
      FROM comments c LEFT JOIN users u ON u.id = c.author_id
      WHERE c.ticket_id = $1 ORDER BY c.created_at ASC
    `, [ticketId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { ticket_id, body } = req.body;
    if (!ticket_id || !body) return res.status(400).json({ error: 'ticket_id and body required' });

    const projectId = await getTicketProject(ticket_id);
    if (!projectId) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, projectId, 'tickets.write');
    if (!role) return;

    const { rows } = await query(
      'INSERT INTO comments (ticket_id, author_id, body) VALUES ($1, $2, $3) RETURNING *',
      [ticket_id, req.user.id, body]
    );
    const commentId = rows[0].id;

    const mentionIds = extractMentions(body);
    for (const userId of mentionIds) {
      await query(
        'INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [commentId, userId]
      );
    }

    const full = await query(`
      SELECT c.*,
        json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url) AS author,
        COALESCE(
          (SELECT json_agg(json_build_object('id', mu.id, 'name', mu.name))
           FROM comment_mentions cm JOIN users mu ON mu.id = cm.user_id
           WHERE cm.comment_id = c.id), '[]'
        ) AS mentions
      FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = $1
    `, [commentId]);
    res.status(201).json(full.rows[0]);

    // Log activity + create mention notifications (non-blocking)
    setImmediate(async () => {
      await query(
        `INSERT INTO ticket_activity (ticket_id, actor_id, action, metadata)
         VALUES ($1, $2, 'commented', $3)`,
        [ticket_id, req.user.id, JSON.stringify({ comment_id: commentId, comment_preview: body.slice(0, 120) })]
      ).catch(() => {});

      // Fetch ticket metadata for notification payload
      const { rows: [ticketMeta] } = await query(
        'SELECT t.title, t.number, p.key AS project_key FROM tickets t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
        [ticket_id]
      ).catch(() => ({ rows: [] }));

      for (const userId of mentionIds) {
        if (userId === req.user.id) continue;
        await query(
          `INSERT INTO notifications (user_id, actor_id, type, ticket_id, comment_id, data)
           VALUES ($1, $2, 'mentioned', $3, $4, $5)`,
          [userId, req.user.id, ticket_id, commentId, JSON.stringify({
            ticket_title: ticketMeta?.title,
            project_key: ticketMeta?.project_key,
            ticket_number: ticketMeta?.number,
          })]
        ).catch(() => {});
      }
    });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { rows: [comment] } = await query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
    if (!comment) return res.status(404).json({ error: 'Not found' });
    if (comment.author_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Can only edit your own comments' });
    }
    const { body } = req.body;
    const { rows } = await query(
      'UPDATE comments SET body = $1 WHERE id = $2 RETURNING *',
      [body, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: [comment] } = await query(
      'SELECT c.*, t.project_id FROM comments c JOIN tickets t ON t.id = c.ticket_id WHERE c.id = $1',
      [req.params.id]
    );
    if (!comment) return res.status(404).json({ error: 'Not found' });

    if (comment.author_id !== req.user.id) {
      const role = await assertProjectPermission(req, res, comment.project_id, 'tickets.delete');
      if (!role) return;
    }

    await query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
