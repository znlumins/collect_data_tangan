# PLAN UNIVERSAL — VERO × collect_data_tangan
**Project:** PKM-KC Universitas Brawijaya — VERO Inclusive LMS  
**Last updated:** 2026-06-09  
**Status:** collect_data SIAP PAKAI · VERO belum mulai · Data belum cukup

---

## Gambaran Besar

```
collect_data_tangan  ──►  Google Colab (training)  ──►  VERO Website
  (kumpul data)              (model LSTM)               (inference TF.js)
  VPS Kampus                 GPU gratis                 VPS Kampus
  filesystem only            export model.json          MySQL + static files
```

Dua project terpisah, satu VPS kampus, alur satu arah.  
collect_data **tidak butuh database** — filesystem + JSON sudah cukup.  
VERO butuh MySQL hanya untuk data akademik (user, kelas, absensi).  
Model AI disimpan sebagai static file, di-load TF.js langsung di browser.

---

## Stack & Infrastruktur

| Komponen | Teknologi | Lokasi |
|----------|-----------|--------|
| collect_data frontend | React + Vite | VPS Kampus |
| collect_data backend | Express.js | VPS Kampus |
| Dataset storage | Filesystem (`dataset/`) | VPS Kampus |
| Training | Python + TensorFlow + Google Colab | Cloud (gratis) |
| VERO frontend | Next.js + TF.js + MediaPipe | VPS Kampus |
| VERO backend | Golang | VPS Kampus |
| VERO database | MySQL via Prisma | VPS Kampus |
| IoT | ESP32-S3 + MAX98357A | Lokal (demo) |
| VPS Kampus | Proxmox LXC, Xeon 8-core, 16GB RAM | Kampus UB |

---

## Status Komponen (Update 2026-06-09)

### collect_data_tangan ✅ SIAP PAKAI
| Fitur | Status |
|-------|--------|
| SIBI 100 frame / BISINDO 300 frame | ✅ |
| Batch recording (1×–50×) | ✅ |
| Warmup hand detection | ✅ |
| Quality score (handDetectionRate + badge) | ✅ |
| Signer tag + localStorage | ✅ |
| Per-label progress bar + target | ✅ |
| Spacebar shortcut | ✅ |
| Auto-lanjut label | ✅ |
| Quality filter + pagination DatasetList | ✅ |
| Download ZIP seluruh dataset | ✅ |
| Deploy ke VPS | ❌ belum |

### Dataset
| Item | Status |
|------|--------|
| 2 rekaman "aku" yang ada | ❌ **PERLU DIHAPUS** (64 & 500 frame, no quality metadata) |
| SIBI 26 huruf | ❌ 0/780 rekaman |
| BISINDO 20 kata | ❌ 0/600 rekaman |

### VERO Website
| Komponen | Status |
|----------|--------|
| Next.js project | ✅ ada (polosan) |
| Auth + DB schema | ❌ belum |
| Fitur akademik | ❌ belum |
| AI/Model integration | ❌ belum (tunggu data cukup) |
| Deploy VPS | ❌ belum |

---

## PHASE 0 — Sekarang (Hari ini)

### 0.1 Hapus Rekaman Lama yang Tidak Valid
```
Buka collect_data → tab Dataset
→ Hapus rekaman "aku" (64 frame) — recording abort, tidak lengkap
→ Hapus rekaman "aku" (500 frame) — frame count salah (setting lama)
Keduanya tidak punya quality/signerTag metadata → tidak bisa dipakai training
```

### 0.2 Deploy collect_data ke VPS Kampus
Tujuan: 2 laptop bisa akses ke satu server yang sama, data terkumpul di satu tempat.

