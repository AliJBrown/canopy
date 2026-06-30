const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

const DEP_STUB = `
  SELECT
    t.id, t.number, t.title, t.status, t.type, t.priority,
    p.key AS project_key,
    p.key || '-' || t.number AS ticket_key,
    td.id AS dep_id
  FROM tickets t
  JOIN projects p ON p.id = t.project_id
`;

// GET /api/tickets/:ticketId/dependencies
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows: [ticket] } = await query('SELECT project_id FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'tickets.view');
    if (!role) return;

    const [blocking, blocked_by, relates_to] = await Promise.all([
      // Tickets this ticket blocks (blocker_id = ticketId, type = blocks)
      query(`${DEP_STUB} JOIN ticket_dependencies td ON td.blocked_id = t.id WHERE td.blocker_id = $1 AND td.type = 'blocks'`, [ticketId]),
      // Tickets blocking this one (blocked_id = ticketId, type = blocks)
      query(`${DEP_STUB} JOIN ticket_dependencies td ON td.blocker_id = t.id WHERE td.blocked_id = $1 AND td.type = 'blocks'`, [ticketId]),
      // Tickets related (either direction, type = relates_to or duplicates)
      query(`
        ${DEP_STUB}
        JOIN ticket_dependencies td ON (td.blocker_id = t.id OR td.blocked_id = t.id)
        WHERE (td.blocker_id = $1 OR td.blocked_id = $1)
          AND td.type IN ('relates_to', 'duplicates')
          AND t.id != $1
      `, [ticketId]),
    ]);

    res.json({ blocking: blocking.rows, blocked_by: blocked_by.rows, relates_to: relates_to.rows });
  } catch (err) { next(err); }
});

// POST /api/tickets/:ticketId/dependencies
router.post('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { dependency_id, type = 'blocks' } = req.body;

    if (!dependency_id) return res.status(400).json({ error: 'dependency_id required' });
    if (dependency_id === ticketId) return res.status(400).json({ error: 'A ticket cannot depend on itself' });

    const { rows: [ticket] } = await query('SELECT project_id FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'tickets.write');
    if (!role) return;

    // For 'blocks': ticketId is the blocker, dependency_id is blocked
    // For 'relates_to'/'duplicates': store canonically with lower UUID first to avoid dups
    let blocker_id, blocked_id;
    if (type === 'blocks') {
      blocker_id = ticketId;
      blocked_id = dependency_id;
    } else {
      [blocker_id, blocked_id] = [ticketId, dependency_id].sort();
    }

    const { rows } = await query(
      `INSERT INTO ticket_dependencies (blocker_id, blocked_id, type, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (blocker_id, blocked_id) DO UPDATE SET type = EXCLUDED.type
       RETURNING *`,
      [blocker_id, blocked_id, type, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/tickets/:ticketId/dependencies/:depId
router.delete('/:depId', async (req, res, next) => {
  try {
    const { ticketId, depId } = req.params;
    const { rows: [ticket] } = await query('SELECT project_id FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'tickets.write');
    if (!role) return;

    await query(
      'DELETE FROM ticket_dependencies WHERE id = $1 AND (blocker_id = $2 OR blocked_id = $2)',
      [depId, ticketId]
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
