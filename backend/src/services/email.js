const nodemailer = require('nodemailer');

const enabled = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = enabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function sendEmail({ to, subject, html }) {
  if (!enabled) {
    console.log(`[Email disabled] To: ${to} | Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `Canopy <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

function overdueEmailHtml({ assignee_name, ticket_key, title, due_date, project_key }) {
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  const dueDateStr = new Date(due_date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const ticketUrl = `${appUrl}/p/${project_key}`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px;">
    <div style="background:#6366F1;border-radius:12px 12px 0 0;padding:24px 28px;">
      <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
        ⚠️ Overdue Ticket
      </div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px;">
      <p style="margin:0 0 16px;color:#334155;font-size:15px;">Hi ${assignee_name},</p>
      <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
        A ticket assigned to you is past its due date and still open.
      </p>
      <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 24px;">
        <div style="font-weight:600;color:#1e293b;font-size:15px;margin-bottom:6px;">
          ${ticket_key}: ${title}
        </div>
        <div style="color:#ef4444;font-size:13px;font-weight:500;">
          Due: ${dueDateStr}
        </div>
      </div>
      <a href="${ticketUrl}"
        style="display:inline-block;background:#6366F1;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;">
        View in Canopy →
      </a>
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">
        You'll receive this reminder once per day until the ticket is marked done or the due date is updated.
      </p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { sendEmail, overdueEmailHtml, enabled };