```bash
# Di VPS kampus (dalam LXC container Ubuntu 22.04)

# 1. Install dependencies
apt update && apt install -y git nodejs npm

# 2. Clone repo
git clone <repo-collect-data> /opt/collect_data
cd /opt/collect_data

# 3. Install packages
npm install

# 4. Jalankan (background)
npm run dev:server &    # Express :3001
npm run dev:client &    # Vite :5173

# Atau pakai PM2 supaya tidak mati kalau terminal ditutup:
npm install -g pm2
pm2 start "npm run dev:server" --name collect-server
pm2 start "npm run dev:client" --name collect-client
pm2 save
pm2 startup
```

```nginx
# Nginx config untuk collect_data (opsional, kalau mau pakai domain/IP clean)
server {
    listen 80;
    server_name collect.vero.local;  # atau IP VPS langsung

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    location /api/ {
        proxy_pass http://localhost:3001;
    }

    location /videos/ {
        proxy_pass http://localhost:3001;
    }
}
```

**Setelah deploy:** kedua laptop cukup buka browser ke `http://IP-VPS` dan isi signer tag masing-masing.

```
Laptop kamu  ──┐
               ├──► http://IP-VPS  (collect_data di VPS kampus)
Laptop teman ──┘     data tersimpan di /opt/collect_data/dataset/
```

---

## PHASE 1 — Koleksi Data (Paralel dengan Phase 3)

### 1.1 Setup Sebelum Rekam
```
✅ Isi signer tag (kamu: s001, teman: s002, teman tuli: s003)
✅ Set target per label = 30 di sidebar
✅ Cek status "Landmark Aktif" sebelum rekam (hijau)
✅ Pastikan pencahayaan cukup, background tidak rame
✅ Jarak ke kamera 50–80 cm, tangan dan lengan kelihatan semua
✅ Pakai baju yang kontras dengan warna kulit tangan
```

### 1.2 Daftar Label yang Harus Direkam

**SIBI — 26 Huruf (Prioritas Utama)**
```
A  B  C  D  E  F  G  H  I  J  K  L  M
N  O  P  Q  R  S  T  U  V  W  X  Y  Z
```
Target: 30 sampel × 26 huruf = **780 rekaman minimum**

**SIBI — Prioritas Kedua (setelah 26 huruf selesai)**
```
Angka: 0 1 2 3 4 5 6 7 8 9
Kata:  guru  dosen  mahasiswa  kelas  belajar
       ujian  tugas  hadir  tolong  maaf  terima-kasih
```

**BISINDO — 20 Kata Harian + Akademik**
```
halo          selamat-pagi    selamat-siang
iya           tidak           tolong
terima-kasih  maaf            permisi
saya          kamu            kita
belajar       mengajar        mengerti
tidak-mengerti  ulangi        bertanya
hadir         izin
```
Target: 30 sampel × 20 kata = **600 rekaman minimum**

### 1.3 Strategi Signer (Penting untuk Kualitas Model)
```
s001 (kamu, dengar)          → 15 sampel/label
s002 (teman tim, dengar)     → 10 sampel/label
s003 (teman tuli/tunawicara) → 5 sampel/label minimum ← WAJIB ada
─────────────────────────────────────────────────────
Total per label              → 30 sampel
```

> Tanpa minimal 1 signer tuli/tunawicara, model bisa tidak akurat
> untuk pengguna asli VERO. Ajak teman tuli sesegera mungkin.

### 1.4 Standar Kualitas
| Badge | handDetectionRate | Keputusan |
|-------|-------------------|-----------|
| **Baik** (hijau) | ≥ 70% | ✅ Masuk training |
| **Cukup** (kuning) | 40–69% | ⚠️ Pakai jika data kurang |
| **Buruk** (merah) | < 40% | ❌ Hapus, rekam ulang |

Filter rekaman buruk: tab Dataset → filter "Buruk" → hapus semua sebelum export.

