const router = require('express').Router({ mergeParams: true });
const { query } = require('../db');
const { requireAuth, assertProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/tickets/:ticketId/goals — project goals this ticket is directly linked to
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows: [ticket] } = await query('SELECT project_id FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'goals.view');
    if (!role) return;

    const { rows } = await query(`
      SELECT g.id, g.title, g.goal_type, g.status, tgl.contribution_weight
      FROM ticket_goal_links tgl
      JOIN project_goals g ON g.id = tgl.goal_id
      WHERE tgl.ticket_id = $1
      ORDER BY g.created_at ASC
    `, [ticketId]);

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/tickets/:ticketId/goals/candidates — project goals not yet linked to this ticket
router.get('/candidates', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows: [ticket] } = await query('SELECT project_id, type FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'goals.view');
    if (!role) return;

    if (ticket.type === 'epic') {
      // Epics contribute to goals via the epic-link mechanism, not direct ticket links
      return res.json([]);
    }

    const { search = '' } = req.query;
    const { rows } = await query(`
      SELECT g.id, g.title, g.goal_type, g.status
      FROM project_goals g
      WHERE g.project_id = $1
        AND g.id NOT IN (SELECT goal_id FROM ticket_goal_links WHERE ticket_id = $2)
        AND ($3 = '' OR g.title ILIKE '%' || $3 || '%')
      ORDER BY g.created_at DESC
      LIMIT 20
    `, [ticket.project_id, ticketId, search]);

    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/tickets/:ticketId/goals — link this ticket to a goal
router.post('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { goal_id, contribution_weight = 1.0 } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required' });

    const { rows: [ticket] } = await query('SELECT project_id, type FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'goals.write');
    if (!role) return;

    if (ticket.type === 'epic')
      return res.status(400).json({ error: 'Epics link to goals from the goal\'s Epics section' });

    const { rows: [goal] } = await query(
      'SELECT * FROM project_goals WHERE id = $1 AND project_id = $2', [goal_id, ticket.project_id]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found in this project' });

    await query(`
      INSERT INTO ticket_goal_links (ticket_id, goal_id, contribution_weight)
      VALUES ($1, $2, $3)
      ON CONFLICT (ticket_id, goal_id) DO UPDATE SET contribution_weight = EXCLUDED.contribution_weight
    `, [ticketId, goal_id, contribution_weight]);

    res.status(201).json({ ticket_id: ticketId, goal_id, contribution_weight });
  } catch (err) { next(err); }
});

// DELETE /api/tickets/:ticketId/goals/:goalId — unlink
router.delete('/:goalId', async (req, res, next) => {
  try {
    const { ticketId, goalId } = req.params;
    const { rows: [ticket] } = await query('SELECT project_id FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'goals.write');
    if (!role) return;

    const { rowCount } = await query(
      'DELETE FROM ticket_goal_links WHERE ticket_id = $1 AND goal_id = $2', [ticketId, goalId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Link not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
