# Setup Konfigurasi API Keys

## 📋 Ringkasan

File `config.js` berisi API keys yang sensitif dan **TIDAK akan di-upload ke GitHub**. File ini sudah ditambahkan ke `.gitignore` untuk keamanan.

## 🔧 Cara Setup

### Untuk Pengembang Baru (Clone Repository)

1. **Copy file template:**
   ```bash
   cp config.example.js config.js
   ```

2. **Edit file `config.js`** dan isi dengan API keys Anda:
   - **Firebase API Keys**: Dapatkan dari [Firebase Console](https://console.firebase.google.com/)
     - Buka Project Settings > General > Your apps
     - Copy semua nilai dari Firebase config
   - **Gemini API Key**: Dapatkan dari [Google AI Studio](https://aistudio.google.com/apikey)
     - Buat API key baru atau gunakan yang sudah ada

3. **Pastikan file `config.js` tidak di-commit:**
   - File ini sudah ada di `.gitignore`
   - Jangan pernah commit file ini ke repository!

### Untuk Pengembang yang Sudah Memiliki config.js

- File `config.js` Anda sudah ada dan tidak perlu diubah
- Pastikan file ini tidak ter-commit ke GitHub

## 🔒 Keamanan

### ✅ Yang Sudah Dilakukan

- ✅ File `config.js` sudah ditambahkan ke `.gitignore`
- ✅ File `config.example.js` (template) akan di-commit sebagai contoh
- ✅ Kode sudah diupdate untuk membaca dari `config.js`
- ✅ Semua HTML files sudah diupdate untuk memuat `config.js` terlebih dahulu

### ⚠️ Peringatan

1. **JANGAN** commit file `config.js` ke repository
2. **JANGAN** share API keys melalui email, chat, atau media lain
3. **JANGAN** hardcode API keys langsung di file JavaScript
4. Jika API key ter-expose, segera regenerate di console masing-masing

## 📁 Struktur File

```
AeroNexa/
├── config.js              # ❌ TIDAK di-commit (berisi API keys sebenarnya)
├── config.example.js      # ✅ Di-commit (template saja)
├── .gitignore            # ✅ Sudah include config.js
├── firebase-config.js    # ✅ Membaca dari config.js
└── ai-chat.js            # ✅ Membaca dari config.js
```

## 🧪 Testing

Setelah setup `config.js`, test aplikasi:

1. Buka aplikasi di browser
2. Check console browser (F12)
3. Pastikan tidak ada error tentang "config.js not found"
4. Test fitur yang menggunakan Firebase dan Gemini API

## 📝 Catatan

- Jika `config.js` tidak ditemukan, aplikasi akan menggunakan fallback values (untuk development)
- Di production, selalu pastikan `config.js` ada dan berisi API keys yang valid
- Firebase API key sebenarnya bisa public di client-side (dibatasi domain), tapi tetap lebih baik disimpan di config file

## 🆘 Troubleshooting

### Error: "config.js not found"
- Pastikan file `config.js` sudah dibuat dari `config.example.js`
- Pastikan file ada di root directory project

### Error: "API key invalid"
- Pastikan API keys di `config.js` sudah benar
- Check apakah API key sudah di-enable di console masing-masing
- Untuk Gemini: pastikan billing sudah diaktifkan (jika diperlukan)

### Aplikasi tidak berfungsi setelah update
- Clear browser cache
- Pastikan `config.js` dimuat sebelum `firebase-config.js` di HTML
- Check console browser untuk error messages