### 1.5 Workflow Harian (2 Laptop)
```
Sesi pagi (1–2 jam):
  Laptop 1 (s001): rekam A–M, batch 10×, Space untuk start
  Laptop 2 (s002): rekam A–M, batch 10×, auto-lanjut label ON

Sesi sore (1–2 jam):
  Laptop 1: rekam N–Z
  Laptop 2: rekam N–Z

Akhir hari:
  Cek progress bar sidebar — label mana yang masih kurang
  Filter DatasetList "Buruk" → hapus
  (Kalau pakai VPS: data sudah terkumpul otomatis di satu tempat)
  (Kalau pakai laptop masing-masing: sync manual via USB/LAN)
```

### 1.6 Jadwal Koleksi Data
```
Minggu 1, Hari 1–3   SIBI A–Z (26 huruf × 30 sampel = 780 rekaman)
Minggu 1, Hari 4–5   Quality check + rekam ulang yang buruk
                     Minta s003 (teman tuli) rekam semua 26 huruf

Minggu 2, Hari 1–3   BISINDO 20 kata × 30 sampel = 600 rekaman
Minggu 2, Hari 4–5   Tambah angka SIBI 0–9 jika waktu cukup

Minggu 3             Top-up sampel yang kurang, tambah kata akademik SIBI
```

### 1.7 Export Dataset ke Colab
```
1. Buka collect_data → klik "Download ZIP" di header
2. Simpan ke Google Drive: MyDrive/vero/dataset-YYYY-MM-DD.zip
3. Di Colab:
   from google.colab import drive
   drive.mount('/content/drive')
   !unzip /content/drive/MyDrive/vero/dataset-YYYY-MM-DD.zip -d /content/
```

---

## PHASE 2 — Training Model (Google Colab)

### 2.1 Setup Colab
```python
!pip install tensorflow tensorflowjs numpy scikit-learn

from google.colab import drive
drive.mount('/content/drive')
!unzip /content/drive/MyDrive/vero/dataset-YYYY-MM-DD.zip -d /content/
```

### 2.2 Feature Extraction
```python
import json, numpy as np

def extract_features(landmark_frames, target_frames=100):
    """
    Output: numpy array shape (target_frames, 258)
    258 = pose(132) + leftHand(63) + rightHand(63)
    URUTAN INI HARUS SAMA PERSIS dengan handLogic.ts di VERO
    """
    features = []
    for frame in landmark_frames:
        f = []
        # Pose: 33 landmarks × 4 (x, y, z, visibility) = 132
        if frame.get('pose'):
            for lm in frame['pose']:
                f.extend([lm['x'], lm['y'], lm['z'], lm.get('visibility', 0)])
        else:
            f.extend([0.0] * 132)
        # Left hand: 21 × 3 = 63
        if frame.get('leftHand'):
            for lm in frame['leftHand']:
                f.extend([lm['x'], lm['y'], lm['z']])
        else:
            f.extend([0.0] * 63)
        # Right hand: 21 × 3 = 63
        if frame.get('rightHand'):
            for lm in frame['rightHand']:
                f.extend([lm['x'], lm['y'], lm['z']])
        else:
            f.extend([0.0] * 63)
        features.append(f)

    features = np.array(features)
    if len(features) < target_frames:
        pad = np.zeros((target_frames - len(features), 258))
        features = np.vstack([features, pad])
    else:
        features = features[:target_frames]
    return features  # (target_frames, 258)
```

