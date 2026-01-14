# AeroNexa

AeroNexa adalah sistem monitoring kualitas udara dalam ruangan berbasis AI yang dirancang untuk mendeteksi dan mencegah Building Related Illness (BRI) serta melindungi kesehatan pengguna.

## 📋 Tentang Aplikasi

AeroNexa adalah solusi monitoring kualitas udara yang menggabungkan teknologi sensor canggih dengan kecerdasan buatan (AI) untuk menciptakan sistem manajemen kualitas udara dalam ruangan yang komprehensif.

### Fitur Utama

- **Monitoring Real-time**: Memantau 7 parameter kualitas udara secara real-time
- **AI-Powered Analysis**: Analisis cerdas dengan algoritma machine learning
- **Dashboard Interaktif**: Visualisasi data dengan floor plan yang dapat diedit
- **Sistem Alert**: Notifikasi instan untuk masalah kualitas udara kritis
- **Analytics & Trends**: Analisis data dan visualisasi tren historis
- **Multi-Room Comparison**: Perbandingan kualitas udara antar ruangan
- **AI Chat Assistant**: Asisten AI untuk rekomendasi dan bantuan

### Parameter yang Dimonitor

Aplikasi ini memantau 7 parameter kualitas udara:

1. **Dust Particles (PM2.5)** - Partikel debu halus
2. **Carbon Dioxide (CO2)** - Karbon dioksida
3. **Temperature** - Suhu ruangan
4. **Humidity** - Kelembaban udara
5. **Air Pressure** - Tekanan udara
6. **Hazardous Gas** - Gas berbahaya
7. **Smoke** - Asap

## 🚀 Cara Menggunakan

### 1. Akses Aplikasi

- Buka file `index.html` di browser untuk melihat halaman utama
- Atau deploy ke Firebase Hosting untuk akses online

### 2. Registrasi & Login

- Klik tombol **Login** di halaman utama
- Pilih metode login:
  - **Email & Password**: Daftar dengan email dan password baru
  - **Google Sign-In**: Login menggunakan akun Google

### 3. Dashboard

Setelah login, Anda akan diarahkan ke halaman Dashboard yang menampilkan:

- **Floor Plan**: Peta denah lantai dengan visualisasi ruangan
- **Status Ruangan**: Indikator warna untuk setiap ruangan:
  - 🟢 **Hijau**: Kualitas udara baik
  - 🟡 **Kuning**: Perlu perhatian
  - 🔴 **Merah**: Berbahaya

**Cara Menggunakan Dashboard:**
- Pilih lantai dari dropdown "Floor"
- Klik tombol **Edit** untuk mengedit floor plan
- Klik pada ruangan untuk melihat detail sensor

### 4. Edit Floor Plan

- Klik tombol **Edit** di Dashboard
- Atau akses langsung melalui `editor.html`
- **Cara Menggambar Ruangan:**
  - Klik **Start Drawing** untuk mulai menggambar
  - Pilih mode:
    - **Rectangle**: Klik dan drag untuk membuat ruangan persegi
    - **Line**: Klik beberapa titik untuk membuat ruangan poligon
  - Klik **Save** setelah selesai mengedit

### 5. Devices (Perangkat)

- Akses melalui menu **Devices** di navigasi bawah
- Lihat daftar semua perangkat sensor AeroNexa
- Monitor status dan informasi setiap perangkat

### 6. Analytics

- Akses melalui menu **Analytics**
- Lihat grafik tren untuk:
  - CO2 (ppm)
  - Temperature (°C)
  - Humidity (%)
- Pilih rentang waktu: 24 Jam, 7 Hari, atau 30 Hari

### 7. Alerts (Notifikasi)

- Akses melalui menu **Alerts** atau ikon bell di header
- Lihat semua peringatan kualitas udara
- Filter berdasarkan: All, Critical, Warning, atau Info

### 8. AI Chat Assistant

- Klik tombol AI mengambang di pojok kanan bawah
- Atau akses melalui `ai-chat.html`
- Tanyakan tentang:
  - Rekomendasi untuk meningkatkan kualitas udara
  - Penjelasan tentang parameter sensor
  - Tips kesehatan terkait kualitas udara

### 9. Profile

- Akses melalui menu **Profile** di navigasi bawah
- Lihat dan edit informasi profil
- Kelola pengaturan akun

## 🛠️ Teknologi yang Digunakan

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Firebase
  - Firebase Authentication (Email/Password & Google)
  - Cloud Firestore (Database)
  - Realtime Database (Real-time updates)
  - Firebase Hosting
- **Libraries**:
  - Chart.js (untuk grafik analytics)
  - Font Awesome (ikon)
  - Blueprint.js (untuk floor plan editor)

## 📁 Struktur File

```
AeroNexa/
├── index.html              # Halaman utama/landing page
├── auth.html               # Halaman login & registrasi
├── dashboard.html          # Dashboard monitoring
├── editor.html             # Editor floor plan
├── devices.html            # Manajemen perangkat
├── analytics.html          # Analytics & trends
├── alerts.html             # Notifikasi & alerts
├── ai-chat.html            # AI Chat Assistant
├── profile.html            # Profil pengguna
├── app.js                  # Logika utama aplikasi
├── firebase-config.js      # Konfigurasi Firebase
├── auth-guard.js           # Proteksi halaman (authentication)
├── devices.js              # Logika manajemen perangkat
├── alerts.js               # Logika sistem alert
├── ai-chat.js              # Logika AI chat
├── floor-plan-editor-v2.js # Editor floor plan
├── styles.css              # Styling utama
├── index.css               # Styling halaman utama
└── firebase.json           # Konfigurasi Firebase Hosting
```

## 🔧 Setup & Deployment

### Setup Lokal

1. Clone atau download repository
2. Buka file `index.html` di browser
3. Untuk fitur lengkap, setup Firebase:
   - Buat project di [Firebase Console](https://console.firebase.google.com)
   - Update konfigurasi di `firebase-config.js`
   - Enable Authentication (Email/Password & Google)
   - Buat Firestore Database
   - Setup Realtime Database

### Deploy ke Firebase Hosting

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login ke Firebase:
   ```bash
   firebase login
   ```

3. Deploy:
   ```bash
   firebase deploy
   ```

## 📱 Fitur Mobile

Aplikasi ini responsive dan dapat digunakan di:
- Desktop (browser)
- Tablet
- Smartphone (mobile web app)

## 🔐 Keamanan

- Semua halaman dilindungi dengan authentication guard
- Data pengguna disimpan dengan aman di Firebase
- Firestore Security Rules mengatur akses data

## 📞 Kontak & Support

Untuk pertanyaan atau dukungan, hubungi:
- Email: info@aeronexa.com
- Website: [AeroNexa](https://aeronexa-id.web.app)

## 👥 Tim Pengembang

- **Sugeng Margono** - Software
- **Maheswara Rizal Hafidz** - IoT
- **Revand Jethro Setiawan** - 3D Desain
- **Awfa** - Electrical Engineering

## 📄 Lisensi

© 2024 AeroNexa. All rights reserved.

---

**Catatan**: Pastikan konfigurasi Firebase sudah benar sebelum menggunakan aplikasi. Beberapa fitur memerlukan koneksi internet dan autentikasi pengguna.
