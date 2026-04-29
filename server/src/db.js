const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'agent.db');
const ENC_KEY_PATH = path.join(DATA_DIR, 'encryption.key');
const JWT_SECRET_PATH = path.join(DATA_DIR, 'jwt.secret');

let db = null;
let encryptionKey = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadOrCreateKey(filePath, bytes) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath);
  }
  const key = crypto.randomBytes(bytes);
  fs.writeFileSync(filePath, key, { mode: 0o600 });
  return key;
}

function initDb() {
  ensureDataDir();
  encryptionKey = loadOrCreateKey(ENC_KEY_PATH, 32);

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      cursor_token_encrypted TEXT NOT NULL,
      cursor_token_iv TEXT NOT NULL,
      cursor_token_tag TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
  `);

  // Periodic cleanup of expired refresh tokens
  cleanupExpiredTokens();
  setInterval(cleanupExpiredTokens, 60 * 60 * 1000); // every hour

  return db;
}

function cleanupExpiredTokens() {
  if (!db) return;
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(now);
}

// --- Encryption helpers ---

function encryptToken(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag,
  };
}

function decryptToken(encrypted, ivHex, tagHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// --- User operations ---

function createUser(email, passwordHash, cursorToken) {
  const id = uuidv4();
  const { encrypted, iv, tag } = encryptToken(cursorToken);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, cursor_token_encrypted, cursor_token_iv, cursor_token_tag)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, email, passwordHash, encrypted, iv, tag);
  return id;
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserToken(userId) {
  const user = findUserById(userId);
  if (!user) return null;
  return decryptToken(user.cursor_token_encrypted, user.cursor_token_iv, user.cursor_token_tag);
}

function updateUserToken(userId, cursorToken) {
  const { encrypted, iv, tag } = encryptToken(cursorToken);
  db.prepare(`
    UPDATE users SET cursor_token_encrypted = ?, cursor_token_iv = ?, cursor_token_tag = ?
    WHERE id = ?
  `).run(encrypted, iv, tag, userId);
}

// --- Refresh token operations ---

function storeRefreshToken(userId, rawToken, expiresInSeconds) {
  const id = uuidv4();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, tokenHash, expiresAt);
}

function findRefreshToken(rawToken) {
  const tokenHash = hashRefreshToken(rawToken);
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > ?
  `).get(tokenHash, now);
}

function deleteRefreshToken(rawToken) {
  const tokenHash = hashRefreshToken(rawToken);
  db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);
}

function deleteAllUserRefreshTokens(userId) {
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

// --- JWT secret ---

function getJwtSecret() {
  ensureDataDir();
  return loadOrCreateKey(JWT_SECRET_PATH, 64).toString('hex');
}

// --- Shutdown ---

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDb,
  closeDb,
  createUser,
  findUserByEmail,
  findUserById,
  getUserToken,
  updateUserToken,
  storeRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteAllUserRefreshTokens,
  getJwtSecret,
};