### 2.3 Load Dataset dengan Quality Filter
```python
def load_dataset(dataset_path, sign_type='sibi', target_frames=100,
                 min_hdr=0.7, exclude_signers=None):
    """
    min_hdr: minimum handDetectionRate (0.7 = good, 0.4 = fair, 0.0 = semua)
    exclude_signers: list signer untuk test set, misal ['s003']
    """
    X, y, signers = [], [], []
    meta = json.load(open(f'{dataset_path}/{sign_type}/metadata.json'))
    label_to_idx = {l: i for i, l in enumerate(sorted(meta['labels']))}
    skipped = 0

    for rec in meta['recordings']:
        hdr = rec.get('handDetectionRate', 1.0)  # rekaman lama anggap OK
        if hdr < min_hdr: skipped += 1; continue
        signer = rec.get('signerTag', '')
        if exclude_signers and signer in exclude_signers: continue
        if not rec.get('landmarkFile'): skipped += 1; continue

        lm_path = f"{dataset_path}/{sign_type}/{rec['label']}/{rec['landmarkFile']}"
        try:
            frames = json.load(open(lm_path))
        except:
            skipped += 1; continue

        X.append(extract_features(frames, target_frames))
        y.append(label_to_idx[rec['label']])
        signers.append(signer)

    print(f"Loaded {len(X)} | Skipped {skipped} | Labels {len(label_to_idx)}")
    return np.array(X), np.array(y), label_to_idx, signers

# Contoh pakai:
X, y, label_map, signers = load_dataset('/content/dataset', 'sibi',
                                         min_hdr=0.7, exclude_signers=['s003'])
print("Shape:", X.shape)   # (n_samples, 100, 258)
```

### 2.4 Training LSTM
```python
import tensorflow as tf
from tensorflow.keras import layers, models
from sklearn.model_selection import train_test_split

y_cat = tf.keras.utils.to_categorical(y, num_classes=len(label_map))
X_train, X_val, y_train, y_val = train_test_split(X, y_cat, test_size=0.2, stratify=y)

model = models.Sequential([
    layers.Input(shape=(100, 258)),
    layers.LSTM(128, return_sequences=True),
    layers.Dropout(0.3),
    layers.LSTM(64),
    layers.Dropout(0.3),
    layers.Dense(64, activation='relu'),
    layers.Dense(len(label_map), activation='softmax')
])
model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

history = model.fit(X_train, y_train, epochs=50, batch_size=32,
                    validation_data=(X_val, y_val))
# Target: val_accuracy > 0.80
```

### 2.5 Validasi dengan Unseen Signer
```python
# Test dengan s003 (teman tuli yang tidak ikut training)
X_test, y_test, _, _ = load_dataset('/content/dataset', 'sibi',
                                     min_hdr=0.0, exclude_signers=None)
mask = [s == 's003' for s in _]
if any(mask):
    acc = model.evaluate(X_test[mask], tf.keras.utils.to_categorical(y_test[mask], len(label_map)))
    print(f"Unseen signer accuracy: {acc[1]:.2%}")
    # Target: > 0.65 (model general ke orang baru)
```

### 2.6 Export ke TF.js
```python
import tensorflowjs as tfjs
import json

SAVE_PATH = '/content/drive/MyDrive/vero/models/sibi'

# Simpan label map
with open(f'{SAVE_PATH}/labels.json', 'w') as f:
    json.dump(label_map, f)

# Convert ke TF.js format
tfjs.converters.save_keras_model(model, SAVE_PATH)
# Output: model.json + group1-shard1of1.bin
```

---

## PHASE 3 — VERO Foundation (Paralel dengan Phase 1)

### 3.1 Setup VPS Kampus — Docker Compose
```yaml
# docker-compose.yml
services:
  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf

  nextjs:
    build: ./vero-web
    environment:
      - DATABASE_URL=mysql://vero:secret@mysql:3306/vero
      - JWT_SECRET=${JWT_SECRET}
    depends_on: [mysql]

  golang:
    build: ./vero-go
    ports: ["8080:8080", "8081:8081"]

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: vero
      MYSQL_USER: vero
      MYSQL_PASSWORD: secret
      MYSQL_ROOT_PASSWORD: rootsecret
    volumes:
      - mysql_data:/var/lib/mysql

  collect_data:
    build: ./collect_data_tangan
    ports: ["3001:3001", "5173:5173"]
    volumes:
      - ./collect_data_tangan/dataset:/app/dataset

volumes:
  mysql_data:
```

```nginx
# nginx.conf
server {
    listen 80;

    # VERO website (Next.js)
    location / {
        proxy_pass http://nextjs:3000;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    # Golang API
    location /api/go/ {
        proxy_pass http://golang:8080/;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    # collect_data (akses internal tim)
    location /collect/ {
        proxy_pass http://collect_data:5173/;
    }
}
```

