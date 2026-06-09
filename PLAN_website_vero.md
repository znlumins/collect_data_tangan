# Plan Website VERO — Roadmap ke PIMNAS
**Project:** VERO — Inclusive Learning Management System  
**Tim:** PKM-KC Universitas Brawijaya  
**Stack:** Next.js + Golang + MySQL + MediaPipe + TF.js + PeerJS  
**Infrastruktur:** VPS Kampus (Proxmox, Xeon 8 core, 16GB RAM) → VPS Berbayar pasca PIMNAS  
**Dibuat:** 2026-06-08  

---

## Status Saat Ini
- [x] Next.js project sudah ada (tapi masih polosan)
- [x] PRD sudah lengkap
- [x] collect_data_tangan — **SIAP PAKAI PENUH** (lihat fitur di bawah)
- [ ] Data rekaman — **PERLU RETAKE** (2 rekaman lama: 64 & 500 frame, tanpa quality metadata)
- [ ] Database schema belum final
- [ ] Golang backend belum ada
- [ ] Deployment ke VPS kampus belum dilakukan
- [ ] Model AI belum dilatih

### Fitur collect_data_tangan yang Sudah Selesai (2026-06-09)
| Fitur | Detail |
|-------|--------|
| Frame per tipe | SIBI = 100 frame, BISINDO = 300 frame |
| Batch recording | Pilih 1×/3×/5×/10×/20×/30×/50× — rekam otomatis berulang |
| Warmup detection | Countdown tunggu tangan terdeteksi, cegah rekaman kosong |
| Quality score | `handDetectionRate` (0–1) + `quality` (good/fair/poor) per rekaman |
| Signer tag | Kode perekam tersimpan di localStorage, ikut metadata |
| Per-label progress | Progress bar + `count/target` di sidebar, target bisa diubah |
| Spacebar shortcut | Tekan Space untuk rekam/stop/batal tanpa klik |
| Auto-lanjut label | Setelah batch selesai otomatis pindah ke label berikutnya |
| Quality filter | Filter DatasetList by good/fair/poor untuk identifikasi data buruk |
| Pagination | 20 rekaman/halaman, cegah browser crash saat 500+ rekaman |
| Download ZIP | Satu klik download seluruh dataset (video + JSON landmark) untuk Colab |

---

## Arsitektur Sistem Final

```
┌─────────────────────────────────────────────────────────┐
│  Browser (User)                                          │
│  ├── Next.js React Pages (UI)                           │
│  ├── MediaPipe Holistic (client-side, no server)        │
│  └── TF.js Model SIBI/BISINDO (client-side inference)   │
└────────────┬────────────────────────────┬───────────────┘
             │ HTTP/WebSocket             │ WebRTC P2P
             ▼                            ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│  VPS Kampus             │   │  PeerJS (awal: public)   │
│  Nginx (reverse proxy)  │   │  → Golang signaling      │
│                         │   │    (setelah PIMNAS)      │
│  ├── Next.js :3000      │   └──────────────────────────┘
│  │   └── Prisma → MySQL │
│  │                      │
│  └── Golang :8080/:8081 │         ┌─────────────────┐
│      ├── WebRTC signal  │◄────────┤  ESP32-S3       │
│      └── IoT MQTT/WS    │  MQTT/  │  + MAX98357A    │
│                         │  WebSocket  (audio output) │
│  MySQL :3306 (internal) │         └─────────────────┘
└─────────────────────────┘
```

---

## Phase 1 — Fondasi (Minggu 1–2)
*Target: App bisa jalan di VPS kampus, fitur dasar berfungsi*

### [ ] 1.1 Setup VPS Kampus
```bash
# Di Proxmox: buat LXC Container
Type:    LXC (Ubuntu 22.04)
CPU:     2 core
RAM:     3 GB
Storage: 20 GB
Network: Bridge LAN kampus

# Di dalam container:
apt install docker.io docker-compose nginx
```

### [ ] 1.2 Database Schema (Prisma)
Finalisasi schema sebelum mulai coding fitur:
```prisma
model User        { id, name, email, role, nim/nip, avatar }
model Class       { id, name, code, teacherId, members[] }
model Schedule    { id, classId, date, startTime, endTime, isLive }
model Attendance  { id, scheduleId, userId, status, timestamp }
model Assignment  { id, classId, title, deadline, submissions[] }
model Announcement{ id, title, content, authorId, category, createdAt }
model Notification{ id, userId, message, isRead, createdAt }
model Meeting     { id, classId, scheduleId, participants[] }
```

