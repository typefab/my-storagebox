# My Drive — Storagebox File Manager

Interfaccia web simile a Google Drive per gestire i file su Hetzner Storagebox.

## Stack
- **Frontend**: React + Vite
- **Backend**: Node.js + Express + ssh2-sftp-client
- **Preview**: Sharp (thumbnail immagini in RAM)
- **Deploy**: Render.com (free tier)

## Deploy su Render

### 1. Carica su GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TUO_USERNAME/my-drive.git
git push -u origin main
```

### 2. Crea il servizio su Render
1. Vai su render.com → New → Web Service
2. Collega il tuo repo GitHub
3. Render rileverà automaticamente il Dockerfile

### 3. Aggiungi le variabili d'ambiente
Nel pannello Render → Environment:
```
SFTP_HOST = uXXXXXX.your-storagebox.de
SFTP_USER = uXXXXXX
SFTP_PASS = la-tua-password
SFTP_PORT = 23
```

### 4. UptimeRobot (server sempre sveglio)
1. Registrati su uptimerobot.com
2. New Monitor → HTTP(s)
3. URL: https://tuo-app.onrender.com/health
4. Interval: 5 minuti

## Sviluppo locale
```bash
# Backend
cd backend && npm install && npm start

# Frontend (altro terminale)
cd frontend && npm install && npm run dev
```

## Funzionalità
- Navigazione cartelle
- Upload (drag & drop supportato)
- Download
- Copia / Taglia / Incolla
- Rinomina
- Elimina
- Preview immagini (click singolo = thumbnail, doppio click = full)
- Vista griglia e lista
- Ricerca file
- Thumbnail con cache in RAM
