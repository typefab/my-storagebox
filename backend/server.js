const express = require('express');
const SftpClient = require('ssh2-sftp-client');
const cors = require('cors');
const sharp = require('sharp');
const NodeCache = require('node-cache');
const multer = require('multer');
const mime = require('mime-types');
const path = require('path');
const { Readable } = require('stream');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const cache = new NodeCache({ stdTTL: 3600, maxKeys: 500 });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// --- Security headers ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// --- Telegram ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message, silent = false) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_notification: silent,
      }),
    });
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

function formatDate() {
  return new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
}

// --- Log in memoria (ultimi 200 accessi) ---
const accessLog = [];
function addLog(entry) {
  accessLog.unshift({ ...entry, time: formatDate() });
  if (accessLog.length > 200) accessLog.pop();
}

// --- Tracking tentativi falliti per IP ---
const failedAttempts = new Map();

function recordFail(ip) {
  const prev = failedAttempts.get(ip) || { count: 0, firstAt: Date.now() };
  // Reset se sono passati più di 15 minuti
  if (Date.now() - prev.firstAt > 15 * 60 * 1000) {
    failedAttempts.set(ip, { count: 1, firstAt: Date.now() });
    return 1;
  }
  const count = prev.count + 1;
  failedAttempts.set(ip, { ...prev, count });
  return count;
}

function resetFail(ip) {
  failedAttempts.delete(ip);
}

// --- Rate limiter globale (max 60 req/min per IP) ---
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = getIp(req);
    sendTelegram(`⚠️ <b>Rate limit superato</b>\n🌐 IP: <code>${ip}</code>\n🕐 ${formatDate()}`, false);
    res.status(429).json({ error: 'Troppe richieste, riprova tra un minuto.' });
  }
}));

// --- Rate limiter stretto solo su /api/auth (max 5 tentativi/5min) ---
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = getIp(req);
    sendTelegram(`🚨 <b>Troppi tentativi di login!</b>\n🌐 IP: <code>${ip}</code>\n🔒 IP bloccato per 5 minuti\n🕐 ${formatDate()}`, false);
    res.status(429).json({ error: 'Troppi tentativi. Riprova tra 5 minuti.' });
  }
});

// --- SFTP helpers ---
function getSftpConfig(req) {
  const password = req.headers['x-sftp-password'];
  if (!password) throw new Error('Password mancante');
  return {
    host: process.env.SFTP_HOST,
    port: parseInt(process.env.SFTP_PORT || '23'),
    username: process.env.SFTP_USER,
    password,
    readyTimeout: 20000,
    retries: 3,
    retry_factor: 2,
    retry_minTimeout: 2000,
  };
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a'];
const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'];
const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (DOC_EXTENSIONS.includes(ext)) return 'document';
  if (ARCHIVE_EXTENSIONS.includes(ext)) return 'archive';
  return 'file';
}

async function getSftp(req) {
  const sftp = new SftpClient();
  await sftp.connect(getSftpConfig(req));
  return sftp;
}

// --- AUTH con log e notifiche ---
app.get('/api/auth', authLimiter, async (req, res) => {
  const ip = getIp(req);
  let sftp;
  try {
    sftp = await getSftp(req);
    await sftp.list('/');

    // Login riuscito
    resetFail(ip);
    addLog({ ip, success: true });
    sendTelegram(`✅ <b>Accesso riuscito</b>\n🌐 IP: <code>${ip}</code>\n🕐 ${formatDate()}`, true); // silenzioso
    res.json({ success: true });
  } catch (err) {
    // Login fallito
    const attempts = recordFail(ip);
    addLog({ ip, success: false, attempts });

    if (attempts >= 3) {
      sendTelegram(`🚨 <b>ATTENZIONE: ${attempts} tentativi falliti!</b>\n🌐 IP: <code>${ip}</code>\n🕐 ${formatDate()}\n\nQualcuno sta cercando di entrare nel tuo Drive!`, false);
    } else {
      sendTelegram(`❌ <b>Tentativo di login fallito</b> (${attempts}/3)\n🌐 IP: <code>${ip}</code>\n🕐 ${formatDate()}`, true);
    }

    res.status(401).json({ success: false, error: 'Password non valida' });
  } finally {
    if (sftp) sftp.end();
  }
});

