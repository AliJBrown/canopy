const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, checkSystemPermission } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT c.*, COUNT(p.id)::int AS program_count
      FROM clients c
      LEFT JOIN programs p ON p.client_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'clients.write'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const { name, contact_person = '', contact_email = '', contact_phone = '', notes = '' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(
      `INSERT INTO clients (name, contact_person, contact_email, contact_phone, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name.trim(), contact_person, contact_email, contact_phone, notes, req.user.id]
    );
    res.status(201).json({ ...rows[0], program_count: 0 });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'clients.write'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    if ('project_id' in req.body && req.body.project_id) {
      const { rows: [project] } = await query('SELECT id FROM projects WHERE id = $1', [req.body.project_id]);
      if (!project) return res.status(404).json({ error: 'Project not found' });
    }

    const allowed = ['name', 'contact_person', 'contact_email', 'contact_phone', 'notes', 'project_id'];
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
      `UPDATE clients SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!(await checkSystemPermission(req.user, 'clients.write'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*)::int AS count FROM programs WHERE client_id = $1',
      [req.params.id]
    );
    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete: this client has ${count} program${count > 1 ? 's' : ''}. Remove them first.`,
      });
    }
    await query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
