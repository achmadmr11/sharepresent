# 📡 SharePresent — Real-Time Presentation Sharing (Lintas Jaringan)

Aplikasi berbasis web untuk berbagi slide presentasi secara interaktif dan real-time. Audience dapat melihat layar presentasi presenter secara sinkron hanya dengan mengetikkan **6-digit kode join** atau **scan QR code** dari smartphone, tablet, maupun laptop masing-masing.

> 🌐 **Bebas Jaringan (Tidak Harus Satu Wi-Fi)**: Penonton dapat menggunakan kuota seluler (4G/5G), Wi-Fi rumah, jaringan kantor yang berbeda, atau bahkan berada di kota/negara lain.

---

## ✨ Fitur Utama

### 👨‍🏫 Untuk Presenter (Host)
1. **Kode Unik & QR Code Otomatis**:
   - Dapatkan 6 digit PIN acak dan kode QR beresolusi tinggi yang siap di-scan audiens menggunakan kamera ponsel.
2. **Sinkronisasi Ultra-Cepat**:
   - Setiap pergantian slide langsung terefleksi ke semua layar audiens secara instan.
3. **🔴 Real-Time Laser Pointer**:
   - Tekan tombol **L** atau klik ikon Laser Pointer. Titik laser neon merah dan jejak animasinya akan bergerak di layar semua audiens mengikuti pergerakan kursor Anda.
4. **✏️ Live Annotation & Drawing Canvas**:
   - Tekan tombol **D** untuk mencoret, melingkari, atau menandai poin penting pada slide dengan berbagai pilihan warna.
5. **Dukungan Berbagai Sumber Konten**:
   - **Slide Keynote Bawaan**: Template slide tech modern (Hero, Fitur Kartu, Langkah Panduan, Blok Kode).
   - **Upload File PDF (PowerPoint / Canva)**: Upload file `.pdf` presentasi Anda; setiap halaman akan dirender otomatis menjadi slide beresolusi tajam.
   - **Live Screen Share (WebRTC)**: Bagikan layar laptop/aplikasi proyektor Anda secara live streaming peer-to-peer menggunakan STUN server.
6. **📊 Live Polling / Kuis**:
   - Luncurkan pertanyaan polling cepat dengan pilihan ganda, dan saksikan diagram batang hasil voting audiens naik secara real-time.
7. **💬 Moderasi Tanya Jawab (Q&A)**:
   - Pantau pertanyaan yang diajukan audiens, jumlah upvote, dan tandai pertanyaan yang sudah dijawab.
8. **⏱️ Presentation Timer & Catatan Speaker**:
   - Stopwatch presentasi dan panel catatan pembicara tersembunyi khusus untuk presenter.

---

### 👥 Untuk Audience (Penonton)
1. **Join Instan**:
   - Cukup buka browser dan masukkan 6-digit kode, atau scan QR code dari kamera HP (tanpa install aplikasi apa pun).
2. **Tampilan Responsif 16:9**:
   - Tampilan slide menyesuaikan ukuran layar HP, tablet, maupun monitor secara proporsional.
3. **🎉 Floating Emoji Reactions**:
   - Kirimkan reaksi langsung seperti ❤️, 👏, 🔥, 💡, dan 🙋‍♂️ yang akan melayang indah di layar presentasi semua peserta.
4. **💬 Tanya Jawab & Upvote**:
   - Ajukan pertanyaan ke presenter atau berikan upvote pada pertanyaan peserta lain yang menarik.
5. **📊 Mengisi Polling Langsung**:
   - Banner notifikasi otomatis muncul saat presenter meluncurkan polling, memungkinkan audiens langsung memilih jawaban dan melihat persentase hasil voting.
6. **🔓 Mode Navigasi Mandiri (Opsional)**:
   - Jika presenter mengaktifkan izin jelajah, audiens dapat melihat slide sebelumnya/berikutnya sendiri dan kembali ke slide presenter kapan saja dengan tombol *"Ikuti Presenter"*.

---

## 🛠️ Arsitektur & Teknologi

