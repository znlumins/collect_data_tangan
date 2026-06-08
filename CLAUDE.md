# SignLang Collector — CLAUDE.md

## Project Overview

Web app untuk **mengumpulkan dataset bahasa isyarat** (SIBI & BISINDO) sebagai bahan training model AI. Dataset yang dikumpulkan di sini akan digunakan untuk melatih model di project **VERO** (platform LMS inklusif untuk penyandang tunarungu/tunawicara, PKM-KC Universitas Brawijaya).

**Stack:** React + Vite (frontend) · Express.js (backend) · MediaPipe Holistic (landmark detection)  
**Storage:** Lokal — video `.webm` + landmark `.json` disimpan di folder `dataset/`

---

## Cara Menjalankan

```bash
npm run dev        # Start keduanya: Vite (http://localhost:5173) + Express (http://localhost:3001)
npm run dev:client # Hanya frontend
npm run dev:server # Hanya backend
npm run build      # Build production
```

Vite mem-proxy semua request `/api/*` ke `http://localhost:3001` (lihat `vite.config.ts`).

---

## Arsitektur

```
Browser (localhost:5173)
  └── React + Vite
        ├── App.tsx          — root state: signType, selectedLabel, labels, stats
        ├── LabelManager.tsx — sidebar: pilih SIBI/BISINDO, CRUD labels
        ├── WebCamRecorder.tsx — rekam 500 frame + MediaPipe landmark
        └── DatasetList.tsx  — tabel rekaman, edit label, hapus

Express (localhost:3001)
  └── server.js
        ├── /api/stats
        ├── /api/:signType/labels    (GET/POST/PUT/DELETE)
        ├── /api/:signType/recordings (GET/POST/PUT/DELETE)
        └── /api/export
```

---

## Struktur Dataset

```
dataset/
├── sibi/
│   ├── metadata.json          # { labels: string[], recordings: Recording[] }
│   └── <label>/
│       ├── <uuid>.webm        # video rekaman
│       └── <uuid>_landmarks.json  # landmark per frame
└── bisindo/
    └── (sama)
```

### Format Landmark JSON (`<uuid>_landmarks.json`)

Array of `LandmarkFrame`:

```json
[
  {
    "frame": 0,
    "timestamp": 1720000000000,
    "leftHand":      [{"x": 0.5, "y": 0.3, "z": -0.02, "visibility": 0.99}, ...],
    "leftHandWorld": [{"x": 0.01, "y": -0.05, "z": 0.00}, ...],
    "rightHand":      [...],
    "rightHandWorld": [...],
    "pose":      [...],
    "poseWorld": [...]
  },
  ...
]
```

| Field | Keterangan |
|-------|-----------|
| `leftHand` / `rightHand` | 21 landmarks tangan, koordinat **image-normalized** (0–1) |
| `leftHandWorld` / `rightHandWorld` | 21 landmarks **3D dunia** (meter, relative to palm) — scale-invariant |
| `pose` / `poseWorld` | 33 landmarks pose tubuh |
| `visibility` | Confidence score MediaPipe (0–1), ada di pose & hands |

**World landmarks** sangat berguna untuk training karena scale-invariant — tidak terpengaruh jarak ke kamera.

---

## API Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/stats` | Jumlah labels & recordings per type |
| GET | `/api/:type/labels` | Daftar label |
| POST | `/api/:type/labels` | Tambah label |
| PUT | `/api/:type/labels/:old` | Rename label |
| DELETE | `/api/:type/labels/:label` | Hapus label + semua rekamannya |
| GET | `/api/:type/recordings` | Semua rekaman (filter `?label=`) |
| POST | `/api/:type/recordings` | Upload video + landmarks (multipart) |
| PUT | `/api/:type/recordings/:id` | Pindah label/tipe |
| DELETE | `/api/:type/recordings/:id` | Hapus rekaman |
| GET | `/api/export` | Export metadata SIBI+BISINDO sebagai JSON |

`:type` harus `sibi` atau `bisindo`.

---

## Recording Flow (500 Frame)

