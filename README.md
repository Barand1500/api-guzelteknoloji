# Güzel Teknoloji API Servisi

## Kod düzeni

- `src/backend/`: Express route'ları, kimlik doğrulama, MySQL şeması ve kategori işlemleri.
- `src/server.ts`: PM2 ve `npm start` için ince giriş dosyası.
- `frontend/src/pages/`: Sayfa bazlı React bileşenleri ve sayfa stilleri.
- `frontend/src/shared/`: Ortak API istemcisi, tipler, bileşenler ve stiller.
- `frontend/public/`: Derlemeye kopyalanan kaynak görseller.
- `public/`: `npm run build` ile üretilen çıktı. Git tarafından izlenmez; elle düzenlenmez.

Projede çalışan kod ajanları için ayrıntılı kurallar `AGENTS.md` içindedir.

## Fiziksel kategori tabloları

Her kategori için adı ve kimliği temel alınan ayrı bir InnoDB tablosu oluşturulur. Örneğin `Ülkeler` kategorisi `gtk_12_ulkeler` adıyla saklanır. `id`, `active`, `created_at` ve `updated_at` alanları sistem tarafından yönetilir. Yönetim panelinde oluşturulan diğer sütunlar bu tabloya gerçek SQL sütunları olarak eklenir. Bağlamsal anahtar sütunları başka bir kategori tablosunun `id` alanına gerçek MySQL foreign key ile bağlanır.

İlk açılışta mevcut `api_category_rows` JSON kayıtları yeni fiziksel tablolara kopyalanır. `api_migration_state` geçişin tamamlandığını işaretler; sonraki açılışlarda silinmiş kayıtlar eski JSON'dan geri gelmez. Eski JSON tabloları otomatik silinmez ve geri dönüş için yedek olarak kalır. Üretim deploy'undan önce ayrıca MySQL yedeği alınmalıdır.

Sunucudaki `DATABASE_URL` kullanıcısının `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` ve `REFERENCES` yetkileri gerekir. `JWT_SECRET` ve `ADMIN_PASSWORD` değerleri `.env` içinde tanımlı olmalıdır; servis bu bilgiler eksikken başlamaz.

Panelin "Değişiklikleri kaydet" işlemi sütun değişikliklerini ve kayıtları tek API isteğiyle gönderir. Satırlar MySQL transaction içinde yazılır. MySQL DDL işlemleri (sütun ekleme/silme) transaction ile geri alınamadığı için hata durumunda panel hatayı gösterir; yeniden açılan şema veritabanının gerçek durumunu yansıtır.

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