### [ ] 1.3 Auth System
- Register: email + password + role (MAHASISWA/DOSEN) + NIM/NIP
- Login: JWT atau session di localStorage
- Middleware protect route per role
- Prisma + bcrypt (sudah ada di PRD)

### [ ] 1.4 Dashboard Dasar
- MAHASISWA: stats kehadiran + daftar tugas aktif
- DOSEN: jumlah kelas + total mahasiswa
- ADMIN: overview sistem

### [ ] 1.5 Docker Compose untuk VPS
```yaml
services:
  nginx:     image: nginx:alpine
  nextjs:    build: ./vero-web
  mysql:     image: mysql:8.0
```

---

## Phase 2 — Fitur Akademik (Minggu 3–4)
*Target: Dosen bisa buat kelas, mahasiswa bisa join dan absensi*

### [ ] 2.1 Modul Kelas
- Dosen: buat kelas → generate kode unik 6 digit
- Mahasiswa: join dengan kode
- Detail kelas: tab Forum, Materi, Jadwal, Anggota

### [ ] 2.2 Jadwal & Live Indicator
- Dosen buat jadwal (tanggal, jam mulai, jam selesai)
- Status "LIVE" otomatis muncul saat waktu sesuai (cek tiap 1 menit)
- Tombol "Join Meeting" aktif saat jadwal live

### [ ] 2.3 Absensi
- Dosen buka/tutup sesi presensi
- Mahasiswa konfirmasi: Hadir Luring / Hadir Daring / Izin
- Rekap kehadiran: warna hijau ≥80%, kuning ≥50%, merah <50%

### [ ] 2.4 Tugas
- Dosen buat tugas + deadline
- Mahasiswa lihat dan kumpulkan tugas
- Status: Belum Kumpul / Sudah Kumpul

---

## Phase 3 — AI Sign Language (Minggu 3–5, Paralel)
*Target: Model terlatih dan terintegrasi di Studio VERO*

### [ ] 3.1 Training Data (paralel dengan Phase 1–2)

**Langkah pertama — Retake 2 rekaman lama:**
```
Buka collect_data_tangan → tab Dataset → hapus 2 rekaman "aku" yang ada
(64 frame & 500 frame, tanpa quality metadata — tidak valid untuk training)
Rekam ulang dengan setting baru: SIBI = 100 frame, signer tag diisi
```

**Target data minimum sebelum training:**
| Tipe | Label | Sampel/label | Penanda tangan | Total |
|------|-------|-------------|----------------|-------|
| SIBI | 26 huruf (A–Z) | 30 | ≥ 3 orang | 780 |
| BISINDO | 20 kata umum | 30 | ≥ 3 orang | 600 |

**Standar kualitas rekaman yang masuk training:**
- `quality = good` → `handDetectionRate ≥ 0.70` ✅ masuk training
- `quality = fair` → `handDetectionRate 0.40–0.69` ⚠️ masuk jika kekurangan data
- `quality = poor` → `handDetectionRate < 0.40` ❌ hapus, rekam ulang

**Strategi signer untuk generalisasi model:**
```
Signer s001, s002 (anggota tim dengar) → 20 sampel/label
Signer s003, s004 (teman tuli/tunawicara) → 10 sampel/label
→ Total 30 sampel/label dari background berbeda
→ Waktu training: split by signer (train s001+s002+s003, test s004)
   ini ukur apakah model general ke orang yang belum pernah dilihat model
```

**Kenapa libatkan tunarungu/tunawicara:**
Gestur SIBI/BISINDO yang dipelajari orang dengar sering berbeda tempo,
artikulasi, dan variasi dibanding pengguna asli. Model yang hanya belajar
dari orang dengar bisa tidak akurat untuk pengguna target VERO.

**Workflow koleksi data (2 laptop):**
```
Laptop 1 (kamu): signer tag = s001
Laptop 2 (teman): signer tag = s002
→ Masing-masing rekam 15 sampel/label × 26 huruf = 390 rekaman
→ Gabung: copy folder dataset/ dari laptop 2 ke laptop 1
  (atau pakai VPS kampus sebagai storage bersama)
→ Klik "Download ZIP" → upload ke Google Drive → buka di Colab
```

