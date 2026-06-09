# Plan Koleksi Data — SIBI & BISINDO
**Project:** collect_data_tangan  
**Tujuan:** Kumpulkan dataset berkualitas untuk training model AI sign language di VERO  
**Training:** Google Colab atau VPS Kampus (bukan lokal)  
**Dibuat:** 2026-06-08  

---

## Status Hari Ini
- [x] App collect data berjalan (bug 500 frame sudah diperbaiki)
- [x] Struktur dataset sibi/ dan bisindo/ sudah ada
- [ ] Data masih sangat sedikit — baru mulai hari ini
- [ ] Fitur batch recording belum ada (perlu dikerjakan)

---

## Target Dataset Minimum untuk Bisa Training

| | Minimum (bisa mulai training) | Ideal (akurasi bagus) |
|--|-------------------------------|----------------------|
| Sampel per label | 30 rekaman | 50+ rekaman |
| Jumlah penanda tangan | 1 orang | 3–5 orang berbeda |
| Total SIBI | ~780 rekaman | 1.300+ rekaman |
| Total BISINDO | ~300 rekaman | 500+ rekaman |

> **Penting:** Satu orang saja yang rekam = model cenderung overfit ke gaya tangan orang itu.
> Minta minimal 3 anggota tim rekam label yang sama agar model lebih general.

---

## Daftar Label yang Harus Direkam

### SIBI — Prioritas Utama (26 Alfabet)
Ini yang paling penting untuk demo PIMNAS karena visual dan mudah diverifikasi juri.

```
A  B  C  D  E  F  G  H  I  J  K  L  M
N  O  P  Q  R  S  T  U  V  W  X  Y  Z
```

Target: **30–50 sampel per huruf × 26 huruf = 780–1.300 rekaman**

### SIBI — Prioritas Kedua (Angka + Kata Akademik)
Setelah 26 huruf terpenuhi, tambahkan:

**Angka:**
```
0  1  2  3  4  5  6  7  8  9
```

**Kata akademik konteks VERO:**
```
guru        dosen       mahasiswa   kelas
belajar     ujian       tugas       hadir
pertanyaan  jawaban     benar       salah
tolong      maaf        terima-kasih
```

### BISINDO — Kata & Frasa Harian + Akademik
BISINDO lebih kompleks (dua tangan, gesture dinamis). Fokus pada kata yang sering muncul di kelas:

```
halo            selamat-pagi    selamat-siang
iya             tidak           tolong
terima-kasih    maaf            permisi
saya            kamu            kita
belajar         mengajar        mengerti
tidak-mengerti  ulangi          bertanya
hadir           izin            sakit
```

Target awal: **20 label BISINDO × 30 sampel = 600 rekaman**

---

## Standar Kualitas Rekaman

### Setup Fisik
```
✅ Pencahayaan cukup — hindari backlight (jangan berdiri depan jendela)
✅ Background kontras dengan tangan (hindari background rame/motif)
✅ Jarak ke kamera: 50–80 cm (tangan dan lengan harus kelihatan semua)
✅ Kamera setinggi dada, bukan dari atas atau bawah
✅ Pakai baju yang kontras dengan warna kulit tangan
```

### Saat Merekam
```
✅ Tunggu status "Landmark Aktif" sebelum mulai rekam
✅ Untuk SIBI: posisikan tangan di depan dada, jelas terlihat
✅ Untuk BISINDO: pastikan KEDUA tangan masuk frame kamera
✅ Gerakkan dengan kecepatan natural — tidak terlalu cepat/lambat
✅ Ulangi gesture yang sama konsisten antar rekaman
```

### Quality Check (setelah fitur quality score diimplementasi)
```
✅ Hand Detection Rate > 70% = Good (boleh dipakai training)
⚠️ Hand Detection Rate 40–70% = Fair (bisa dipakai tapi kurang ideal)
❌ Hand Detection Rate < 40% = Poor (sebaiknya rekam ulang)
```

---

## Konfigurasi Recording per Tipe

| | SIBI | BISINDO |
|--|------|---------|
| Frame target | **100 frame** (~3 detik) | **300 frame** (~10 detik) |
| Tangan yang dipakai | Kanan (dominan) | Kedua tangan |
| Yang penting | Hand landmarks | Hand + Pose landmarks |
| Alasan frame berbeda | Gesture statis/semi-statis | Gesture dinamis, butuh waktu |

