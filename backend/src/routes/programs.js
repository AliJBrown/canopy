const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, checkSystemPermission } = require('../middleware/auth');

router.use(requireAuth);

async function assertProgramsWrite(req, res) {
  if (!(await checkSystemPermission(req.user, 'programs.write'))) {
    res.status(403).json({ error: 'Permission denied' });
    return false;
  }
  return true;
}

// Computes, for each program, the checklist done/total per stage plus a derived cell state
// ('done' | 'active' | 'not_started') for each stage independently. Stages aren't sequential —
// a program can be actively working several stages in parallel — so each stage's icon reflects
// only its own checklist: no items yet = not_started, some items not done = active (in progress),
// all items done = done. A manual override (program_stage_progress.manual_state) always wins —
// a stage can be marked in-progress/done by hand even with zero checklist items. Computed on
// read, same style as the Goals rollup (goals.js computeNodeProgress) rather than stored.
function attachStageStates(programRows, stages, checklistCounts, progressRows) {
  const countsByProgram = {};
  for (const row of checklistCounts) {
    (countsByProgram[row.program_id] ??= {})[row.stage_id] = { total: row.total, done: row.done };
  }
  const progressByProgram = {};
  for (const row of progressRows) {
    (progressByProgram[row.program_id] ??= {})[row.stage_id] = row;
  }

  return programRows.map(p => {
    const counts = countsByProgram[p.id] || {};
    const progress = progressByProgram[p.id] || {};
    const stageStates = stages.map(stage => {
      const c = counts[stage.id] || { total: 0, done: 0 };
      const manual = progress[stage.id]?.manual_state || null;
      let state;
      if (manual) {
        state = manual;
      } else if (c.total === 0) {
        state = 'not_started';
      } else if (c.done === c.total) {
        state = 'done';
      } else {
        state = 'active';
      }
      return {
        stage_id: stage.id, total: c.total, done: c.done, state,
        is_manual: !!manual,
        has_notes: !!progress[stage.id]?.notes,
      };
    });
    return { ...p, stages: stageStates };
  });
}

// GET / — the master list: every program from every client, in one place
router.get('/', async (req, res, next) => {
  try {
    const { rows: stages } = await query(
      'SELECT * FROM pipeline_stages ORDER BY position ASC, created_at ASC'
    );

    const { rows: programRows } = await query(`
      SELECT pr.*, c.name AS client_name,
             u.name AS owner_name, u.color AS owner_color
      FROM programs pr
      LEFT JOIN clients c ON c.id = pr.client_id
      LEFT JOIN users u ON u.id = pr.owner_id
      ORDER BY c.name ASC NULLS LAST, pr.name ASC
    `);

    const programIds = programRows.map(p => p.id);
    let checklistCounts = [];
    if (programIds.length > 0) {
      const { rows } = await query(`
        SELECT pci.program_id, pci.stage_id,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (
                 WHERE (pci.item_type = 'task' AND pci.is_done)
                    OR (pci.item_type = 'ticket' AND t.status = 'done')
               )::int AS done
        FROM program_checklist_items pci
        LEFT JOIN tickets t ON t.id = pci.ticket_id
        WHERE pci.program_id = ANY($1::uuid[])
        GROUP BY pci.program_id, pci.stage_id
      `, [programIds]);
      checklistCounts = rows;
    }

    let progressRows = [];
    if (programIds.length > 0) {
      const { rows } = await query(
        'SELECT * FROM program_stage_progress WHERE program_id = ANY($1::uuid[])',
        [programIds]
      );
      progressRows = rows;
    }

    res.json({ stages, programs: attachStageStates(programRows, stages, checklistCounts, progressRows) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [program] } = await query(`
      SELECT pr.*, c.name AS client_name
      FROM programs pr LEFT JOIN clients c ON c.id = pr.client_id
      WHERE pr.id = $1
    `, [req.params.id]);
    if (!program) return res.status(404).json({ error: 'Not found' });
    res.json(program);
  } catch (err) { next(err); }
});

// POST / — create a program (one client project). Against an existing client, an inline new
// one, or — for teams that don't use Clients at all — no client at all.
router.post('/', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;

    const { client_id, new_client, name, owner_id, priority } = req.body;
    if (priority !== undefined && !['p0', 'p1', 'p2', 'p3'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    let clientId = null;
    let clientName = null;
    if (client_id) {
      const { rows: [existing] } = await query('SELECT name FROM clients WHERE id = $1', [client_id]);
      if (!existing) return res.status(404).json({ error: 'Client not found' });
      clientId = client_id;
      clientName = existing.name;
    } else if (new_client) {
      if (!new_client.name?.trim()) return res.status(400).json({ error: 'new_client.name is required' });
      const { rows: [created] } = await query(
        `INSERT INTO clients (name, contact_person, contact_email, contact_phone, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name`,
        [new_client.name.trim(), new_client.contact_person || '', new_client.contact_email || '',
         new_client.contact_phone || '', new_client.notes || '', req.user.id]
      );
      clientId = created.id;
      clientName = created.name;
    }

    const finalName = (name || clientName || '').trim();
    if (!finalName) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(
      `INSERT INTO programs (client_id, name, owner_id, priority) VALUES ($1, $2, $3, COALESCE($4, 'p2')) RETURNING *`,
      [clientId, finalName, owner_id || null, priority || null]
    );
    res.status(201).json({ ...rows[0], client_name: clientName });
  } catch (err) { next(err); }
});

// PATCH /:id — update name / owner / status / payment_status / archive / linked project
router.patch('/:id', async (req, res, next) => {
  try {
    if (!(await assertProgramsWrite(req, res))) return;

    if ('project_id' in req.body && req.body.project_id) {
      const { rows: [project] } = await query('SELECT id FROM projects WHERE id = $1', [req.body.project_id]);
      if (!project) return res.status(404).json({ error: 'Project not found' });
    }
    if ('priority' in req.body && !['p0', 'p1', 'p2', 'p3'].includes(req.body.priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    const allowed = ['name', 'owner_id', 'status', 'payment_status', 'priority', 'is_archived', 'project_id', 'notes'];
    const updates = [];
    const params = [];
    allowed.forEach(f => {
      if (f in req.body) {
        params.push(req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE programs SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'programs.delete'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    await query('DELETE FROM programs WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