### [ ] 3.2 Training Script (Google Colab / VPS Kampus)

**Setup Google Colab:**
```python
# Install dependencies
!pip install tensorflow tensorflowjs numpy scikit-learn

# Mount Google Drive (untuk simpan model)
from google.colab import drive
drive.mount('/content/drive')
```

**Feature Extraction dari Landmark JSON:**
```python
import json
import numpy as np

def extract_features(landmark_frames, target_frames=100):
    """
    Input:  list of LandmarkFrame dari _landmarks.json
    Output: numpy array shape (target_frames, 258)
    
    258 features = pose(132) + leftHand(63) + rightHand(63)
    """
    features = []
    
    for frame in landmark_frames:
        f = []
        
        # Pose: 33 landmarks × 4 (x, y, z, visibility) = 132
        if frame['pose']:
            for lm in frame['pose']:
                f.extend([lm['x'], lm['y'], lm['z'], lm.get('visibility', 0)])
        else:
            f.extend([0.0] * 132)
        
        # Left hand: 21 landmarks × 3 (x, y, z) = 63
        if frame['leftHand']:
            for lm in frame['leftHand']:
                f.extend([lm['x'], lm['y'], lm['z']])
        else:
            f.extend([0.0] * 63)
        
        # Right hand: 21 landmarks × 3 = 63
        if frame['rightHand']:
            for lm in frame['rightHand']:
                f.extend([lm['x'], lm['y'], lm['z']])
        else:
            f.extend([0.0] * 63)
        
        features.append(f)  # 258 features per frame
    
    features = np.array(features)
    
    # Pad atau trim ke target_frames
    if len(features) < target_frames:
        pad = np.zeros((target_frames - len(features), 258))
        features = np.vstack([features, pad])
    else:
        features = features[:target_frames]
    
    return features  # shape: (target_frames, 258)
```

**Load Dataset dengan Quality Filter:**
```python
import os

def load_dataset(dataset_path, sign_type='sibi', target_frames=100,
                 min_quality='good', exclude_signers=None):
    """
    min_quality: 'good' (hdr≥0.7) | 'fair' (hdr≥0.4) | 'all'
    exclude_signers: list signer tag untuk test set, misal ['s004']
    """
    X, y, signers = [], [], []
    
    quality_threshold = {'good': 0.7, 'fair': 0.4, 'all': 0.0}
    min_hdr = quality_threshold.get(min_quality, 0.7)
    
    meta_path = os.path.join(dataset_path, sign_type, 'metadata.json')
    with open(meta_path) as f:
        meta = json.load(f)
    
    label_to_idx = {label: i for i, label in enumerate(sorted(meta['labels']))}
    skipped = 0
    
    for rec in meta['recordings']:
        # Filter by quality
        hdr = rec.get('handDetectionRate', 1.0)  # rekaman lama anggap OK
        if hdr < min_hdr:
            skipped += 1
            continue
        
        # Filter by signer (untuk pisah train/test)
        signer = rec.get('signerTag', '')
        if exclude_signers and signer in exclude_signers:
            continue
        
        lm_path = os.path.join(dataset_path, sign_type, rec['label'],
                               rec.get('landmarkFile', ''))
        if not lm_path or not os.path.exists(lm_path):
            skipped += 1
            continue
            
        with open(lm_path) as f:
            frames = json.load(f)
        
        features = extract_features(frames, target_frames)
        X.append(features)
        y.append(label_to_idx[rec['label']])
        signers.append(signer)
    
    print(f"Loaded: {len(X)} recordings, skipped: {skipped}")
    return np.array(X), np.array(y), label_to_idx, signers

# --- Contoh penggunaan ---

# Load semua data (train set) — kecuali signer s004 untuk test
X_train, y_train, label_map, _ = load_dataset(
    '/content/dataset', 'sibi',
    min_quality='good',
    exclude_signers=['s004']
)

# Load test set — hanya signer s004 (unseen signer test)
X_test_signer, y_test_signer, _, _ = load_dataset(
    '/content/dataset', 'sibi',
    min_quality='all',
    exclude_signers=None
)
X_test_signer = X_test_signer[[s == 's004' for s in _]]  # filter post-load

print("Train shape:", X_train.shape)   # (n, 100, 258)
print("Label map:", label_map)
```

