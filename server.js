import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const DATASET_DIR = path.join(__dirname, 'dataset');
const TEMP_DIR = path.join(__dirname, '.tmp_uploads');
const VALID_SIGN_TYPES = ['sibi', 'bisindo'];

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Serve video files statically
app.use('/videos', express.static(DATASET_DIR));

// --- Helpers ---
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getMetadataPath(signType) {
  return path.join(DATASET_DIR, signType, 'metadata.json');
}

/**
 * Baca metadata. Kalau file rusak: coba pulihkan dari .bak, kalau tetap gagal
 * file rusaknya DISIMPAN (rename) supaya tidak ketimpa data kosong pada tulisan berikutnya.
 */
function readMetadata(signType) {
  const metaPath = getMetadataPath(signType);
  if (!fs.existsSync(metaPath)) return { labels: [], recordings: [] };
  try {
    const content = fs.readFileSync(metaPath, 'utf-8');
    if (!content.trim()) throw new Error('metadata.json kosong');
    const parsed = JSON.parse(content);
    if (!parsed || !Array.isArray(parsed.labels) || !Array.isArray(parsed.recordings)) {
      throw new Error('struktur metadata.json tidak valid');
    }
    return parsed;
  } catch (err) {
    console.error(`[metadata] ${signType} tidak terbaca:`, err.message);

    // 1) Coba backup terakhir
    const bakPath = `${metaPath}.bak`;
    if (fs.existsSync(bakPath)) {
      try {
        const bak = JSON.parse(fs.readFileSync(bakPath, 'utf-8'));
        if (Array.isArray(bak.labels) && Array.isArray(bak.recordings)) {
          console.warn(`[metadata] ${signType} dipulihkan dari backup (${bak.recordings.length} rekaman)`);
          return bak;
        }
      } catch (e) {
        console.error(`[metadata] backup ${signType} juga rusak:`, e.message);
      }
    }

    // 2) Simpan file rusak — JANGAN biarkan tertimpa data kosong
    try {
      const quarantine = `${metaPath}.corrupt-${Date.now()}`;
      fs.renameSync(metaPath, quarantine);
      console.error(`[metadata] file rusak dipindah ke ${path.basename(quarantine)} — periksa manual!`);
    } catch (e) {
      console.error('[metadata] gagal mengamankan file rusak:', e.message);
    }
    return { labels: [], recordings: [] };
  }
}

/** Tulis metadata secara atomik (tmp → rename) + simpan backup versi sebelumnya. */
function writeMetadata(signType, data) {
  const dir = path.join(DATASET_DIR, signType);
  ensureDir(dir);
  const metaPath = getMetadataPath(signType);
  const tmpPath = `${metaPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  // Backup versi lama dulu, baru timpa — kalau proses mati saat rename, .bak masih utuh
  if (fs.existsSync(metaPath)) {
    try { fs.copyFileSync(metaPath, `${metaPath}.bak`); } catch (e) {
      console.error(`[metadata] gagal membuat backup ${signType}:`, e.message);
    }
  }
  fs.renameSync(tmpPath, metaPath);
}

function safeMoveFile(src, dest) {
  if (!fs.existsSync(src)) return;
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
}

const LABEL_RE = /^[a-z0-9 -]+$/;

function normalizeLabel(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * Bangun path di dalam folder dataset dan pastikan hasilnya TIDAK keluar dari folder itu.
 * Tanpa ini, label seperti "../.." pada endpoint DELETE bisa menghapus folder di luar dataset.
 */
function datasetPath(...parts) {
  const root = path.resolve(DATASET_DIR);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Path di luar folder dataset ditolak');
  }
  return target;
}

// BUG-6 FIX: Validate signType to prevent path traversal
function validateSignType(req, res, next) {
  const { signType } = req.params;
  if (!VALID_SIGN_TYPES.includes(signType)) {
    return res.status(400).json({ error: `Invalid sign type: "${signType}". Must be "sibi" or "bisindo".` });
  }
  next();
}

// Initialize dataset folders
ensureDir(path.join(DATASET_DIR, 'sibi'));
ensureDir(path.join(DATASET_DIR, 'bisindo'));
ensureDir(TEMP_DIR);

// Sisa upload yang gagal/terputus menumpuk di .tmp_uploads — bersihkan saat start
try {
  const leftovers = fs.readdirSync(TEMP_DIR);
  for (const f of leftovers) {
    try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch { /* abaikan */ }
  }
  if (leftovers.length) console.log(`[start] ${leftovers.length} file upload terbengkalai dibersihkan`);
} catch { /* abaikan */ }

if (!fs.existsSync(getMetadataPath('sibi'))) writeMetadata('sibi', { labels: [], recordings: [] });
if (!fs.existsSync(getMetadataPath('bisindo'))) writeMetadata('bisindo', { labels: [], recordings: [] });

// BUG-1 FIX: Upload to temp directory first, then move after body is parsed
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(TEMP_DIR);
    cb(null, TEMP_DIR);
  },
  filename: (_req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `${id}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: {
    fieldSize: 25 * 1024 * 1024, // 25MB — landmark JSON for 500 frames can exceed default 1MB busboy limit
    fileSize: 50 * 1024 * 1024,  // 50MB video
  },
});

