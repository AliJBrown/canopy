const router = require('express').Router();
const { fireAutomations } = require('../services/automations');
const { query } = require('../db');
const { requireAuth, assertProjectPermission, hasProjectPermission } = require('../middleware/auth');

router.use(requireAuth);

// ── Nested filter config evaluator ───────────────────────────────────────────
function buildCondWhere(cond, params) {
  const { field, op, values = [], value = '' } = cond;
  switch (field) {
    case 'status':
      if (op === 'in'  && values.length) { params.push(values); return `t.status = ANY($${params.length})`; }
      if (op === 'nin' && values.length) { params.push(values); return `NOT (t.status = ANY($${params.length}))`; }
      break;
    case 'type':
      if (op === 'in'  && values.length) { params.push(values); return `t.type = ANY($${params.length})`; }
      if (op === 'nin' && values.length) { params.push(values); return `NOT (t.type = ANY($${params.length}))`; }
      break;
    case 'priority':
      if (op === 'in'  && values.length) { params.push(values); return `t.priority = ANY($${params.length})`; }
      if (op === 'nin' && values.length) { params.push(values); return `NOT (t.priority = ANY($${params.length}))`; }
      break;
    case 'assignee_id':
      if (op === 'empty') return 't.assignee_id IS NULL';
      if (op === 'in' && values.length) { params.push(values); return `t.assignee_id = ANY($${params.length}::uuid[])`; }
      break;
    case 'sprint_id':
      if (op === 'none') return 't.sprint_id IS NULL';
      if (op === 'eq' && value) { params.push(value); return `t.sprint_id = $${params.length}`; }
      break;
    case 'label_id':
      if (op === 'in'  && values.length) { params.push(values); return `EXISTS (SELECT 1 FROM ticket_labels tl WHERE tl.ticket_id = t.id AND tl.label_id = ANY($${params.length}::uuid[]))`; }
      if (op === 'nin' && values.length) { params.push(values); return `NOT EXISTS (SELECT 1 FROM ticket_labels tl WHERE tl.ticket_id = t.id AND tl.label_id = ANY($${params.length}::uuid[]))`; }
      break;
    case 'due_date':
      if (op === 'before' && value) { params.push(value); return `t.due_date < $${params.length}`; }
      if (op === 'after'  && value) { params.push(value); return `t.due_date > $${params.length}`; }
      break;
    case 'story_points': {
      const v = parseFloat(value);
      if (!isNaN(v)) {
        params.push(v);
        if (op === 'eq') return `t.story_points = $${params.length}`;
        if (op === 'gt') return `t.story_points > $${params.length}`;
        if (op === 'lt') return `t.story_points < $${params.length}`;
      }
      break;
    }
    default:
      if (field && field.startsWith('custom:') && op === 'eq' && value) {
        params.push(field.slice(7)); params.push(value);
        return `EXISTS (SELECT 1 FROM ticket_field_values tfv WHERE tfv.ticket_id = t.id AND tfv.field_id = $${params.length - 1}::uuid AND tfv.value = $${params.length})`;
      }
  }
  return null;
}

function buildGroupWhere(node, params) {
  if (!node) return null;
  if (node.type === 'condition') return buildCondWhere(node, params);
  const parts = (node.children || []).map(c => buildGroupWhere(c, params)).filter(Boolean);
  if (!parts.length) return null;
  const glue = node.operator === 'OR' ? ' OR ' : ' AND ';
  return parts.length === 1 ? parts[0] : `(${parts.join(glue)})`;
}
// ─────────────────────────────────────────────────────────────────────────────

