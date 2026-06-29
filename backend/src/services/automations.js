const { query } = require('../db');

const VALID_STATUSES = ['backlog','todo','in_progress','in_review','blocked','done'];

// Evaluate a single condition against a ticket
function evalCondition(cond, ticket, labelIds) {
  const { field, op, value } = cond;
  switch (field) {
    case 'type':
      return op === 'eq' ? ticket.type === value
        : op === 'neq' ? ticket.type !== value
        : op === 'in' ? (Array.isArray(value) ? value.includes(ticket.type) : false) : false;
    case 'priority':
      return op === 'eq' ? ticket.priority === value
        : op === 'neq' ? ticket.priority !== value
        : op === 'in' ? (Array.isArray(value) ? value.includes(ticket.priority) : false) : false;
    case 'status':
      return op === 'eq' ? ticket.status === value
        : op === 'neq' ? ticket.status !== value
        : op === 'in' ? (Array.isArray(value) ? value.includes(ticket.status) : false) : false;
    case 'label':
      if (op === 'has') return labelIds.includes(value);
      if (op === 'not_has') return !labelIds.includes(value);
      return false;
    case 'assignee':
      if (op === 'is_set') return !!ticket.assignee_id;
      if (op === 'is_empty') return !ticket.assignee_id;
      if (op === 'eq') return ticket.assignee_id === value;
      return false;
    case 'sprint':
      if (op === 'is_set') return !!ticket.sprint_id;
      if (op === 'is_empty') return !ticket.sprint_id;
      if (op === 'eq') return ticket.sprint_id === value;
      return false;
    default:
      return true;
  }
}

// Execute a single action against a ticket
async function executeAction(action, ticket, projectId) {
  const { type, config = {} } = action;

  switch (type) {
    case 'add_label': {
      if (!config.label_id) break;
      await query(
        'INSERT INTO ticket_labels (ticket_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [ticket.id, config.label_id]
      );
      break;
    }
    case 'remove_label': {
      if (!config.label_id) break;
      await query(
        'DELETE FROM ticket_labels WHERE ticket_id = $1 AND label_id = $2',
        [ticket.id, config.label_id]
      );
      break;
    }
    case 'set_assignee': {
      let assigneeId = config.user_id;
      if (config.user_id === 'reporter') assigneeId = ticket.reporter_id;
      if (config.user_id === 'none') assigneeId = null;
      await query('UPDATE tickets SET assignee_id = $1 WHERE id = $2', [assigneeId || null, ticket.id]);
      break;
    }
    case 'set_priority': {
      if (!config.priority) break;
      await query('UPDATE tickets SET priority = $1 WHERE id = $2', [config.priority, ticket.id]);
      break;
    }
    case 'set_status': {
      if (!config.status || !VALID_STATUSES.includes(config.status)) break;
      await query('UPDATE tickets SET status = $1 WHERE id = $2', [config.status, ticket.id]);
      break;
    }
    case 'add_comment': {
      if (!config.body) break;
      // Find system/bot user or use first admin
      const { rows: [bot] } = await query(
        `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`
      );
      if (bot) {
        await query(
          'INSERT INTO comments (ticket_id, author_id, body) VALUES ($1, $2, $3)',
          [ticket.id, bot.id, `🤖 Automation: ${config.body}`]
        );
      }
      break;
    }
    case 'webhook': {
      // Fire-and-forget — don't await so it doesn't block the response
      if (!config.url) break;
      setImmediate(async () => {
        try {
          const payload = {
            event: 'automation.action',
            ticket: { id: ticket.id, title: ticket.title, type: ticket.type,
                       status: ticket.status, priority: ticket.priority,
                       project_id: ticket.project_id },
            project_id: projectId,
            timestamp: new Date().toISOString(),
          };
          const headers = { 'Content-Type': 'application/json' };
          if (config.secret) headers['X-Webhook-Secret'] = config.secret;
          await fetch(config.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000),
          });
        } catch {
          // Webhook failures are logged but don't affect the main flow
        }
      });
      break;
    }
    default:
      break;
  }
}

// Main entry point: find matching automations and execute them
// Pass fromAutomation=true to prevent automation-triggered events from re-triggering automations
async function fireAutomations(projectId, triggerType, triggerConfig, ticket, fromAutomation = false) {
  if (fromAutomation) return; // no chaining for now

  try {
    const { rows: automations } = await query(`
      SELECT * FROM project_automations
      WHERE project_id = $1 AND trigger_type = $2 AND is_active = true
    `, [projectId, triggerType]);

    if (!automations.length) return;

    // Get current label IDs for the ticket
    const { rows: labelRows } = await query(
      'SELECT label_id FROM ticket_labels WHERE ticket_id = $1',
      [ticket.id]
    );
    const labelIds = labelRows.map(r => r.label_id);

    for (const auto of automations) {
      try {
        // Check trigger-specific config
        const tc = auto.trigger_config || {};
        if (triggerType === 'ticket.status_changed') {
          if (tc.to && tc.to !== '*' && tc.to !== triggerConfig.to) continue;
          if (tc.from && tc.from !== '*' && tc.from !== triggerConfig.from) continue;
        }
        if (triggerType === 'ticket.assigned') {
          if (tc.assignee_id && tc.assignee_id !== '*' && tc.assignee_id !== triggerConfig.assignee_id) continue;
        }

        // Check conditions
        const conditions = Array.isArray(auto.conditions) ? auto.conditions : [];
        const condsMet = conditions.every(c => evalCondition(c, ticket, labelIds));
        if (!condsMet) {
          await query(
            `INSERT INTO automation_runs (automation_id, ticket_id, status, result)
             VALUES ($1, $2, 'skipped', $3)`,
            [auto.id, ticket.id, JSON.stringify({ reason: 'conditions not met' })]
          );
          continue;
        }

        // Execute actions in order
        const actions = Array.isArray(auto.actions) ? auto.actions : [];
        for (const action of actions) {
          await executeAction(action, ticket, projectId);
        }

        // Log success and update run_count
        await Promise.all([
          query(
            `INSERT INTO automation_runs (automation_id, ticket_id, status, result)
             VALUES ($1, $2, 'success', $3)`,
            [auto.id, ticket.id, JSON.stringify({ actions: actions.map(a => a.type) })]
          ),
          query(
            `UPDATE project_automations SET run_count = run_count + 1, last_run_at = NOW()
             WHERE id = $1`,
            [auto.id]
          ),
        ]);
      } catch (err) {
        // Log individual automation failure, continue with others
        await query(
          `INSERT INTO automation_runs (automation_id, ticket_id, status, result)
           VALUES ($1, $2, 'failed', $3)`,
          [auto.id, ticket.id, JSON.stringify({ error: err.message })]
        ).catch(() => {});
      }
    }
  } catch {
    // Don't let automation errors crash the main request
  }
}

module.exports = { fireAutomations };
