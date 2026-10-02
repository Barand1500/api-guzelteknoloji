# Güzel Teknoloji API Servisi

AnyPay'den bağımsız çalışan veri servisi ve yönetim panelidir.

## Yerel çalıştırma

```bash
npm install
cp .env.example .env
npm run dev
```

Panel: `http://localhost:4010`

## Sunucu / PM2

```bash
npm install
cp .env.example .env
npm run build
pm2 start dist/server.js --name guzel-api
pm2 save
pm2 startup
```

Alan adı reverse proxy ile bu servisin portuna yönlendirilmelidir. İlk giriş bilgileri `.env` içinden okunur; kurulumdan sonra değiştirin.

## SMTP quick login

The "Hizli Giris" option emails a one-time 6-digit code to `ADMIN_EMAIL`. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optional `SMTP_FROM` in the server `.env`. Codes expire after 5 minutes, allow up to 5 attempts, and can be requested once per minute.

## Git ile deploy

Sunucuda proje bir kez klonlandıktan sonra:

```bash
chmod +x deploy.sh
./deploy.sh
```

Sonraki güncellemelerde aynı komut GitHub'dan `main` dalını çeker, derler ve PM2'yi yeniden başlatır. `.env` sunucuda kalır; Git'ten silinmez veya üzerine yazılmaz.
