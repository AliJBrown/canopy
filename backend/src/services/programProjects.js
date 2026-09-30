const { withTransaction } = require('../db');
const { createProjectWithDefaults } = require('../routes/projects');

function randomSuffix(len = 3) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Creates a project (with defaults) using the given key as a starting point, retrying with a
// random suffix on key collisions (project.key is globally UNIQUE).
async function createProjectRetryingKey({ name, keyBase, ownerUserId, runQuery }) {
  let attempt = 0;
  while (true) {
    const key = attempt === 0 ? keyBase : `${keyBase.slice(0, 7)}${randomSuffix(3)}`.slice(0, 10);
    try {
      return await createProjectWithDefaults({ name, key, ownerUserId, runQuery });
    } catch (err) {
      if (err.code === '23505' && attempt < 5) { attempt++; continue; }
      throw err;
    }
  }
}

// Resolves where a newly-created ticket-backed checklist item should go, based on the
// admin-configured program_settings.ticket_project_mode. Lazily creates the backing project on
// first use for the given scope (shared / client / program) — or reuses one a user already
// pointed at via clients.project_id / programs.project_id / program_settings.shared_project_id —
// guarding against a race between concurrent "first use" requests with a row lock inside a
// transaction. Returns { projectId, parentTicketId }: in 'per_client' mode, parentTicketId is the
// program's own epic ticket (lazily created inside the client's project) so multiple programs
// sharing one client project stay organized as separate epics rather than a flat ticket list.
async function resolveChecklistProjectId({ client: clientRecord, program, actorUserId }) {
  return withTransaction(async (dbClient) => {
    const runQuery = dbClient.query.bind(dbClient);

    const { rows: [settings] } = await runQuery(
      'SELECT * FROM program_settings WHERE id = 1 FOR UPDATE'
    );
    // 'per_client' has nothing to scope to for a client-less program (Clients turned off, or
    // this particular program was created without one) — fall back to the shared project.
    const mode = (settings.ticket_project_mode === 'per_client' && !clientRecord)
      ? 'single' : settings.ticket_project_mode;

    if (mode === 'single') {
      if (settings.shared_project_id) return { projectId: settings.shared_project_id, parentTicketId: null };
      const project = await createProjectRetryingKey({
        name: 'Client Engagements', keyBase: 'PROG', ownerUserId: actorUserId, runQuery,
      });
      await runQuery('UPDATE program_settings SET shared_project_id = $1 WHERE id = 1', [project.id]);
      return { projectId: project.id, parentTicketId: null };
    }

    if (mode === 'per_client') {
      const { rows: [lockedClient] } = await runQuery(
        'SELECT * FROM clients WHERE id = $1 FOR UPDATE', [clientRecord.id]
      );
      let projectId = lockedClient.project_id;
      if (!projectId) {
        const keyBase = lockedClient.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'CLIENT';
        const project = await createProjectRetryingKey({
          name: lockedClient.name, keyBase, ownerUserId: actorUserId, runQuery,
        });
        projectId = project.id;
        await runQuery('UPDATE clients SET project_id = $1 WHERE id = $2', [projectId, lockedClient.id]);
      }

      // Ensure this program has its own epic inside the client's project, so several programs
      // sharing one client project don't dump tickets into one undifferentiated list.
      const { rows: [lockedProgram] } = await runQuery(
        'SELECT * FROM programs WHERE id = $1 FOR UPDATE', [program.id]
      );
      let epicTicketId = lockedProgram.epic_ticket_id;
      if (!epicTicketId) {
        const { rows: [epic] } = await runQuery(
          `INSERT INTO tickets (project_id, number, title, type, status, priority, reporter_id)
           VALUES ($1, 0, $2, 'epic', 'backlog', 'medium', $3) RETURNING id`,
          [projectId, lockedProgram.name, actorUserId]
        );
        epicTicketId = epic.id;
        await runQuery('UPDATE programs SET epic_ticket_id = $1 WHERE id = $2', [epicTicketId, lockedProgram.id]);
      }
      return { projectId, parentTicketId: epicTicketId };
    }

    // mode === 'per_program'
    const { rows: [lockedProgram] } = await runQuery(
      'SELECT * FROM programs WHERE id = $1 FOR UPDATE', [program.id]
    );
    if (lockedProgram.project_id) return { projectId: lockedProgram.project_id, parentTicketId: null };
    const keyBase = (clientRecord?.name || program.name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROG';
    const projectName = clientRecord ? `${clientRecord.name} — ${program.name}` : program.name;
    const project = await createProjectRetryingKey({
      name: projectName, keyBase, ownerUserId: actorUserId, runQuery,
    });
    await runQuery('UPDATE programs SET project_id = $1 WHERE id = $2', [project.id, lockedProgram.id]);
    return { projectId: project.id, parentTicketId: null };
  });
}

module.exports = { resolveChecklistProjectId };
