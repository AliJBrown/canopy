require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const { runMigrations, query } = require('./db');
const { startNotificationService } = require('./services/notifications');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/users', require('./routes/users'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tickets/:ticketId/time-logs',     require('./routes/timeLogs'));
app.use('/api/tickets/:ticketId/attachments',  require('./routes/attachments'));
app.use('/api/tickets/:ticketId/dependencies', require('./routes/dependencies'));
app.use('/api/tickets/:ticketId/goals',        require('./routes/ticketGoals'));

// Nested member/team routes under projects (mergeParams handled inside members.js via Router({ mergeParams: true }))
app.use('/api/projects/:projectId/members',      require('./routes/members'));
app.use('/api/projects/:projectId/sprints',      require('./routes/sprints'));
app.use('/api/projects/:projectId/labels',       require('./routes/labels'));
app.use('/api/projects/:projectId/fields',       require('./routes/fields'));
app.use('/api/projects/:projectId/reports',      require('./routes/reports'));
app.use('/api/projects/:projectId/saved-filters',require('./routes/savedFilters'));
app.use('/api/projects/:projectId/goals',        require('./routes/goals'));
app.use('/api/goals',                            require('./routes/orgGoals'));
app.use('/api/me/goals',                         require('./routes/personalGoals'));
app.use('/api/projects/:projectId/automations',  require('./routes/automations'));
app.use('/api/projects/:projectId/workflow',     require('./routes/workflows'));
app.use('/api/projects/:projectId/statuses',     require('./routes/projectStatuses'));
app.use('/api/tokens',                           require('./routes/apiTokens'));
app.use('/api/notifications',                    require('./routes/notifications'));
app.use('/api/search',                           require('./routes/search'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function seedData() {
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0].count > 0) return;

  console.log('Seeding initial data...');
  const adminHash = await bcrypt.hash('admin', 10);
  const memberHash = await bcrypt.hash('password', 10);

  const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444'];
  const users = [
    { name: 'Admin', email: 'admin@localhost', hash: adminHash, role: 'admin', color: colors[0] },
    { name: 'Alice Chen', email: 'alice@example.com', hash: memberHash, role: 'member', color: colors[1] },
    { name: 'Bob Kim', email: 'bob@example.com', hash: memberHash, role: 'member', color: colors[2] },
    { name: 'Carol Davis', email: 'carol@example.com', hash: memberHash, role: 'member', color: colors[3] },
  ];

  const createdUsers = [];
  for (const u of users) {
    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash, role, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [u.name, u.email, u.hash, u.role, u.color]
    );
    createdUsers.push(rows[0]);
  }
  const [admin, alice, bob, carol] = createdUsers;

  const { rows: [project] } = await query(
    'INSERT INTO projects (name, key, description) VALUES ($1, $2, $3) RETURNING *',
    ['My First Project', 'MFP', 'Getting started with Canopy']
  );

  const memberRoles = [
    [admin.id, 'owner'],
    [alice.id, 'admin'],
    [bob.id, 'member'],
    [carol.id, 'viewer'],
  ];
  for (const [userId, role] of memberRoles) {
    await query(
      'INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4)',
      [project.id, userId, role, admin.id]
    );
  }

  const tickets = [
    { title: 'Set up authentication system', type: 'epic',  status: 'todo',        priority: 'high',     reporter: admin.id },
    { title: 'Design database schema',        type: 'task',  status: 'done',        priority: 'medium',   reporter: alice.id },
    { title: 'Build user dashboard',          type: 'story', status: 'in_progress', priority: 'high',     reporter: alice.id, assignee: bob.id },
    { title: 'Fix login redirect bug',        type: 'bug',   status: 'in_review',   priority: 'critical', reporter: bob.id,   assignee: alice.id },
    { title: 'Add dark mode support',         type: 'task',  status: 'backlog',     priority: 'low',      reporter: carol.id },
  ];
  for (const t of tickets) {
    await query(`
      INSERT INTO tickets (project_id, number, title, type, status, priority, reporter_id, assignee_id)
      VALUES ($1, 0, $2, $3, $4, $5, $6, $7)
    `, [project.id, t.title, t.type, t.status, t.priority, t.reporter, t.assignee || null]);
  }

  console.log('\n========================================');
  console.log('  Default credentials');
  console.log('  admin@localhost  /  admin   (system admin)');
  console.log('  alice@example.com  /  password  (project admin)');
  console.log('  bob@example.com    /  password  (project member)');
  console.log('  carol@example.com  /  password  (project viewer)');
  console.log('========================================\n');
}

async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await runMigrations();
      break;
    } catch (err) {
      retries--;
      console.log(`DB not ready, retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  await seedData();
  startNotificationService();
  app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
}

start();