// ==================== API ROUTES ====================

// --- GET: Stats overview ---
app.get('/api/stats', (_req, res) => {
  const sibi = readMetadata('sibi');
  const bisindo = readMetadata('bisindo');
  res.json({
    sibi: { labels: sibi.labels.length, recordings: sibi.recordings.length },
    bisindo: { labels: bisindo.labels.length, recordings: bisindo.recordings.length },
    totalRecordings: sibi.recordings.length + bisindo.recordings.length,
  });
});

// --- GET: All labels for a sign type ---
app.get('/api/:signType/labels', validateSignType, (req, res) => {
  const { signType } = req.params;
  const meta = readMetadata(signType);
  res.json(meta.labels);
});

// --- POST: Add a label ---
app.post('/api/:signType/labels', validateSignType, (req, res) => {
  const { signType } = req.params;
  const { label } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Label is required' });

  // BUG-11 FIX: Validate label characters to prevent file system errors (no slashes, colons, etc)
  const normalized = label.trim().toLowerCase();
  if (!/^[a-z0-9 -]+$/.test(normalized)) {
    return res.status(400).json({ error: 'Label hanya boleh berisi huruf, angka, spasi, dan strip (-)' });
  }

  const meta = readMetadata(signType);
  if (meta.labels.includes(normalized)) return res.status(409).json({ error: 'Label already exists' });

  meta.labels.push(normalized);
  ensureDir(datasetPath(signType, normalized));
  writeMetadata(signType, meta);
  res.json({ success: true, labels: meta.labels });
});

// --- PUT: Rename a label ---
app.put('/api/:signType/labels/:oldLabel', validateSignType, (req, res) => {
  const { signType, oldLabel } = req.params;
  const { newLabel } = req.body;
  if (!newLabel || !newLabel.trim()) return res.status(400).json({ error: 'New label is required' });

  // BUG-11 FIX: Validate label characters to prevent file system errors
  const normalizedOld = normalizeLabel(oldLabel);
  const normalizedNew = normalizeLabel(newLabel);
  // Label lama ikut divalidasi — dipakai untuk fs.renameSync (rawan path traversal)
  if (!LABEL_RE.test(normalizedOld) || !LABEL_RE.test(normalizedNew)) {
    return res.status(400).json({ error: 'Label hanya boleh berisi huruf, angka, spasi, dan strip (-)' });
  }

  const meta = readMetadata(signType);
  const idx = meta.labels.indexOf(normalizedOld);
  if (idx === -1) return res.status(404).json({ error: 'Label not found' });
  if (meta.labels.includes(normalizedNew)) return res.status(409).json({ error: 'Target label already exists' });

  // Rename folder
  const oldDir = datasetPath(signType, normalizedOld);
  const newDir = datasetPath(signType, normalizedNew);
  if (fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir);

  // Update metadata
  meta.labels[idx] = normalizedNew;
  meta.recordings = meta.recordings.map(r =>
    r.label.trim().toLowerCase() === normalizedOld ? { ...r, label: normalizedNew } : r
  );
  writeMetadata(signType, meta);
  res.json({ success: true, labels: meta.labels });
});

// --- DELETE: Remove a label and all its recordings ---
app.delete('/api/:signType/labels/:label', validateSignType, (req, res) => {
  const { signType, label } = req.params;
  const normalizedLabel = normalizeLabel(label);
  // WAJIB divalidasi: nilai ini dipakai untuk fs.rmSync recursive.
  // Tanpa ini, label "../.." akan menghapus folder di luar dataset.
  if (!LABEL_RE.test(normalizedLabel)) {
    return res.status(400).json({ error: 'Label tidak valid' });
  }

  const meta = readMetadata(signType);
  meta.labels = meta.labels.filter(l => l !== normalizedLabel);
  meta.recordings = meta.recordings.filter(r => normalizeLabel(r.label) !== normalizedLabel);

  // Remove folder
  const dir = datasetPath(signType, normalizedLabel);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  writeMetadata(signType, meta);
  res.json({ success: true, labels: meta.labels });
});