**Model LSTM:**
```python
import tensorflow as tf
from tensorflow.keras import layers, models
from sklearn.model_selection import train_test_split

# Load data
X, y, label_map = load_dataset('/content/dataset', 'sibi', target_frames=100)
y_cat = tf.keras.utils.to_categorical(y, num_classes=len(label_map))
X_train, X_test, y_train, y_test = train_test_split(X, y_cat, test_size=0.2)

# Model
model = models.Sequential([
    layers.Input(shape=(100, 258)),
    layers.LSTM(128, return_sequences=True),
    layers.Dropout(0.3),
    layers.LSTM(64),
    layers.Dropout(0.3),
    layers.Dense(64, activation='relu'),
    layers.Dense(len(label_map), activation='softmax')
])

model.compile(optimizer='adam',
              loss='categorical_crossentropy',
              metrics=['accuracy'])

model.fit(X_train, y_train, epochs=50, batch_size=32,
          validation_data=(X_test, y_test))
```

**Export ke TF.js:**
```python
import tensorflowjs as tfjs

# Simpan label map dulu
import json
with open('/content/drive/MyDrive/vero-models/sibi/labels.json', 'w') as f:
    json.dump(label_map, f)

# Convert model
tfjs.converters.save_keras_model(
    model,
    '/content/drive/MyDrive/vero-models/sibi/'
)
# Output: model.json + weights.bin
```

### [ ] 3.3 Integrasi ke VERO

**Struktur file di VERO:**
```
/public/models/
  sibi/
    model.json
    group1-shard1of1.bin
    labels.json
  bisindo/
    model.json
    group1-shard1of1.bin
    labels.json
```

**handLogic.ts (baru — kompatibel dengan Holistic):**
```typescript
// Ekstrak 258 features dari MediaPipe Holistic results
export function extractFeatures(results: HolisticResults): number[] {
  const features: number[] = [];
  
  // Pose: 33 × 4 = 132
  if (results.poseLandmarks) {
    results.poseLandmarks.forEach(lm => {
      features.push(lm.x, lm.y, lm.z, lm.visibility ?? 0);
    });
  } else {
    features.push(...new Array(132).fill(0));
  }
  
  // Left hand: 21 × 3 = 63
  if (results.leftHandLandmarks) {
    results.leftHandLandmarks.forEach(lm => {
      features.push(lm.x, lm.y, lm.z);
    });
  } else {
    features.push(...new Array(63).fill(0));
  }
  
  // Right hand: 21 × 3 = 63
  if (results.rightHandLandmarks) {
    results.rightHandLandmarks.forEach(lm => {
      features.push(lm.x, lm.y, lm.z);
    });
  } else {
    features.push(...new Array(63).fill(0));
  }
  
  return features; // length: 258
}
```

**Studio → Translate Gesture:**
```typescript
// Ganti MediaPipe Hands → Holistic
// Buffer 100 frame terakhir
// Tiap frame baru: predict dengan model TF.js
const buffer: number[][] = [];

holistic.onResults((results) => {
  const features = extractFeatures(results);
  buffer.push(features);
  if (buffer.length > TARGET_FRAMES) buffer.shift();
  
  if (buffer.length === TARGET_FRAMES) {
    const input = tf.tensor3d([buffer]); // shape: [1, 100, 258]
    const prediction = model.predict(input) as tf.Tensor;
    const idx = prediction.argMax(-1).dataSync()[0];
    const label = labels[idx];
    const confidence = prediction.max().dataSync()[0];
    
    if (confidence > 0.7) {
      setResult(label); // tampilkan ke layar
    }
  }
});
```

---

