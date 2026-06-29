const { query } = require('../db');
const { sendEmail, overdueEmailHtml, enabled } = require('./email');

async function checkOverdueTickets() {
  try {
    const { rows: overdue } = await query(`
      SELECT
        t.id, t.title, t.due_date,
        p.key AS project_key,
        p.key || '-' || t.number AS ticket_key,
        u.id AS assignee_id,
        u.name AS assignee_name,
        u.email AS assignee_email
      FROM tickets t
      JOIN projects p ON p.id = t.project_id
      JOIN users u ON u.id = t.assignee_id
      WHERE t.due_date < NOW()
        AND t.status != 'done'
        AND u.email IS NOT NULL
        AND u.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM notification_log nl
          WHERE nl.ticket_id = t.id
            AND nl.user_id = u.id
            AND nl.type = 'overdue'
            AND nl.sent_at > NOW() - INTERVAL '24 hours'
        )
    `);

    if (overdue.length > 0) {
      console.log(`[Notifications] Sending overdue alerts for ${overdue.length} ticket(s)`);
    }

    for (const ticket of overdue) {
      await sendEmail({
        to: ticket.assignee_email,
        subject: `[Overdue] ${ticket.ticket_key}: ${ticket.title}`,
        html: overdueEmailHtml(ticket),
      });
      await query(
        'INSERT INTO notification_log (ticket_id, user_id, type) VALUES ($1, $2, $3)',
        [ticket.id, ticket.assignee_id, 'overdue']
      );
    }
  } catch (err) {
    console.error('[Notifications] Error checking overdue tickets:', err.message);
  }
}

function startNotificationService() {
  const status = enabled ? 'email enabled' : 'email disabled — set SMTP vars to enable';
  console.log(`[Notifications] Starting overdue checker (${status})`);

  // First check after 1 minute (let DB fully settle on startup)
  setTimeout(checkOverdueTickets, 60_000);

  // Then every hour
  setInterval(checkOverdueTickets, 60 * 60 * 1000);
}

module.exports = { startNotificationService, checkOverdueTickets };
