# Asesmen Sumatif Akhir — MTs YTI Sukamerang

Sistem asesmen (ujian) daring untuk MTs YTI Sukamerang. Siswa mengerjakan asesmen di
browser, guru mengelola bank soal, token, dan memantau siswa secara langsung — termasuk
deteksi saat layar ujian ditutup atau ditinggalkan.

## Fitur

**Untuk siswa**
- Login hanya dengan **kelas → nama → token asesmen** (tanpa username/password).
- Layar ujian dikunci: mode layar penuh, notifikasi/alarm berbunyi bila layar ditutup,
  pindah aplikasi, atau keluar dari layar penuh.
- Lima jenis soal: pilihan ganda, pilihan ganda kompleks, benar/salah, menjodohkan, uraian.
- Jawaban tersimpan otomatis, timer ujian, dan halaman hasil dengan nilai akhir.

**Untuk guru / admin madrasah**
- Bank soal per kelas dan per mata pelajaran.
- Editor teks kaya (Jodit) dengan unggah gambar pada soal maupun pilihan jawaban.
- Bobot nilai per soal, dan khusus pilihan ganda kompleks bobot per pilihan jawaban.
- Token asesmen per mata pelajaran dan per kelas (dibuat otomatis, bisa diganti).
- Pemantauan siswa: status mengerjakan, jumlah terjawab, pelanggaran layar.
- Notifikasi pelanggaran real-time di panel guru (toast + bunyi peringatan).
- Penilaian jawaban uraian manual, langsung dari halaman hasil.

## Teknologi

| Bagian  | Teknologi |
| ------- | --------- |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| Editor  | Jodit (jodit-react) |
| Backend | Node.js + Express 4 |
| Database | PostgreSQL (`pg`) |

## Menjalankan secara lokal

Prasyarat: Node.js 22+ dan PostgreSQL.

```bash
npm install
cp .env.example .env      # lalu isi DATABASE_URL
npm run dev               # frontend: http://localhost:5173
npm run start:api         # API: http://localhost:3001
```

Buka `http://localhost:5173`. Frontend mem-proxy `/api` ke `http://127.0.0.1:3001`
(lihat `vite.config.ts`), jadi kedua proses harus berjalan.

Tabel database, indeks, dan akun awal dibuat otomatis saat API pertama kali dijalankan
(`server/schema.js` dan `server/seed.js`).

### Akun awal

| Peran | Username | Password |
| ----- | -------- | -------- |
| Guru  | `guru`   | `guru123` |

Akun siswa dibuat oleh guru di menu **Siswa**; siswa masuk lewat kelas, nama, dan token.

## Variabel lingkungan

| Nama | Wajib | Keterangan |
| ---- | ----- | ---------- |
| `DATABASE_URL` | ya | String koneksi PostgreSQL |
| `PORT` | tidak | Port API (default `3001`) |

## Struktur proyek

```
server/            API Express
  index.js         seluruh endpoint dan logika penilaian
  schema.js        migrasi skema database
  seed.js          data awal (guru, kelas, mapel, contoh soal)
  auth.js          hash password & token sesi
src/
  pages/           halaman siswa dan panel guru
  components/      komponen UI, editor Jodit, dialog konfirmasi
  lib/             API client, tipe data, helper
public/            berkas statis
Dockerfile         untuk menjalankan API di container
```

## Penyimpanan gambar soal

Gambar yang diunggah guru disimpan di tabel `media` (PostgreSQL) dan disajikan melalui
`/api/media/:id`, sehingga tidak memerlukan layanan penyimpanan tambahan.

## Lisensi

Dibuat untuk keperluan internal MTs YTI Sukamerang.