### 3.2 Database Schema (Prisma)
```prisma
model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  password  String
  role      Role     @default(MAHASISWA)
  nim       String?
  nip       String?
  avatar    String?
  createdAt DateTime @default(now())
  classes   ClassMember[]
  attendances Attendance[]
}

model Class {
  id          String   @id @default(cuid())
  name        String
  code        String   @unique
  teacherId   String
  teacher     User     @relation(fields: [teacherId], references: [id])
  members     ClassMember[]
  schedules   Schedule[]
  assignments Assignment[]
}

model Schedule {
  id        String   @id @default(cuid())
  classId   String
  class     Class    @relation(fields: [classId], references: [id])
  date      DateTime
  startTime String
  endTime   String
  isLive    Boolean  @default(false)
  attendances Attendance[]
}

model Attendance {
  id         String           @id @default(cuid())
  scheduleId String
  userId     String
  status     AttendanceStatus
  timestamp  DateTime         @default(now())
}

model Assignment {
  id          String   @id @default(cuid())
  classId     String
  title       String
  description String?
  deadline    DateTime
  submissions Submission[]
}

enum Role { MAHASISWA DOSEN ADMIN }
enum AttendanceStatus { HADIR_LURING HADIR_DARING IZIN ALPHA }
```

### 3.3 Auth Flow
```
Register → POST /api/auth/register → bcrypt hash → simpan di MySQL
Login    → POST /api/auth/login    → verify hash → return JWT
Protect  → middleware verifyJWT    → cek header Authorization: Bearer <token>
```

---

## PHASE 4 — VERO AI Integration

### 4.1 Copy Model dari Google Drive ke VERO
```bash
# Setelah training selesai di Colab
# Download dari Google Drive lalu copy ke:

vero-web/
  public/
    models/
      sibi/
        model.json          ← dari Colab
        group1-shard1of1.bin
        labels.json
      bisindo/
        model.json
        group1-shard1of1.bin
        labels.json
```

### 4.2 handLogic.ts — Feature Extraction
```typescript
// URUTAN HARUS SAMA dengan extract_features() di Python Colab
export function extractFeatures(results: HolisticResults): number[] {
  const f: number[] = [];

  // Pose: 33 × 4 = 132
  if (results.poseLandmarks) {
    results.poseLandmarks.forEach(lm =>
      f.push(lm.x, lm.y, lm.z, lm.visibility ?? 0));
  } else {
    f.push(...new Array(132).fill(0));
  }

  // Left hand: 21 × 3 = 63
  if (results.leftHandLandmarks) {
    results.leftHandLandmarks.forEach(lm => f.push(lm.x, lm.y, lm.z));
  } else {
    f.push(...new Array(63).fill(0));
  }

  // Right hand: 21 × 3 = 63
  if (results.rightHandLandmarks) {
    results.rightHandLandmarks.forEach(lm => f.push(lm.x, lm.y, lm.z));
  } else {
    f.push(...new Array(63).fill(0));
  }

  return f; // length 258 — JANGAN UBAH URUTAN INI
}
```

### 4.3 Studio — Inference Loop
```typescript
// Load model sekali saat halaman Studio dibuka
const modelSIBI   = await tf.loadLayersModel('/models/sibi/model.json');
const labelsSIBI  = await fetch('/models/sibi/labels.json').then(r => r.json());
const TARGET_FRAMES = 100;
const CONFIDENCE_THRESHOLD = 0.70;

// Buffer rolling 100 frame
const frameBuffer: number[][] = [];

holistic.onResults((results) => {
  const features = extractFeatures(results);
  frameBuffer.push(features);
  if (frameBuffer.length > TARGET_FRAMES) frameBuffer.shift();

  if (frameBuffer.length === TARGET_FRAMES) {
    const input = tf.tensor3d([frameBuffer]);       // [1, 100, 258]
    const pred  = modelSIBI.predict(input) as tf.Tensor;
    const idx   = pred.argMax(-1).dataSync()[0];
    const conf  = pred.max().dataSync()[0];
    input.dispose(); pred.dispose();

    if (conf > CONFIDENCE_THRESHOLD) {
      const label = Object.keys(labelsSIBI)[idx];
      setSubtitle(label);                           // tampil di UI
      sendToIoT(label, conf);                       // kirim ke Golang → ESP32
    }
  }
});
```