// --- GET: All recordings for a sign type (optionally filter by label) ---
app.get('/api/:signType/recordings', validateSignType, (req, res) => {
  const { signType } = req.params;
  const { label } = req.query;
  const meta = readMetadata(signType);
  let recordings = meta.recordings;
  if (label) {
    const normalizedLabel = label.toString().trim().toLowerCase();
    recordings = recordings.filter(r => r.label.trim().toLowerCase() === normalizedLabel);
  }
  res.json(recordings);
});

// --- POST: Save a new recording (video + landmarks) ---
// BUG-1 FIX: Upload to temp dir first, then move to correct folder after body is fully parsed
// BUG-2 FIX: Check req.file is not null
app.post('/api/:signType/recordings', validateSignType, upload.single('video'), (req, res, next) => {
  const cleanupTemp = () => {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch { /* abaikan */ }
    }
  };

  try {
    const { signType } = req.params;
    const { label, landmarks, frameCount, signerTag, handDetectionRate } = req.body;

    if (!label) {
      cleanupTemp();
      return res.status(400).json({ error: 'Label is required' });
    }

    // BUG FIX: Prevent path traversal in label from multipart form-data
    const normalizedLabel = normalizeLabel(label);
    if (!LABEL_RE.test(normalizedLabel)) {
      cleanupTemp();
      return res.status(400).json({ error: 'Label invalid' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    const meta = readMetadata(signType);

    // Ensure the label is added to labels if not exists
    if (!meta.labels.includes(normalizedLabel)) {
      meta.labels.push(normalizedLabel);
    }

    const videoFile = req.file;
    const id = path.basename(videoFile.filename, path.extname(videoFile.filename));

    // Move video from temp to correct destination folder
    const destDir = datasetPath(signType, normalizedLabel);
    ensureDir(destDir);
    const destVideoPath = path.join(destDir, videoFile.filename);
    safeMoveFile(videoFile.path, destVideoPath);

    // Save landmarks JSON
    if (landmarks) {
      const landmarkFilename = `${id}_landmarks.json`;
      const landmarkPath = path.join(destDir, landmarkFilename);
      fs.writeFileSync(landmarkPath, landmarks);
    }

    const parsedHandDetectionRate = Math.min(parseFloat(handDetectionRate) || 0, 1.0);
    const quality = parsedHandDetectionRate >= 0.7 ? 'good' : parsedHandDetectionRate >= 0.4 ? 'fair' : 'poor';

    const recording = {
      id,
      label: normalizedLabel,
      signType,
      videoFile: videoFile.filename,
      landmarkFile: landmarks ? `${id}_landmarks.json` : null,
      frameCount: parseInt(frameCount) || 0,
      signerTag: (signerTag || '').trim(),
      handDetectionRate: parsedHandDetectionRate,
      quality,
      createdAt: new Date().toISOString(),
    };

    meta.recordings.push(recording);
    writeMetadata(signType, meta);
    res.json({ success: true, recording });
  } catch (err) {
    cleanupTemp();
    next(err);
  }
});

// --- PUT: Update a recording's label or signType ---
app.put('/api/:signType/recordings/:id', validateSignType, (req, res) => {
  const { signType, id } = req.params;
  const { newLabel, newSignType } = req.body;

  // Validate newSignType if provided
  if (newSignType && !VALID_SIGN_TYPES.includes(newSignType)) {
    return res.status(400).json({ error: `Invalid target sign type: "${newSignType}"` });
  }

  // Normalize target newLabel if provided
  let normalizedNewLabel = undefined;
  if (newLabel) {
    normalizedNewLabel = newLabel.trim().toLowerCase();
    if (!/^[a-z0-9 -]+$/.test(normalizedNewLabel)) {
      return res.status(400).json({ error: 'Target label invalid' });
    }
  }

  const meta = readMetadata(signType);
  const recIdx = meta.recordings.findIndex(r => r.id === id);
  if (recIdx === -1) return res.status(404).json({ error: 'Recording not found' });

  const rec = meta.recordings[recIdx];
  const oldLabelNormalized = normalizeLabel(rec.label);
  const targetSignType = newSignType || signType;
  const targetLabel = normalizedNewLabel || oldLabelNormalized;
  if (!LABEL_RE.test(oldLabelNormalized) || !LABEL_RE.test(targetLabel)) {
    return res.status(400).json({ error: 'Label pada rekaman ini tidak valid' });
  }
  const oldDir = datasetPath(signType, oldLabelNormalized);
  const newDir = datasetPath(targetSignType, targetLabel);
  ensureDir(newDir);

  // Move video file
  const oldVideoPath = path.join(oldDir, rec.videoFile);
  const newVideoPath = path.join(newDir, rec.videoFile);
  safeMoveFile(oldVideoPath, newVideoPath);

  // Move landmark file
  if (rec.landmarkFile) {
    const oldLmPath = path.join(oldDir, rec.landmarkFile);
    const newLmPath = path.join(newDir, rec.landmarkFile);
    safeMoveFile(oldLmPath, newLmPath);
  }

  // Update metadata
  const updatedRec = { ...rec, label: targetLabel, signType: targetSignType };

  if (targetSignType !== signType) {
    // Pindah tipe: tulis metadata TUJUAN dulu, baru hapus dari asal.
    // Kalau gagal di tengah, rekaman terdaftar dobel (masih bisa dibetulkan)
    // — bukannya hilang dari kedua metadata.
    const targetMeta = readMetadata(targetSignType);
    targetMeta.recordings.push(updatedRec);
    if (!targetMeta.labels.includes(targetLabel)) targetMeta.labels.push(targetLabel);
    writeMetadata(targetSignType, targetMeta);

    meta.recordings.splice(recIdx, 1);
    writeMetadata(signType, meta);
  } else {
    meta.recordings[recIdx] = updatedRec;
    if (!meta.labels.includes(targetLabel)) {
      meta.labels.push(targetLabel);
    }
    writeMetadata(signType, meta);
  }

  res.json({ success: true, recording: updatedRec });
});

// --- DELETE: Remove a recording ---
app.delete('/api/:signType/recordings/:id', validateSignType, (req, res) => {
  const { signType, id } = req.params;
  const meta = readMetadata(signType);
  const recIdx = meta.recordings.findIndex(r => r.id === id);
  if (recIdx === -1) return res.status(404).json({ error: 'Recording not found' });

  const rec = meta.recordings[recIdx];
  const recLabel = normalizeLabel(rec.label);
  if (!LABEL_RE.test(recLabel)) {
    return res.status(400).json({ error: 'Label pada rekaman ini tidak valid' });
  }
  const dir = datasetPath(signType, recLabel);

  // Delete files
  const videoPath = path.join(dir, rec.videoFile);
  if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  if (rec.landmarkFile) {
    const lmPath = path.join(dir, rec.landmarkFile);
    if (fs.existsSync(lmPath)) fs.unlinkSync(lmPath);
  }

  meta.recordings.splice(recIdx, 1);
  writeMetadata(signType, meta);
  res.json({ success: true });
});

// --- GET: Export dataset as ZIP (video + landmark files) ---
app.get('/api/export/zip', (_req, res) => {
  const filename = `dataset-${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => { console.error('ZIP error:', err); res.destroy(); });
  archive.pipe(res);
  archive.directory(DATASET_DIR, 'dataset');
  archive.finalize();
});

// --- GET: Export metadata as JSON ---
app.get('/api/export', (_req, res) => {
  const sibi = readMetadata('sibi');
  const bisindo = readMetadata('bisindo');
  res.json({
    exportedAt: new Date().toISOString(),
    sibi,
    bisindo,
  });
});

// --- Error handler: SELALU balas JSON ---
// Tanpa ini Express membalas halaman HTML saat error (mis. file kelewat besar),
// lalu res.json() di frontend gagal parse → user cuma lihat "Gagal menyimpan".
app.use((err, req, res, _next) => {
  console.error(`[api] ${req.method} ${req.originalUrl} gagal:`, err);
  if (res.headersSent) return;
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Video terlalu besar (maksimal 50MB)' });
  }
  if (err && err.code === 'LIMIT_FIELD_VALUE') {
    return res.status(413).json({ error: 'Data landmark terlalu besar (maksimal 25MB)' });
  }
  // Hormati status dari error bawaan Express (mis. JSON tidak valid = 400)
  const status = Number(err?.status || err?.statusCode) || 500;
  res.status(status).json({ error: err?.message || 'Terjadi kesalahan di server' });
});

app.listen(PORT, () => {
  console.log(`\n  🤟 SignLang Collector API running at http://localhost:${PORT}\n`);
});
