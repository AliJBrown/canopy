const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const { requireAuth, signToken, getUserSystemPermissions } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const USER_FIELDS = 'id, name, email, role, color, avatar_url, is_active, created_at';

async function withSystemPermissions(user) {
  const systemPermissions = user.role === 'admin'
    ? null // null signals "all" — frontend checks role separately
    : await getUserSystemPermissions(user.id);
  return { ...user, systemPermissions };
}

router.get('/config', (req, res) => {
  res.json({ googleEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows: [user] } = await query(
      `SELECT ${USER_FIELDS}, password_hash FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.is_active) return res.status(401).json({ error: 'Account disabled' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: await withSystemPermissions(safeUser) });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(await withSystemPermissions(req.user));
  } catch (err) { next(err); }
});

router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { rows: [user] } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (user.password_hash) {
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated' });
  } catch (err) { next(err); }
});

// Google OAuth — manual flow (no passport)
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.redirect(`${FRONTEND_URL}/login?error=google_not_configured`);
  }
  // Signed short-lived JWT used as state — verifying it on callback prevents CSRF
  const state = jwt.sign(
    { nonce: crypto.randomBytes(16).toString('hex') },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${BACKEND_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error) return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error)}`);

  try {
    jwt.verify(state, JWT_SECRET);
  } catch {
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${BACKEND_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    // Look up by google_id, then email
    let { rows: [user] } = await query(`SELECT ${USER_FIELDS} FROM users WHERE google_id = $1`, [profile.id]);

    if (!user) {
      const byEmail = await query(`SELECT ${USER_FIELDS} FROM users WHERE email = $1`, [profile.email]);
      if (!byEmail.rows[0]) {
        return res.redirect(`${FRONTEND_URL}/login?error=not_invited`);
      }
      user = byEmail.rows[0];
      await query('UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3',
        [profile.id, profile.picture, user.id]);
    } else {
      await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [profile.picture, user.id]);
    }

    if (!user.is_active) return res.redirect(`${FRONTEND_URL}/login?error=account_disabled`);

    const token = signToken(user);
    res.redirect(`${FRONTEND_URL}/auth/callback#token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
  }
});

module.exports = router;