1. User pilih label → klik **Rekam**
2. Countdown 3..2..1 (`setInterval` 1s)
3. `MediaRecorder.start(100)` — video di-buffer tiap 100ms
4. **Timer frame counter** (`setInterval` 33ms) mulai counting (independent dari MediaPipe)
5. MediaPipe Holistic berjalan async, collect landmark tiap frame yang bisa diproses
6. Setelah 500 tick timer → `stopRecording()` → `MediaRecorder.stop()`
7. `onstop` → `handleSave()` → POST multipart ke server
8. Server simpan `.webm` + `_landmarks.json`

**Penting:** Frame counter menggunakan timer (33ms interval = 30fps), bukan menghitung `onResults` MediaPipe. Ini memastikan recording **selalu selesai dalam ~16.5 detik** tanpa bergantung kecepatan MediaPipe di device.

---

## Bug Penting yang Sudah Diperbaiki

### Bug Kritis: 500 Frame Tidak Tersimpan
**Root cause:** Landmark JSON untuk 500 frame (~1.7–2MB) melampaui **batas default busboy/multer 1MB per field**. Upload gagal silent.

**Fix:** `multer({ limits: { fieldSize: 25 * 1024 * 1024 } })` di `server.js`.

### Bug: Frame Counter Bergantung MediaPipe
**Root cause:** `onResults` hanya dipanggil saat MediaPipe selesai memproses frame. Di laptop tanpa GPU, bisa 3–8fps, jadi 500 frame butuh 60–150 detik.

**Fix:** Gunakan `setInterval(33ms)` sebagai frame counter. MediaPipe tetap jalan untuk collect landmarks, tapi recording stop-nya ditentukan timer.

---

## Koneksi ke VERO (LMS Project)

Project ini adalah **data collection tool** untuk VERO. Flow lengkap:

```
collect_data_tangan (project ini)
  ↓ Dataset: dataset/sibi/ + dataset/bisindo/
  ↓ Format: video .webm + landmark .json

Training (Python)
  ↓ Load landmark JSON
  ↓ Feature extraction (pose 33×4 + hands 21×3 × 2 = 258 features/frame)
  ↓ Train LSTM/Transformer sequence model
  ↓ Export ke TensorFlow.js format (model.json + .bin)

VERO LMS (project terpisah)
  ↓ Load model.json via TF.js
  ↓ MediaPipe Hands (real-time)
  ↓ Prediksi gesture → terjemahan SIBI/BISINDO
```

### Feature Extraction untuk Training

Dari setiap `LandmarkFrame`, features yang direkomendasikan:
- `pose[0..32]` × 4 (x, y, z, visibility) = 132 values
- `leftHand[0..20]` × 3 (x, y, z) = 63 values  
- `rightHand[0..20]` × 3 = 63 values
- **Total per frame: 258 features**
- **Per sample: 500 × 258 = 129,000 values** → shape `(500, 258)`

Gunakan `poseWorld`/`leftHandWorld`/`rightHandWorld` untuk features yang lebih robust.

---

## Catatan Pengembangan

### MediaPipe CDN
Script dimuat dari jsDelivr via `index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/holistic.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js"></script>
```
`window.Holistic`, `window.drawConnectors`, `window.HAND_CONNECTIONS`, dll. diakses via `(window as any)`.

### Fallback HAND_CONNECTIONS
`window.HAND_CONNECTIONS` kadang tidak ter-inject oleh CDN. Ada static fallback array di `WebCamRecorder.tsx` baris ~258.

### Label Validation
Label hanya boleh: huruf (a-z), angka, spasi, strip (-). Regex: `/^[a-z0-9 -]+$/`. Ini berlaku di frontend DAN backend untuk mencegah path traversal.

### modelComplexity
Default `1`. Jika MediaPipe terlalu lambat di device target, bisa di-set ke `0` di `WebCamRecorder.tsx` baris ~165 untuk 2–3× speedup dengan sedikit penurunan akurasi.

### Multer Limits
`fieldSize: 25MB` untuk landmark JSON. `fileSize: 50MB` untuk video. Jangan turunkan — landmark 500 frame bisa 2–4MB.