> **Note:** Frame count 100 untuk SIBI perlu diubah di kode (`TARGET_FRAMES`).
> Dengan 100 frame, bisa kumpulkan 5× lebih banyak sampel dalam waktu yang sama.

---

## Jadwal Koleksi Data (Estimasi)

### Minggu 1 — Setup & Alfabet SIBI
```
Hari 1–2:  A–M (13 huruf × 30 sampel = 390 rekaman)
            Libatkan minimal 2 orang berbeda
Hari 3–4:  N–Z (13 huruf × 30 sampel = 390 rekaman)
Hari 5:    Quality check, rekam ulang yang jelek
```

### Minggu 2 — Angka + Kata SIBI + Mulai BISINDO
```
Hari 1–2:  Angka 0–9 (10 × 30 = 300 rekaman)
Hari 3–4:  Kata akademik SIBI (15 × 30 = 450 rekaman)
Hari 5:    BISINDO batch pertama (10 label × 30 = 300 rekaman)
```

### Minggu 3 — BISINDO Lanjutan + Top-up Data
```
Hari 1–3:  BISINDO sisa label (10 × 30 = 300 rekaman)
Hari 4–5:  Tambah penanda tangan baru (rekam ulang semua label)
```

**Total estimasi: ~2.400 rekaman dalam 3 minggu**  
Dengan batch recording mode (akan diimplementasi), ini bisa diselesaikan 2–4 jam/hari.

---

## Fitur App yang Perlu Dikerjakan (Urutan Prioritas)

### [ ] 1. Konfigurasi Frame per SignType
Ubah TARGET_FRAMES jadi configurable: SIBI = 100, BISINDO = 300.  
**Impact:** 5× lebih cepat kumpulkan data SIBI.

### [ ] 2. Batch Recording Mode
Rekam N kali berturut-turut otomatis untuk satu label.  
**Impact:** Tidak perlu klik tombol setiap rekaman.

### [ ] 3. Per-label Progress Indicator
Tampilkan di sidebar: `aku (12/50)` dengan progress bar.  
**Impact:** Tahu label mana yang masih kurang.

### [ ] 4. Warmup Hand Detection
Countdown tidak mulai sampai tangan terdeteksi.  
**Impact:** Tidak ada rekaman yang mulai tanpa tangan di frame.

### [ ] 5. Quality Score per Recording
Simpan `handDetectionRate` di metadata.  
**Impact:** Bisa filter rekaman jelek sebelum training.

### [ ] 6. Export Training Format
`GET /api/export/training` → JSON flat array siap numpy.  
**Impact:** Training script Python lebih mudah dibuat.

---

## Procedure Export untuk Training

### Step 1 — Export dari App
```
Buka app → klik "Ekspor Metadata" → download JSON
Atau: GET http://localhost:3001/api/export
```

### Step 2 — Upload ke Google Colab / VPS Kampus
```python
# Di Colab, upload file dataset/ (zip dulu)
# Struktur yang diupload:
dataset/
  sibi/
    metadata.json
    A/ *.webm  *_landmarks.json
    B/ *.webm  *_landmarks.json
    ...
  bisindo/
    metadata.json
    ...
```

### Step 3 — Training (lihat PLAN_website_vero.md untuk detail)
```python
# Feature extraction dari landmark JSON
# Shape per sample SIBI: (100, 258)
# Shape per sample BISINDO: (300, 258)
# Train LSTM → export TF.js
```

---

## Catatan Penting

1. **Backup dataset secara berkala** — copy folder `dataset/` ke Google Drive atau external HDD
2. **Konsistensi gesture** — semua anggota tim harus sepakat bentuk gesture per label sebelum rekam
3. **Referensi SIBI:** gunakan kamus SIBI resmi dari Kemendikbud
4. **Referensi BISINDO:** gunakan kamus BISINDO dari Pusat Bahasa Isyarat Indonesia (Pusbisindo)
5. **Jangan hapus rekaman jelek dulu** — tandai saja dengan quality score, bisa diputuskan nanti saat training