### 4.4 Kirim ke Golang (untuk IoT)
```typescript
async function sendToIoT(label: string, confidence: number) {
  await fetch('/api/go/iot/gesture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, confidence, lang: 'SIBI' }),
  });
}
```

---

## PHASE 5 — VERO Fitur Akademik

### 5.1 Modul Kelas
- Dosen: buat kelas → generate kode 6 digit unik
- Mahasiswa: join dengan kode
- Tab kelas: Forum, Materi, Jadwal, Anggota

### 5.2 Jadwal & Live Indicator
- Dosen buat jadwal (tanggal, jam mulai–selesai)
- Status LIVE otomatis aktif saat waktu sesuai (polling 1 menit)
- Tombol "Join Meeting" aktif saat live

### 5.3 Absensi
- Dosen buka/tutup sesi presensi
- Mahasiswa pilih: Hadir Luring / Hadir Daring / Izin
- Rekap: hijau ≥80%, kuning ≥50%, merah <50%

### 5.4 Tugas
- Dosen buat tugas + deadline
- Mahasiswa submit
- Status: Belum Kumpul / Sudah Kumpul / Terlambat

---

## PHASE 6 — VeroMeeting & IoT

### 6.1 VeroMeeting (PeerJS)
```
Video call P2P antar peserta
Grid layout adaptive
Overlay subtitle terjemahan gesture real-time
Toggle gesture AI on/off per user
Speech-to-text (Web Speech API) untuk subtitle suara
```

### 6.2 Golang IoT Backend
```go
// POST /api/iot/gesture — terima dari browser
// GET  /ws/iot          — WebSocket untuk ESP32

// Format broadcast:
// {"label":"halo","confidence":0.94,"lang":"SIBI"}
```

### 6.3 ESP32-S3 Firmware
```cpp
// Connect WiFi → WebSocket ke Golang
// Terima JSON gesture result
// Output audio via MAX98357A (I2S)
// Audio file per kata di SD card / SPIFFS
// Fallback: jika WiFi terputus → tampil di serial monitor
```

### 6.4 Backup Plan Demo IoT
Kalau ESP32 bermasalah saat PIMNAS → fallback: hasil gesture tampil
di layar besar saja via VERO Studio. IoT jadi bonus, bukan blocker.

---

## Timeline Menuju PIMNAS

```
SEKARANG
  ★ Hapus 2 rekaman lama yang tidak valid
  ★ Deploy collect_data ke VPS kampus
  ★ Mulai rekam: s001 (kamu) + s002 (teman) langsung hari ini
  ★ Cari teman tuli/tunawicara untuk s003 sesegera mungkin

Minggu 1–2
  DATA: SIBI A–Z × 30 sampel = 780 rekaman (s001 + s002 + s003)
  VERO: Auth + DB schema + Docker Compose di VPS kampus

Minggu 2–3
  DATA: Quality check + BISINDO 20 kata × 30 sampel
  VERO: Fitur akademik (kelas, jadwal, absensi, tugas)

Minggu 3–4
  ★ Training di Google Colab (GPU free tier cukup untuk LSTM ini)
  ★ Integrasi model ke VERO Studio (handLogic.ts + Holistic)
  ★ Test manual: tunjuk gesture → muncul subtitle di browser

Minggu 4–5
  VERO: VeroMeeting (PeerJS) + gesture overlay di meeting

Minggu 5–6
  IoT: Golang WebSocket + ESP32 firmware + end-to-end test

Minggu 6–7
  Polish + bug fix + latihan narasi demo PIMNAS
  Dry run full skenario demo di jaringan kampus

Minggu 7–8
  Buffer: fix masalah tak terduga + latihan final
```