const TICKET_SELECT = `
  SELECT
    t.*,
    p.key AS project_key,
    p.key || '-' || t.number AS ticket_key,
    row_to_json(u) AS assignee,
    row_to_json(r) AS reporter,
    (SELECT COUNT(*)::int FROM tickets c WHERE c.parent_id = t.id) AS child_count,
    (SELECT COALESCE(SUM(hours), 0) FROM time_logs WHERE ticket_id = t.id) AS total_logged_hours,
    CASE WHEN t.type = 'epic' THEN
      jsonb_build_object(
        'total', (SELECT COUNT(*) FROM tickets c WHERE c.parent_id = t.id),
        'done',  (SELECT COUNT(*) FROM tickets c WHERE c.parent_id = t.id AND c.status = 'done')
      )
    ELSE NULL END AS epic_progress,
    COALESCE(
      (SELECT json_agg(json_build_object('id', pl.id, 'name', pl.name, 'color', pl.color))
       FROM ticket_labels tl JOIN project_labels pl ON pl.id = tl.label_id
       WHERE tl.ticket_id = t.id), '[]'
    ) AS labels,
    COALESCE(
      (SELECT jsonb_object_agg(tfv.field_id::text, tfv.value)
       FROM ticket_field_values tfv WHERE tfv.ticket_id = t.id), '{}'
    ) AS custom_fields,
    (SELECT COUNT(*)::int FROM ticket_dependencies td WHERE td.blocked_id = t.id AND td.type = 'blocks') AS blocked_by_count,
    CASE WHEN t.parent_id IS NOT NULL THEN
      jsonb_build_object(
        'id', pt.id, 'title', pt.title,
        'ticket_key', p.key || '-' || pt.number, 'type', pt.type
      )
    ELSE NULL END AS parent
  FROM tickets t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN (SELECT id, name, color, avatar_url FROM users) u ON u.id = t.assignee_id
  LEFT JOIN (SELECT id, name, color, avatar_url FROM users) r ON r.id = t.reporter_id
  LEFT JOIN tickets pt ON pt.id = t.parent_id
`;

