# SentralAmbulan.id — Sistem Pemesanan & Pelacakan Ambulans Terpadu

Sistem manajemen, pemesanan, dan pelacakan ambulans satu pintu yang dirancang khusus untuk mengatasi fragmentasi layanan ambulans di Kota Bandung. Menggunakan pendekatan desain *Clean Brutalist-Minimalis* (fokus informasi, tanpa ikon, tanpa sudut membulat, dan kontras tinggi).

---

## 🔄 Alur Operasional Aplikasi (Application Workflow)

Proses penanganan kedaruratan (Emergency SOS) dari sisi Pengguna (Customer), Pengemudi (Driver), hingga Tenaga Medis (Nurse) berjalan dengan alur tersinkronisasi secara *real-time* berikut:

### 1. Fase Inisiasi & Panggilan (Dispatch)
* **Pengguna (Customer):** Mengalami/melihat kondisi darurat ➡️ Membuka platform ➡️ Menekan tombol utama **[ PANGGIL SOS SEKARANG ]**.
* **Sistem:** Mendeteksi lokasi GPS pengguna secara otomatis dan langsung mengalihkan (*redirect*) halaman customer ke **Halaman Status & Radar Maps Real-Time**.

### 2. Fase Penerimaan Tugas (Acceptance)
* **Driver Ambulans:** Menerima notifikasi panggilan darurat masuk pada dasbor driver ➡️ Meninjau lokasi ➡️ Menekan tombol **[ TERIMA PANGGILAN SOS ]**.
* **Sistem:** * Menampilkan visualisasi peta navigasi rute menuju koordinat customer pada layar perangkat Driver.
  * Mengubah status transaksi menjadi **`Confirmed`** di sisi driver dan **`Telah Dikonfirmasi`** di sisi customer secara instan via WebSockets.

### 3. Fase Penjemputan (En Route)
* **Driver Ambulans:** Menekan tombol **[ MULAI MENUJU LOKASI JEMPUT ]** saat unit mulai bergerak.
* **Sistem:** Mengubah status perjalanan menjadi **`On The Way` (OTW)**. Peta di layar customer akan memperbarui posisi pergerakan unit secara *live*.
* **Pengguna (Customer):** Di bagian bawah halaman pelacakan, sistem secara dinamis memunculkan **Formulir Isian Data Pasien**. Customer mengisi data awal medis lalu menekan tombol **[ SIMPAN DATA PASIEN ]**.
* **Driver Ambulans:** Data medis awal yang diinput customer otomatis muncul dan dapat dibaca langsung pada dasbor driver sebagai panduan persiapan.

### 4. Fase Tiba di Lokasi & Penanganan Medis (On Site)
* **Driver Ambulans:** Tiba di titik koordinat customer ➡️ Menekan tombol **[ TIBA DI LOKASI JEMPUT ]** ➡️ Status perjalanan diperbarui di sistem.
* **Driver Ambulans:** Setelah pasien dievakuasi ke dalam kabin mobil ➡️ Menekan tombol **[ MULAI ANTAR PASIEN ]** menuju rumah sakit rujukan ➡️ Status berubah menjadi **`Underway to Hospital`**.
* **Perawat Ambulans (Nurse):** Melakukan tindakan penanganan medis di dalam ambulans ➡️ Mengisi **Formulir Detail Klinis Pasien** (kondisi vital, tindakan awal) melalui perangkat perawat ➡️ Menekan tombol **[ SIMPAN DATA MEDIS PASIEN ]** untuk merekam rekam medis darurat ke *Database* sistem.

### 5. Fase Penyelesaian & Retensi Akun (Completion & Feedback)
* **Driver Ambulans:** Tiba di RS tujuan dan penyerahan pasien selesai ➡️ Menekan tombol **[ PERJALANAN SELESAI ]**.
* **Sistem:** Mengubah status transaksi akhir menjadi **`Trip Completed`** di seluruh dasbor.
* **Pengguna (Customer):** * **Retensi Akun:** Jika pemesan menggunakan fitur SOS *Guest* (belum memiliki akun resmi), sistem secara otomatis memunculkan **Formulir Simpan Akun Permanen** agar data trip mereka tidak hilang.
  * **Umpan Balik:** Pengguna mengisi **Formulir Ulasan & Rating** untuk menilai performa kru ambulans.
* **Sistem Analitik:** Data ulasan yang dikirim customer didistribusikan otomatis ke dua tempat:
  1. Masuk ke komponen **Detail Riwayat Trip** pada halaman akun Driver.
  2. Masuk ke komponen **Riwayat Pendampingan Medis** pada halaman akun Perawat (Contoh: *Nurse PMI 02*).

---

## 🛠️ Arsitektur Teknologi

* **Frontend:** React.js, Tailwind CSS (Utilitarian Styling), Inertia.js.
* **Backend:** Laravel, MySQL/PostgreSQL (Spatial Data support untuk tipe data `Point` koordinat GPS).
* **Real-time Sync:** Laravel Reverb / WebSockets API.
* **Mapping Engine:** Leaflet.js / Google Maps API (Tanpa dekorasi ornamen/ikon).

---
&copy; 2026 SentralAmbulan.id. Hak Cipta Dilindungi.
