const router = require('express').Router({ mergeParams: true }); // /api/programs/:programId/checklist-items
const { query } = require('../db');
const { requireAuth, checkSystemPermission } = require('../middleware/auth');
const { resolveChecklistProjectId } = require('../services/programProjects');

router.use(requireAuth);

async function assertProgramsWrite(req, res) {
  if (!(await checkSystemPermission(req.user, 'programs.write'))) {
    res.status(403).json({ error: 'Permission denied' });
    return false;
  }
  return true;
}

const ITEM_SELECT = `
  SELECT pci.*,
         t.id AS ticket_id_full, t.number AS ticket_number, t.title AS ticket_title,
         t.status AS ticket_status, p.key AS ticket_project_key
  FROM program_checklist_items pci
  LEFT JOIN tickets t ON t.id = pci.ticket_id
  LEFT JOIN projects p ON p.id = t.project_id
`;

// GET /?stage_id= — list checklist items for this program (optionally one stage)
router.get('/', async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { stage_id } = req.query;
    const params = [programId];
    let where = 'WHERE pci.program_id = $1';
    if (stage_id) { params.push(stage_id); where += ` AND pci.stage_id = $${params.length}`; }

    const { rows } = await query(
      `${ITEM_SELECT} ${where} ORDER BY pci.position ASC, pci.created_at ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — add a checklist item. item_type 'task' just needs a title; item_type 'ticket' either
// creates a real Canopy ticket (in whichever project the admin-configured mode resolves to,
// nested under this program's epic when mode is 'per_client') when given a title, or links an
// already-existing ticket as-is when given existing_ticket_id (no project resolution, no epic,
// the ticket stays wherever it already lives).
router.post('/', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;

    const { programId } = req.params;
    const { stage_id, item_type, title, existing_ticket_id } = req.body;
    if (!stage_id || !['task', 'ticket'].includes(item_type)) {
      return res.status(400).json({ error: 'stage_id and a valid item_type are required' });
    }

    const { rows: [maxPos] } = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM program_checklist_items WHERE program_id = $1 AND stage_id = $2',
      [programId, stage_id]
    );

    if (item_type === 'task') {
      if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
      const { rows } = await query(
        `INSERT INTO program_checklist_items (program_id, stage_id, item_type, title, position, created_by)
         VALUES ($1, $2, 'task', $3, $4, $5) RETURNING *`,
        [programId, stage_id, title.trim(), maxPos.next, req.user.id]
      );
      return res.status(201).json(rows[0]);
    }

    // item_type === 'ticket', linking an existing ticket
    if (existing_ticket_id) {
      const { rows: [ticket] } = await query('SELECT id FROM tickets WHERE id = $1', [existing_ticket_id]);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const { rows } = await query(
        `INSERT INTO program_checklist_items (program_id, stage_id, item_type, ticket_id, position, created_by)
         VALUES ($1, $2, 'ticket', $3, $4, $5) RETURNING *`,
        [programId, stage_id, existing_ticket_id, maxPos.next, req.user.id]
      );
      return res.status(201).json(rows[0]);
    }

    // item_type === 'ticket', creating a new one
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const { rows: [program] } = await query('SELECT * FROM programs WHERE id = $1', [programId]);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    const { rows: [clientRecord] } = await query('SELECT * FROM clients WHERE id = $1', [program.client_id]);

    const { projectId, parentTicketId } = await resolveChecklistProjectId({
      client: clientRecord, program, actorUserId: req.user.id,
    });

    const { rows: [orderRow] } = await query(
      "SELECT COALESCE(MAX(order_index), 0) + 1000 AS next FROM tickets WHERE project_id = $1 AND status = 'backlog'",
      [projectId]
    );
    const { rows: [ticket] } = await query(
      `INSERT INTO tickets (project_id, number, title, type, status, priority, reporter_id, order_index, parent_id)
       VALUES ($1, 0, $2, 'task', 'backlog', 'medium', $3, $4, $5) RETURNING *`,
      [projectId, title.trim(), req.user.id, orderRow.next, parentTicketId]
    );

    const { rows } = await query(
      `INSERT INTO program_checklist_items (program_id, stage_id, item_type, ticket_id, position, created_by)
       VALUES ($1, $2, 'ticket', $3, $4, $5) RETURNING *`,
      [programId, stage_id, ticket.id, maxPos.next, req.user.id]
    );
    res.status(201).json({ ...rows[0], ticket });
  } catch (err) { next(err); }
});

// PATCH /:itemId — toggle a task's done state, or reposition either type
router.patch('/:itemId', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;

    const { rows: [item] } = await query(
      'SELECT * FROM program_checklist_items WHERE id = $1 AND program_id = $2',
      [req.params.itemId, req.params.programId]
    );
    if (!item) return res.status(404).json({ error: 'Not found' });

    const updates = [];
    const params = [];
    if ('position' in req.body) {
      params.push(req.body.position);
      updates.push(`position = $${params.length}`);
    }
    if ('is_done' in req.body) {
      if (item.item_type !== 'task') {
        return res.status(400).json({ error: 'Ticket-backed items are completed by updating the linked ticket' });
      }
      params.push(!!req.body.is_done);
      updates.push(`is_done = $${params.length}`);
      updates.push(`completed_at = ${req.body.is_done ? 'NOW()' : 'NULL'}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.itemId);
    const { rows } = await query(
      `UPDATE program_checklist_items SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:itemId — removes the checklist entry (a linked ticket, if any, is left intact)
router.delete('/:itemId', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;
    await query(
      'DELETE FROM program_checklist_items WHERE id = $1 AND program_id = $2',
      [req.params.itemId, req.params.programId]
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