// --- Log viewer (protetto da password) ---
app.get('/api/logs', (req, res) => {
  const pw = req.headers['x-sftp-password'];
  if (!pw) return res.status(401).json({ error: 'Non autorizzato' });
  // Usiamo la stessa password SFTP come protezione
  res.json({ logs: accessLog });
});

// --- Tutte le altre API ---

app.get('/api/list', async (req, res) => {
  const dirPath = req.query.path || '/';
  let sftp;
  try {
    sftp = await getSftp(req);
    const list = await sftp.list(dirPath);
    const files = list.map(f => ({
      name: f.name,
      type: f.type === 'd' ? 'directory' : getFileType(f.name),
      size: f.size,
      modified: f.modifyTime,
      path: path.posix.join(dirPath, f.name),
    })).sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ success: true, path: dirPath, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (sftp) sftp.end();
  }
});

app.get('/api/thumbnail', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });
  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext) || ext === '.svg') return res.status(400).json({ error: 'Not an image' });

  const cacheKey = `thumb_${filePath}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(cached);
  }
  let sftp;
  try {
    sftp = await getSftp(req);
    const buffer = await sftp.get(filePath);
    const thumbnail = await sharp(buffer)
      .resize(240, 240, { fit: 'cover', position: 'centre' })
      .webp({ quality: 60 })
      .toBuffer();
    cache.set(cacheKey, thumbnail);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(thumbnail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (sftp) sftp.end();
  }
});

app.get('/api/download', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });
  let sftp;
  try {
    sftp = await getSftp(req);
    const filename = path.basename(filePath);
    const mimeType = mime.lookup(filename) || 'application/octet-stream';
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', mimeType);
    const stream = sftp.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => res.status(500).end());
    res.on('finish', () => sftp.end());
  } catch (err) {
    if (sftp) sftp.end();
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  const dirPath = req.body.path || '/';
  if (!req.file) return res.status(400).json({ error: 'No file' });
  let sftp;
  try {
    sftp = await getSftp(req);
    const destPath = path.posix.join(dirPath, req.file.originalname);
    const readable = Readable.from(req.file.buffer);
    await sftp.put(readable, destPath);
    res.json({ success: true, path: destPath });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (sftp) sftp.end();
  }
});

app.delete('/api/delete', async (req, res) => {
  const { path: filePath, type } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });
  let sftp;
  try {
    sftp = await getSftp(req);
    if (type === 'directory') await sftp.rmdir(filePath, true);
    else await sftp.delete(filePath);
    cache.del(`thumb_${filePath}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (sftp) sftp.end();
  }
});

app.post('/api/move', async (req, res) => {
  const { src, dest } = req.body;
  if (!src || !dest) return res.status(400).json({ error: 'Missing src or dest' });
  let sftp;
  try {
    sftp = await getSftp(req);
    await sftp.rename(src, dest);
    cache.del(`thumb_${src}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (sftp) sftp.end();
  }
});

app.post('/api/copy', async (req, res) => {
  const { src, dest } = req.body;
  if (!src || !dest) return res.status(400).json({ error: 'Missing src or dest' });
  let sftp;
  try {
    sftp = await getSftp(req);
    const buffer = await sftp.get(src);
    const readable = Readable.from(buffer);
    await sftp.put(readable, dest);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (sftp) sftp.end();
  }
});

app.post('/api/mkdir', async (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ error: 'Missing path' });
  let sftp;
  try {
    sftp = await getSftp(req);
    await sftp.mkdir(dirPath, true);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (sftp) sftp.end();
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'frontend/dist')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'frontend/dist/index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  sendTelegram(`🚀 <b>Server avviato</b>\n🕐 ${formatDate()}`, true);
});
