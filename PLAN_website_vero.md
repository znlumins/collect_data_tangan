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
- [x] Dataset collection sudah mulai (collect_data_tangan)
- [ ] Database schema belum final
- [ ] Golang backend belum ada
- [ ] Deployment ke VPS kampus belum dilakukan
- [ ] Model AI belum dilatih

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
```
collect_data_tangan → kumpulkan 800+ rekaman SIBI + 300+ BISINDO
Lihat detail di PLAN_collect_data.md
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

**Load Dataset:**
```python
import os

def load_dataset(dataset_path, sign_type='sibi', target_frames=100):
    X, y, labels = [], [], []
    
    meta_path = os.path.join(dataset_path, sign_type, 'metadata.json')
    with open(meta_path) as f:
        meta = json.load(f)
    
    label_to_idx = {label: i for i, label in enumerate(sorted(meta['labels']))}
    
    for rec in meta['recordings']:
        lm_path = os.path.join(dataset_path, sign_type, rec['label'],
                               rec['landmarkFile'])
        if not os.path.exists(lm_path):
            continue
            
        with open(lm_path) as f:
            frames = json.load(f)
        
        features = extract_features(frames, target_frames)
        X.append(features)
        y.append(label_to_idx[rec['label']])
        labels.append(rec['label'])
    
    return np.array(X), np.array(y), label_to_idx
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
Minggu 1–2   Fondasi: Auth + DB + Deploy ke VPS kampus
Minggu 2–3   Akademik: Kelas + Absensi + Jadwal  
Minggu 3–5   AI: Kumpul data + Training + Integrasi Studio
Minggu 5–6   Meeting: VeroMeeting + Gesture overlay
Minggu 6–7   IoT: Golang + ESP32 + End-to-end test
Minggu 7–8   Polish + Bug fix + Latihan demo PIMNAS
```

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
