const router = require('express').Router({ mergeParams: true });
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { requireAuth, assertProjectPermission, hasProjectPermission } = require('../middleware/auth');
const storage = require('../services/storage');

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

async function getTicketProject(ticketId) {
  const { rows } = await query('SELECT project_id FROM tickets WHERE id = $1', [ticketId]);
  return rows[0]?.project_id || null;
}

// GET / — list attachments for a ticket, include presigned url for each
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const projectId = await getTicketProject(ticketId);
    if (!projectId) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, projectId, 'tickets.view');
    if (!role) return;

    const { rows } = await query(`
      SELECT a.*,
        CASE WHEN u.id IS NOT NULL
          THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
          ELSE NULL END AS uploader
      FROM ticket_attachments a
      LEFT JOIN users u ON u.id = a.uploader_id
      WHERE a.ticket_id = $1
      ORDER BY a.created_at ASC
    `, [ticketId]);

    const results = await Promise.all(rows.map(async (row) => {
      const url = await storage.presignedUrl(row.filename);
      return { ...row, url };
    }));

    res.json(results);
  } catch (err) { next(err); }
});

// POST / — upload a file, store metadata
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const projectId = await getTicketProject(ticketId);
    if (!projectId) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, projectId, 'tickets.write');
    if (!role) return;

    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const ext = path.extname(req.file.originalname);
    const key = `tickets/${ticketId}/${uuidv4()}${ext}`;

    await storage.upload(key, req.file.buffer, req.file.mimetype);

    const { rows } = await query(`
      INSERT INTO ticket_attachments (ticket_id, uploader_id, filename, original_name, content_type, file_size)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [ticketId, req.user.id, key, req.file.originalname, req.file.mimetype, req.file.size]);

    const url = await storage.presignedUrl(key);
    const full = await query(`
      SELECT a.*,
        CASE WHEN u.id IS NOT NULL
          THEN json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'avatar_url', u.avatar_url)
          ELSE NULL END AS uploader
      FROM ticket_attachments a
      LEFT JOIN users u ON u.id = a.uploader_id
      WHERE a.id = $1
    `, [rows[0].id]);

    res.status(201).json({ ...full.rows[0], url });
  } catch (err) { next(err); }
});

// DELETE /:id — delete from MinIO + DB; uploader or project-admin+ can delete
router.delete('/:id', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows: [attachment] } = await query(
      'SELECT * FROM ticket_attachments WHERE id = $1 AND ticket_id = $2',
      [req.params.id, ticketId]
    );
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    const projectId = await getTicketProject(ticketId);
    if (!projectId) return res.status(404).json({ error: 'Ticket not found' });

    const role = await assertProjectPermission(req, res, projectId, 'tickets.write');
    if (!role) return;

    if (attachment.uploader_id !== req.user.id) {
      const hasDelete = await hasProjectPermission(req.user.id, projectId, req.user.role, 'tickets.delete');
      if (!hasDelete) return res.status(403).json({ error: 'Permission denied' });
    }

    await storage.deleteObject(attachment.filename);
    await query('DELETE FROM ticket_attachments WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