## Pipeline Lengkap: collect_data → Training → VERO

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Koleksi Data (collect_data_tangan)                  │
│                                                              │
│  • Isi signer tag (s001, s002, dst)                         │
│  • SIBI: pilih label → batch 10× → Space untuk rekam        │
│  • Cek quality badge — hapus rekaman "Buruk" (merah)        │
│  • Klik Download ZIP → simpan ke Google Drive               │
└──────────────────────────────┬──────────────────────────────┘
                               │ dataset-YYYY-MM-DD.zip
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Training (Google Colab)                             │
│                                                              │
│  • Upload ZIP ke Google Drive                               │
│  • !unzip dataset.zip -d /content/                          │
│  • load_dataset(min_quality='good', exclude_signers=['s004'])│
│  • Train LSTM → target val_accuracy > 0.80                  │
│  • Export: model.json + weights.bin + labels.json           │
└──────────────────────────────┬──────────────────────────────┘
                               │ model files
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Integrasi ke VERO                                   │
│                                                              │
│  • Copy ke /public/models/sibi/ dan /public/models/bisindo/ │
│  • Ganti MediaPipe Hands → Holistic di Studio               │
│  • extractFeatures(): pose(132) + leftHand(63) + right(63)  │
│  • Buffer 100 frame → tf.tensor3d → model.predict()         │
│  • confidence > 0.7 → tampilkan subtitle                    │
└──────────────────────────────┬──────────────────────────────┘
                               │ gesture label
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4 (bonus demo): IoT                                    │
│                                                              │
│  • Hasil prediksi → POST /api/iot/gesture ke Golang         │
│  • Golang broadcast via WebSocket                           │
│  • ESP32-S3 terima → output audio via MAX98357A             │
└─────────────────────────────────────────────────────────────┘
```

### Checklist Sebelum Training
```
[ ] Minimal 780 rekaman SIBI (26 × 30 sampel)
[ ] Minimal 3 signer berbeda (wajib 1 dari tuli/tunawicara)
[ ] Semua rekaman quality = good (handDetectionRate ≥ 0.70)
[ ] Hapus rekaman poor dari DatasetList (filter → Buruk → hapus semua)
[ ] Download ZIP dan upload ke Google Drive
[ ] Cek distribusi label (tiap label minimal 25 rekaman)
```

### Checklist Setelah Training
```
[ ] val_accuracy > 0.80 di random split
[ ] Test dengan unseen signer (s004) → accuracy > 0.65
[ ] model.json + weights.bin + labels.json tersimpan di Drive
[ ] Copy ke vero/public/models/sibi/
[ ] Test manual di browser: tunjuk gestur → muncul label benar
```

---

## Phase 4 — Real-time & Meeting (Minggu 4–6)
*Target: VeroMeeting bisa jalan dengan gesture AI terintegrasi*

### [ ] 4.1 Perbaiki VeroMeeting (PeerJS)
- Video call P2P antar peserta
- Grid layout adaptive
- Kontrol: mute, camera on/off, keluar

### [ ] 4.2 Gesture AI di Meeting
- Overlay terjemahan isyarat di atas video feed
- Hasil prediksi tampil sebagai subtitle
- Toggle on/off per user

### [ ] 4.3 Speech-to-Text Subtitle
- Web Speech API untuk transkripsi suara real-time
- Tampil sebagai subtitle di meeting

---

## Phase 5 — IoT Integration (Minggu 5–7)
*Target: ESP32-S3 bisa output audio dari gesture yang dideteksi*

### [ ] 5.1 Golang IoT Backend

**Struktur project Golang:**
```
vero-go/
  main.go
  handlers/
    signaling.go    ← WebRTC signaling
    iot.go          ← IoT MQTT/WebSocket
  models/
    gesture.go
```

**IoT endpoint:**
```go
// POST /api/iot/gesture
// Terima gesture result dari browser VERO
// Broadcast ke semua ESP32 yang subscribe

// GET /ws/iot
// WebSocket endpoint untuk ESP32
// Format: {"label":"halo","confidence":0.94,"lang":"SIBI"}
```

### [ ] 5.2 ESP32-S3 Firmware
```cpp
// ESP32-S3 terhubung ke WiFi kampus
// Subscribe WebSocket ke Golang server
// Terima JSON gesture result
// Output audio via MAX98357A (I2S)
// Text-to-Speech: simpan audio file per kata di SD card atau SPIFFS
```

### [ ] 5.3 Test End-to-End di Jaringan Kampus
```
Browser (WiFi kampus) → gesture detection → POST ke Golang
Golang → WebSocket broadcast
ESP32 (WiFi kampus) → terima → output audio 🔊
```

---

## Deployment ke VPS Kampus

### Setup Container Proxmox
```bash
# 1. Buat LXC di Proxmox
# Type: Ubuntu 22.04, CPU: 2, RAM: 3GB, Storage: 20GB

