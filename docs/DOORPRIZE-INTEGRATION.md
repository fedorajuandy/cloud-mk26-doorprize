# Integrasi doorprize dan halaman peserta

Halaman `/peserta` menampilkan profil, jadwal serta timestamp absensi, hadiah, QR klaim, dan bukti penyerahan sesuai acuan UI 4–9. Absensi tetap mengikuti pengaturan sesi, gate, jaringan tepercaya, dan lokasi. Hadiah hanya ditampilkan setelah sistem undian mengirim pemenang; aplikasi ini tidak melakukan pengundian.

## Kredensial

Superadmin membuka **Doorprize → Kunci integrasi**, membuat kunci, lalu menyerahkannya melalui kanal rahasia kepada backend sistem undian. Token ditampilkan sekali; database menyimpan hash. Token memberi akses ekspor ID/NIP dan penetapan pemenang: jangan tanam di browser, URL, repository, atau log. Cabut kunci dari dashboard jika integrasi berakhir. Admin dan supervisor dapat melihat hadiah serta mengonfirmasi penyerahan, tetapi tidak membuat kunci.

Seluruh endpoint integrasi HTTP menggunakan `Authorization: Bearer <TOKEN>`, HTTPS, dan batas gabungan 120 permintaan/pesan per menit per kunci. Contoh di bawah menggunakan data sintetis.

## Ekspor ID dan NIP

`GET /api/integrations/doorprize/participants?after=0&limit=500`

```json
{ "rows": [{ "id": 123, "nip": "TEST-001" }], "through": 900, "nextAfter": 123 }
```

Lanjutkan dengan `after=123&limit=500&through=900` sampai `nextAfter` bernilai `null`. Maksimum 1.000 baris per halaman. Respons hanya berisi ID dan NIP, bukan nomor telepon atau profil. `through` membatasi ID tertinggi dari halaman pertama; ini bukan snapshot transaksi, sehingga penghapusan peserta selama ekspor tetap berpengaruh. Simpan hasil secara terbatas sesuai kebutuhan integrasi dan kebijakan retensi panitia.

## Menetapkan pemenang melalui HTTP

`POST /api/integrations/doorprize/winners/bulk`, `Content-Type: application/json`:

```json
{
  "batchId": "draw-2026-round-01",
  "winners": [
    {
      "externalId": "draw-2026-winner-001",
      "participantId": 123,
      "nip": "TEST-001",
      "prizeName": "Hadiah Utama",
      "description": "Silakan menuju meja penyerahan hadiah.",
      "imageUrl": null,
      "claimLocation": "Meja Doorprize",
      "claimDeadline": "2026-10-03T18:00:00+07:00"
    }
  ]
}
```

Maksimum 100 pemenang dan 256 KiB per batch. ID dan NIP harus cocok dengan peserta yang masih terdaftar. Seluruh batch ditolak bila satu peserta tidak valid. Satu peserta boleh menerima beberapa hadiah dengan `externalId` berbeda. `externalId` unik global; `batchId` unik untuk satu payload berurutan yang sama.

Respons sukses: `{"batchId":"draw-2026-round-01","count":1,"replayed":false}`. Kirim ulang **batchId dan isi yang sama** jika koneksi putus atau server sementara gagal; respons ulang memiliki `replayed:true`, tanpa menggandakan hadiah. Mengganti isi batch atau menggunakan ulang externalId menghasilkan 409. Untuk 429 tunggu satu menit; untuk kegagalan sementara gunakan retry dengan exponential backoff dan jitter. Jangan retry otomatis error validasi atau konflik dengan batch baru.

`description` opsional, maksimum 300 karakter. `claimDeadline` boleh null; timestamp menggunakan ISO 8601 dengan zona waktu. `imageUrl` boleh null (ikon piala), atau path lokal `/prize-assets/nama-versi.webp` (PNG/JPG/JPEG juga diterima). Letakkan gambar publik dalam `frontend/prize-assets/` lalu rilis frontend. URL eksternal tidak diterima. Nama hadiah dan lokasi wajib, maksimum 160 karakter.

## Menetapkan pemenang melalui WebSocket

Hubungkan backend sistem undian ke `wss://familyday.id/api/integrations/doorprize/live` dengan header `Authorization: Bearer <TOKEN>`. Koneksi ini server-to-server tanpa header Origin; bukan WebSocket browser. Tunggu pesan `{"type":"ready","integrationId":1}`.

Kirim `{"type":"winners.bulk","payload":{...payload HTTP di atas...}}`. Tunggu acknowledgment sebelum batch berikutnya:

```json
{ "type": "winners.accepted", "batchId": "draw-2026-round-01", "count": 1, "replayed": false }
```

Error berbentuk `{"type":"error","status":409,"message":"..."}`. Batas payload, otorisasi, rate limit, dan idempotensi sama dengan HTTP. Bila disconnect sebelum acknowledgment, reconnect lalu ulangi batch identik. Koneksi bukan bukti batch sudah tersimpan; acknowledgment adalah konfirmasinya. Library klien perlu menjawab ping (library `ws` melakukannya secara otomatis).

## Notifikasi dan klaim peserta

Peserta mendapatkan data hadiah miliknya melalui sesi login. Browser mengambil tiket WebSocket sekali pakai (30 detik) melalui POST ber-CSRF, lalu membuka `/api/participant/live` menggunakan subprotocol `familyday-v1` dan tiket. Token integrasi tidak digunakan peserta.

Transaksi pemenang menyimpan outbox. Worker memublikasikan invalidasi melalui Redis ke koneksi peserta terkait; browser mengambil ulang daftar hadiah pribadi. Tidak ada broadcast NIP, QR, atau daftar pemenang ke semua peserta. Reconnect mengambil kondisi database terbaru; saat socket terputus, halaman terlihat melakukan fallback refresh setiap 60–75 detik. Pesan dapat terkirim ulang dan bukan jaminan notifikasi muncul ketika perangkat offline. Halaman yang dibuka kembali tetap menampilkan hadiah tersimpan.

QR klaim berisi token acak `FDPRIZE:...`. Peserta memperlihatkannya kepada petugas berizin di menu Doorprize. Petugas memindai kamera (browser yang mendukung), scanner USB, atau memasukkan kode, memeriksa identitas/hadiah, lalu mengonfirmasi penyerahan. Server menyimpan timestamp dan petugas. Penyerahan bersamaan hanya tercatat sekali. Peserta tidak bisa mengonfirmasi sendiri; hadiah lewat tenggat tidak dapat diklaim. Bukti penyerahan muncul setelah status server berubah.

## Rilis dan validasi

Jalankan migration `008_doorprize.js` melalui proses migrasi yang ada **sebelum** menjalankan API baru. Cadangkan database mengikuti prosedur operasional. Migrasi menambah tabel tanpa mengubah data peserta lama. Untuk rollback aplikasi, pertahankan tabel dan data hadiah; jangan jalankan migration down setelah hadiah diterbitkan. Buat kunci integrasi dari dashboard setelah rilis dan lakukan uji dengan peserta sintetis yang disepakati.

Uji lokal mencakup ekspor minimal, RBAC, kecocokan ID/NIP, transaksi batch, idempotensi, isolasi antar peserta, WebSocket masuk/keluar, serta penyerahan bersamaan. Tampilan diuji pada viewport mobile dan desktop. Kapasitas 100.000 koneksi aktif belum dibuktikan oleh uji ini: perlu load test terpisah, quota/concurrency Cloud Run, kapasitas Redis/database, dan pengamatan reconnect serta latensi outbox. Jangan menyamakan keberhasilan functional test dengan jaminan kapasitas produksi.
