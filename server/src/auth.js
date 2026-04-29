const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const ACCESS_TOKEN_EXPIRY_SECONDS = 900;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_TOKEN_EXPIRY_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSecret() {
  return db.getJwtSecret();
}

function generateAccessToken(userId, email) {
  return jwt.sign({ userId, email }, getSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function issueTokens(userId, email) {
  const accessToken = generateAccessToken(userId, email);
  const refreshToken = generateRefreshToken();
  db.storeRefreshToken(userId, refreshToken, REFRESH_TOKEN_EXPIRY_SECONDS);
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS };
}

// --- Middleware ---

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getSecret());
    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired' });
    }
    return res.status(401).json({ error: 'Invalid access token' });
  }
}

// --- Routes ---

router.post('/signup', async (req, res) => {
  try {
    const { email, password, cursorToken } = req.body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!cursorToken || typeof cursorToken !== 'string' || !cursorToken.trim()) {
      return res.status(400).json({ error: 'Cursor API token is required' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    const existing = db.findUserByEmail(trimmedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = db.createUser(trimmedEmail, passwordHash, cursorToken.trim());
    const tokens = issueTokens(userId, trimmedEmail);

    res.status(201).json(tokens);
  } catch (err) {
    console.error('[auth] signup error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = db.findUserByEmail(trimmedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokens = issueTokens(user.id, trimmedEmail);
    res.json(tokens);
  } catch (err) {
    console.error('[auth] signin error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const stored = db.findRefreshToken(refreshToken);
    if (!stored) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = db.findUserById(stored.user_id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Rotate: delete old, issue new
    db.deleteRefreshToken(refreshToken);
    const tokens = issueTokens(user.id, user.email);
    res.json(tokens);
  } catch (err) {
    console.error('[auth] refresh error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/signout', authenticateToken, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      db.deleteRefreshToken(refreshToken);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] signout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/signout-all', authenticateToken, (req, res) => {
  try {
    db.deleteAllUserRefreshTokens(req.user.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] signout-all error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/cursor-token', authenticateToken, (req, res) => {
  try {
    const { cursorToken } = req.body;
    if (!cursorToken || typeof cursorToken !== 'string' || !cursorToken.trim()) {
      return res.status(400).json({ error: 'Cursor API token is required' });
    }

    db.updateUserToken(req.user.userId, cursorToken.trim());
    res.json({ ok: true, message: 'Cursor token updated' });
  } catch (err) {
    console.error('[auth] cursor-token update error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, authenticateToken };
