const express = require('express');
const SftpClient = require('ssh2-sftp-client');
const cors = require('cors');
const sharp = require('sharp');
const NodeCache = require('node-cache');
const multer = require('multer');
const mime = require('mime-types');
const path = require('path');
const { Readable } = require('stream');

const app = express();
const cache = new NodeCache({ stdTTL: 3600, maxKeys: 500 });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

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

// List directory
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

// Thumbnail for images (low-res preview)
app.get('/api/thumbnail', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });

  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext) || ext === '.svg') {
    return res.status(400).json({ error: 'Not an image' });
  }

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

// Download file
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
    stream.on('error', (err) => res.status(500).end());
    res.on('finish', () => sftp.end());
  } catch (err) {
    if (sftp) sftp.end();
    res.status(500).json({ error: err.message });
  }
});

// Upload file
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

// Delete file or directory
app.delete('/api/delete', async (req, res) => {
  const { path: filePath, type } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });
  let sftp;
  try {
    sftp = await getSftp(req);
    if (type === 'directory') {
      await sftp.rmdir(filePath, true);
    } else {
      await sftp.delete(filePath);
    }
    cache.del(`thumb_${filePath}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (sftp) sftp.end();
  }
});

// Move/rename
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

// Copy file
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

// Create folder
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

// Auth check — verifica che la password SFTP sia corretta
app.get('/api/auth', async (req, res) => {
  let sftp;
  try {
    sftp = await getSftp(req);
    await sftp.list('/');
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ success: false, error: 'Password non valida' });
  } finally {
    if (sftp) sftp.end();
  }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '/frontend/dist')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, '/frontend/dist/index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