---

## Checklist Demo PIMNAS

### Fitur Wajib (Harus Jalan)
```
[ ] Login & Register (Dosen + Mahasiswa)
[ ] Buat kelas + join dengan kode
[ ] Jadwal + status LIVE otomatis
[ ] Absensi (buka → mahasiswa konfirmasi → rekap)
[ ] Studio: Translate Gesture SIBI real-time (akurasi > 70%)
[ ] VeroMeeting: video call + gesture subtitle
[ ] Deploy di VPS kampus (bukan localhost)
```

### Fitur Bonus (Nilai Tambah)
```
[ ] BISINDO translation di Studio
[ ] Speech-to-text subtitle di Meeting
[ ] IoT: ESP32 output audio dari gesture
[ ] Tampilkan dataset collector sebagai bukti riset
```

### Skenario Demo yang Direkomendasikan
```
1. Login sebagai Dosen → buat kelas "Kelas Inklusif VERO"
2. Login sebagai Mahasiswa (role tuli) → join kelas
3. Dosen buka jadwal → status LIVE → mahasiswa absen Hadir Daring
4. Join VeroMeeting → aktifkan Gesture AI
5. Peragakan gesture "halo" → muncul subtitle di layar
6. ESP32 output audio "halo" 🔊 (jika IoT jalan)
7. Tunjuk collect_data_tangan di laptop kedua → bukti proses training
   "Ini cara kami kumpulkan data dari pengguna asli, termasuk dari
    teman tuli kami untuk memastikan model akurat bagi mereka"
```

---

## Arsitektur Storage (Ringkasan)

```
VPS Kampus
├── collect_data_tangan/           ← alat koleksi data
│   ├── dataset/sibi/              ← video .webm + landmark .json
│   │   ├── metadata.json          ← index semua rekaman
│   │   └── <label>/<uuid>.webm
│   └── dataset/bisindo/
│
├── vero-web/                      ← Next.js
│   └── public/models/             ← model TF.js (static files, bukan DB)
│       ├── sibi/model.json
│       └── bisindo/model.json
│
├── MySQL                          ← HANYA untuk data akademik VERO
│   └── vero DB: users, classes, schedules, attendance, assignments
│
└── vero-go/                       ← Golang backend
    └── WebSocket untuk IoT + WebRTC signaling

Google Colab (sementara, saat training)
└── GPU T4 gratis → train LSTM → export model.json
```

**Satu kalimat:**  
collect_data pakai filesystem, VERO pakai MySQL untuk akademik,
model AI sebagai static file — tidak ada database untuk dataset.

---

## Catatan Penting

### Feature Alignment (WAJIB)
Urutan 258 features di Python dan TypeScript **harus identik**:
```
pose(132) → leftHand(63) → rightHand(63)
```
Kalau beda urutan → model salah prediksi semua meski akurasi training bagus.

### Backup Dataset
Copy folder `dataset/` ke Google Drive setiap hari saat aktif koleksi data.
Satu corruption `metadata.json` bisa membuat semua rekaman "hilang" dari index.

### Referensi Gestur
- **SIBI:** Kamus SIBI resmi Kemendikbud
- **BISINDO:** Kamus Pusat Bahasa Isyarat Indonesia (Pusbisindo)
- Semua anggota tim harus sepakat bentuk gestur per label **sebelum** mulai rekam

### VPS Pasca PIMNAS
Setelah PIMNAS: migrate ke VPS berbayar (Jagoan Hosting Galaxy 4 core/4GB ~Rp 200k/bln)
untuk akses publik. collect_data_tangan tidak perlu ikut — hanya VERO yang di-deploy.