# 2. Di dalam container
apt update && apt install -y docker.io docker-compose nginx certbot

# 3. Clone repo
git clone <repo-vero> /opt/vero
cd /opt/vero

# 4. Setup environment
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, dll

# 5. Jalankan
docker-compose up -d
```

### Nginx Config
```nginx
server {
    listen 80;
    server_name vero.kampus.local;  # atau IP langsung untuk demo

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    location /api/signal {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    location /api/iot {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

---

## Checklist Demo PIMNAS

### Fitur yang Harus Jalan
```
[ ] Login & Register (semua role)
[ ] Buat kelas + join dengan kode
[ ] Jadwal kelas + status LIVE otomatis
[ ] Absensi (dosen buka → mahasiswa konfirmasi)
[ ] Studio: Translate Gesture SIBI real-time (akurasi > 70%)
[ ] Studio: Translate Gesture BISINDO real-time
[ ] VeroMeeting: video call + gesture overlay
[ ] IoT: ESP32 output audio dari gesture terdeteksi
[ ] Deploy di VPS kampus (bukan localhost)
```

### Skenario Demo yang Direkomendasikan
```
1. Login sebagai Dosen → buat kelas "Kelas Inklusif VERO"
2. Login sebagai Mahasiswa → join kelas
3. Dosen buka jadwal → status LIVE → mahasiswa absen
4. Join VeroMeeting → aktifkan Gesture AI
5. Demo: tunjukkan gesture "halo" → muncul di subtitle
6. ESP32 output audio "halo" secara otomatis
7. Tunjukkan dataset collector (collect_data_tangan) sebagai bukti
   proses training model yang dipakai
```

---

## Timeline Ringkas

```
SEKARANG     ★ Retake 2 rekaman "aku" yang lama (hapus → rekam ulang 100 frame)
             ★ Mulai koleksi data serius: kamu + teman (2 laptop, signer berbeda)
             ★ Libatkan teman tuli/tunawicara sesegera mungkin (minimal 1 orang)

Minggu 1–2   Fondasi VERO: Auth + DB schema + Deploy ke VPS kampus
             (paralel: terus kumpul data, target 400+ rekaman dulu)

Minggu 2–3   Akademik: Kelas + Absensi + Jadwal
             (paralel: lengkapi data ke 780 rekaman SIBI)

Minggu 3–4   ★ Training di Google Colab (GPU gratis)
             Integrasi model ke VERO Studio (handLogic.ts + MediaPipe Holistic)

Minggu 4–5   Meeting: VeroMeeting + Gesture overlay subtitle
Minggu 5–6   IoT: Golang backend + ESP32 + end-to-end test
Minggu 6–7   Polish + bug fix + latihan narasi demo PIMNAS
Minggu 7–8   Dry run full demo + cadangan fix
```

> **Bottleneck utama:** Data. Tanpa 780 rekaman berkualitas, model tidak bisa dilatih.
> Prioritas nomor 1 minggu ini adalah kumpulkan data, bukan coding VERO.

---

## Catatan Teknis Penting

### Feature Alignment (WAJIB DIPERHATIKAN)
Urutan 258 features HARUS SAMA persis antara:
- Training script Python (`extract_features()`)
- Inference di VERO (`handLogic.ts`)

Kalau beda urutan → model prediksi salah semua walaupun akurasi training bagus.

### Model Loading di VERO
```typescript
// Load sekali saat app start, bukan setiap prediksi
const modelSIBI = await tf.loadLayersModel('/models/sibi/model.json');
const modelBISINDO = await tf.loadLayersModel('/models/bisindo/model.json');
```

### IoT Demo Backup Plan
Kalau ESP32 bermasalah saat demo → fallback: tampilkan hasil prediksi di layar besar saja (VERO Studio). IoT jadi bonus, bukan blocker demo.

### VPS Kampus vs Berbayar
Untuk PIMNAS: VPS kampus cukup (Xeon 8 core, 16GB RAM, jaringan kampus stabil).  
Pasca PIMNAS: migrate ke Jagoan Hosting Galaxy (4 core, 4GB, Rp 200k/bln) untuk akses publik.