router.get('/', async (req, res, next) => {
  try {
    const {
      projectId, status, notStatus, type, priority, assigneeId, search, parentId, sprintId,
      labelIds, dueDateBefore, dueDateAfter, hasNoAssignee,
      limit = 200, offset = 0,
    } = req.query;

    const conditions = [];
    const params = [];

    if (projectId) {
      const role = await assertProjectPermission(req, res, projectId, 'tickets.view');
      if (!role) return;
      params.push(projectId); conditions.push(`t.project_id = $${params.length}`);
    }

    // Exact match filters — support comma-separated multi-value
    if (status) {
      const vals = status.split(',').filter(Boolean);
      if (vals.length === 1) { params.push(vals[0]); conditions.push(`t.status = $${params.length}`); }
      else { params.push(vals); conditions.push(`t.status = ANY($${params.length})`); }
    }
    if (type) {
      const vals = type.split(',').filter(Boolean);
      if (vals.length === 1) { params.push(vals[0]); conditions.push(`t.type = $${params.length}`); }
      else { params.push(vals); conditions.push(`t.type = ANY($${params.length})`); }
    }
    if (priority) {
      const vals = priority.split(',').filter(Boolean);
      if (vals.length === 1) { params.push(vals[0]); conditions.push(`t.priority = $${params.length}`); }
      else { params.push(vals); conditions.push(`t.priority = ANY($${params.length})`); }
    }
    // Selected assignees and "Unassigned" are alternatives within one filter, so OR them
    const assigneeOr = [];
    if (assigneeId) {
      const vals = assigneeId.split(',').filter(Boolean);
      if (vals.length) { params.push(vals); assigneeOr.push(`t.assignee_id = ANY($${params.length}::uuid[])`); }
    }
    if (hasNoAssignee === 'true') assigneeOr.push('t.assignee_id IS NULL');
    if (assigneeOr.length) conditions.push(`(${assigneeOr.join(' OR ')})`);
    if (notStatus) {
      const vals = notStatus.split(',').filter(Boolean);
      params.push(vals); conditions.push(`NOT (t.status = ANY($${params.length}))`);
    }
    if (req.query.hasNoPoints === 'true') conditions.push('t.story_points IS NULL');
    if (req.query.hasNoHours === 'true') conditions.push('t.estimate_hours IS NULL');

    if (parentId === 'null') {
      conditions.push('t.parent_id IS NULL');
    } else if (parentId) {
      params.push(parentId); conditions.push(`t.parent_id = $${params.length}`);
    }

    if (sprintId === 'none') {
      conditions.push('t.sprint_id IS NULL');
    } else if (sprintId) {
      params.push(sprintId); conditions.push(`t.sprint_id = $${params.length}`);
    }

    if (labelIds) {
      const ids = labelIds.split(',').filter(Boolean);
      if (ids.length > 0) {
        params.push(ids);
        conditions.push(`EXISTS (
          SELECT 1 FROM ticket_labels tl
          WHERE tl.ticket_id = t.id AND tl.label_id = ANY($${params.length}::uuid[])
        )`);
      }
    }

    if (dueDateBefore) { params.push(dueDateBefore); conditions.push(`t.due_date < $${params.length}`); }
    if (dueDateAfter)  { params.push(dueDateAfter);  conditions.push(`t.due_date > $${params.length}`); }

    // Nested filter config from FilterBuilder (overrides/supplements flat params)
    if (req.query.filterConfig) {
      try {
        const cfg = JSON.parse(req.query.filterConfig);
        const sql = buildGroupWhere(cfg, params);
        if (sql) conditions.push(sql);
      } catch (_) { /* ignore malformed JSON */ }
    }

    // Full-text search (FTS with GIN index) — fallback to ILIKE if query is very short.
    // Also matches the ticket key (e.g. "MFP-1"), since that's the first thing people try.
    if (search) {
      params.push(`%${search}%`);
      const keyMatch = `(p.key || '-' || t.number) ILIKE $${params.length}`;
      if (search.length >= 3) {
        params.push(search);
        conditions.push(`(
          to_tsvector('english', coalesce(t.title,'') || ' ' || coalesce(t.description,''))
          @@ plainto_tsquery('english', $${params.length})
          OR t.title ILIKE '%' || $${params.length} || '%'
          OR ${keyMatch}
        )`);
      } else {
        conditions.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length} OR ${keyMatch})`);
      }
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // Run count + data in parallel
    const countParams = [...params];
    const [dataResult, countResult] = await Promise.all([
      query(
        `${TICKET_SELECT} ${where} ORDER BY t.order_index ASC, t.created_at ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), parseInt(offset)]
      ),
      query(`SELECT COUNT(*)::int AS total FROM tickets t JOIN projects p ON p.id = t.project_id ${where}`, countParams),
    ]);

    res.json({ tickets: dataResult.rows, total: countResult.rows[0].total });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`${TICKET_SELECT} WHERE t.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    const role = await assertProjectPermission(req, res, rows[0].project_id, 'tickets.view');
    if (!role) return;

    const children = await query(`${TICKET_SELECT} WHERE t.parent_id = $1 ORDER BY t.order_index ASC, t.created_at ASC`, [req.params.id]);
    res.json({ ...rows[0], children: children.rows });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { project_id, title, description = '', type = 'task', status = 'backlog',
            priority = 'medium', parent_id, assignee_id,
            due_date, estimate_hours, sprint_id, story_points,
            label_ids = [] } = req.body;
    if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' });

    const role = await assertProjectPermission(req, res, project_id, 'tickets.write');
    if (!role) return;

    const maxOrder = await query(
      'SELECT COALESCE(MAX(order_index), 0) + 1000 AS next FROM tickets WHERE project_id = $1 AND status = $2',
      [project_id, status]
    );

    const { rows } = await query(`
      INSERT INTO tickets (project_id, number, title, description, type, status, priority,
        parent_id, assignee_id, reporter_id, order_index, due_date, estimate_hours,
        sprint_id, story_points)
      VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [project_id, title, description, type, status, priority,
        parent_id || null, assignee_id || null, req.user.id, maxOrder.rows[0].next,
        due_date || null, estimate_hours || null,
        sprint_id || null, story_points || null]);

    // Insert labels
    if (label_ids.length > 0) {
      for (const lid of label_ids) {
        await query('INSERT INTO ticket_labels (ticket_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rows[0].id, lid]);
      }
    }

    const full = await query(`${TICKET_SELECT} WHERE t.id = $1`, [rows[0].id]);
    res.status(201).json(full.rows[0]);

    // Fire automations + log activity after responding (non-blocking)
    setImmediate(async () => {
      fireAutomations(project_id, 'ticket.created', {}, full.rows[0]);
      await query(
        `INSERT INTO ticket_activity (ticket_id, actor_id, action) VALUES ($1, $2, 'created')`,
        [rows[0].id, req.user.id]
      ).catch(() => {});
    });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { rows: [ticket] } = await query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'tickets.write');
    if (!role) return;

    const { label_ids, ...rest } = req.body;

    // Enforce workflow transitions when status changes
    if ('status' in rest && rest.status !== ticket.status) {
      const { rows: [wf] } = await query(
        'SELECT id, is_enforced FROM project_workflows WHERE project_id = $1',
        [ticket.project_id]
      );
      if (wf?.is_enforced) {
        const { rows: [{ cnt }] } = await query(
          'SELECT COUNT(*)::int AS cnt FROM workflow_transitions WHERE workflow_id = $1',
          [wf.id]
        );
        if (cnt > 0) {
          const { rows: ok } = await query(`
            SELECT id FROM workflow_transitions
            WHERE workflow_id = $1
              AND to_status = $2
              AND (from_status = $3 OR from_status = 'any')
          `, [wf.id, rest.status, ticket.status]);
          if (ok.length === 0) {
            return res.status(403).json({
              error: `Workflow: moving from "${ticket.status}" to "${rest.status}" is not an allowed transition.`
            });
          }
        }
      }
    }

    const allowed = ['title', 'description', 'type', 'status', 'priority',
                     'parent_id', 'assignee_id', 'reporter_id', 'order_index',
                     'due_date', 'estimate_hours', 'sprint_id', 'story_points'];
    const updates = [];
    const params = [];

    for (const key of allowed) {
      if (key in rest) {
        params.push(rest[key] === '' ? null : rest[key]);
        updates.push(`${key} = $${params.length}`);
      }
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      await query(`UPDATE tickets SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    }

    // Replace label associations if provided
    if (Array.isArray(label_ids)) {
      await query('DELETE FROM ticket_labels WHERE ticket_id = $1', [req.params.id]);
      for (const lid of label_ids) {
        await query('INSERT INTO ticket_labels (ticket_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, lid]);
      }
    }

    if (updates.length === 0 && !Array.isArray(label_ids)) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const full = await query(`${TICKET_SELECT} WHERE t.id = $1`, [req.params.id]);

    // Check WIP limit when status changed
    let wip_warning = null;
    if ('status' in rest && rest.status !== ticket.status) {
      const { rows: [statusRow] } = await query(
        'SELECT wip_limit FROM project_statuses WHERE project_id = $1 AND slug = $2',
        [ticket.project_id, rest.status]
      );
      if (statusRow?.wip_limit != null) {
        const { rows: [{ cnt }] } = await query(
          'SELECT COUNT(*)::int AS cnt FROM tickets WHERE project_id = $1 AND status = $2',
          [ticket.project_id, rest.status]
        );
        if (cnt > statusRow.wip_limit) {
          wip_warning = { status: rest.status, count: cnt, limit: statusRow.wip_limit };
        }
      }
    }

    res.json({ ...full.rows[0], wip_warning });

    // Fire automations + log activity after responding
    const updated = full.rows[0];
    if (updated) {
      setImmediate(async () => {
        const pid = updated.project_id;
        const TRACKED = ['status', 'priority', 'assignee_id', 'sprint_id', 'title',
                         'story_points', 'estimate_hours', 'due_date', 'type'];
        for (const f of TRACKED) {
          if (f in rest && String(rest[f] ?? '') !== String(ticket[f] ?? '')) {
            await query(
              `INSERT INTO ticket_activity (ticket_id, actor_id, action, field, old_value, new_value)
               VALUES ($1, $2, 'updated', $3, $4, $5)`,
              [req.params.id, req.user.id, f, ticket[f] ?? null, rest[f] ?? null]
            ).catch(() => {});
          }
        }
        if ('status' in rest && rest.status !== ticket.status) {
          fireAutomations(pid, 'ticket.status_changed',
            { from: ticket.status, to: rest.status }, updated);
        }
        if ('assignee_id' in rest && rest.assignee_id !== ticket.assignee_id) {
          fireAutomations(pid, 'ticket.assigned',
            { assignee_id: rest.assignee_id }, updated);
          // Notify new assignee
          if (rest.assignee_id && rest.assignee_id !== req.user.id) {
            await query(
              `INSERT INTO notifications (user_id, actor_id, type, ticket_id, data)
               VALUES ($1, $2, 'assigned', $3, $4)`,
              [rest.assignee_id, req.user.id, req.params.id, JSON.stringify({
                ticket_title: updated.title,
                project_key: updated.project_key,
                ticket_number: updated.number,
              })]
            ).catch(() => {});
          }
        }
        if ('priority' in rest && rest.priority !== ticket.priority) {
          fireAutomations(pid, 'ticket.priority_changed',
            { from: ticket.priority, to: rest.priority }, updated);
        }
      });
    }
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: [ticket] } = await query('SELECT project_id, reporter_id FROM tickets WHERE id = $1', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Not found' });

    const role = await assertProjectPermission(req, res, ticket.project_id, 'tickets.delete');
    if (!role) return;

    await query('DELETE FROM tickets WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /:id/activity — ticket activity feed
router.get('/:id/activity', async (req, res, next) => {
  try {
    const { rows: [ticket] } = await query('SELECT project_id FROM tickets WHERE id = $1', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    const role = await assertProjectPermission(req, res, ticket.project_id, 'tickets.view');
    if (!role) return;

    const { rows } = await query(`
      SELECT
        ta.*,
        json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url) AS actor
      FROM ticket_activity ta
      LEFT JOIN users u ON u.id = ta.actor_id
      WHERE ta.ticket_id = $1
      ORDER BY ta.created_at ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