```text
[ Presenter ] (Laptop / PC)
     │
     ├─── 1. WebSocket Signalling (Slide state, Laser coords, Strokes, Q&A, Polls) ───> [ Node.js Server ]
     │                                                                                          │
     └─── 2. WebRTC PeerStream (Google STUN: stun.l.google.com:19302) ──────────────────────────┤
                                                                                                ▼
                                                                                   [ Audience Smartphone / Laptop ]
                                                                                   (Bisa beda Wi-Fi / Paket Data)
```

- **Backend**: Node.js, Express, Socket.IO, CORS.
- **Frontend**: Vanilla HTML5, CSS3 Glassmorphism Modern, JavaScript ES6+.
- **Pustaka Pendukung**:
  - `socket.io-client`: Komunikasi real-time dua arah berkecepatan tinggi.
  - `peerjs`: Streaming layar langsung WebRTC P2P lintas firewall menggunakan Google Public STUN.
  - `pdf.js`: Render file presentasi PDF langsung di browser klien.
  - `qrcodejs`: Generator kode QR dinamis tanpa ketergantungan API pihak ketiga.
  - `canvas-confetti`: Efek animasi selebrasi visual.

---

## 🚀 Cara Menjalankan Secara Lokal

1. **Buka Terminal di Direktori Proyek**:
   ```bash
   npm install
   ```

2. **Jalankan Server**:
   ```bash
   npm start
   ```

3. **Buka di Browser**:
   - **Halaman Utama (Presenter / Buat Ruangan)**: [http://localhost:3000](http://localhost:3000)
   - **Halaman Khusus Penonton (Hanya Masukkan Kode)**: [http://localhost:3000/join](http://localhost:3000/join)

4. **Uji Coba Multi-Device (Simulasi)**:
   - **Tab 1 (Presenter)**: Buka [http://localhost:3000](http://localhost:3000), klik *"Buat Ruangan Presentasi 🚀"*. Catat 6 digit kode ruangan (misal: `748291`).
   - **Tab 2 / Smartphone (Penonton)**: Buka [http://localhost:3000/join](http://localhost:3000/join), masukkan 6 digit kode tersebut, lalu klik *"Masuk Ruangan Presentasi"*.
   - Gerakkan mouse dengan tombol **L** (Laser Pointer) di Tab 1, maka titik laser merah akan langsung muncul di Tab 2!

---

## 🌐 Cara Akses Lintas Jaringan di Internet (Publik)

Agar penonton di luar ruangan atau di tempat yang berbeda bisa mengakses tanpa konfigurasi IP lokal:

### Opsi A: Menggunakan Cloudflare Tunnel / Ngrok (Gratis & Cepat untuk Demo)
Jika ingin membagikan presentasi dari laptop Anda langsung ke internet:
```bash
# Menggunakan Cloudflare Tunnel (tanpa registrasi):
npx cloudflared tunnel --url http://localhost:3000

# Atau menggunakan Ngrok:
npx ngrok http 3000
```
Anda akan mendapatkan link publik HTTPS (contoh: `https://presentasi-anda.trycloudflare.com`) yang bisa dibuka oleh siapa saja di smartphone mereka.

### Opsi B: Deploy ke Cloud Hosting Gratis
Aplikasi ini sudah siap langsung dideploy ke platform cloud seperti:
- **Render.com** (Pilih *Web Service*, Build Command: `npm install`, Start Command: `npm start`)
- **Railway.app** (Hubungkan repository GitHub Anda, deploy otomatis)
- **VPS / DigitalOcean / Ubuntu Server** (Jalankan dengan `pm2 start server.js`)

---

## ⌨️ Shortcut Keyboard untuk Presenter

| Tombol | Aksi |
|---|---|
| `→` / `Space` / `PageDown` | Slide Selanjutnya |
| `←` / `PageUp` | Slide Sebelumnya |
| `L` | Mengaktifkan / Mematikan **Laser Pointer** |
| `D` | Mengaktifkan / Mematikan **Pen Coretan (Drawing)** |
| `F11` | Mode Layar Penuh (Fullscreen) |
