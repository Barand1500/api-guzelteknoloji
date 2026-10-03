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

Her kategori için adı temel alınan ayrı bir InnoDB tablosu oluşturulur. Örneğin `Ülkeler` kategorisi `ulkeler` adıyla saklanır. Sütun adları da kullanıcının girdiği adın küçük harfli, Türkçe karakterleri ASCII'ye çevrilmiş SQL karşılığıdır. `id` her tabloda 1'den başlayan `BIGINT AUTO_INCREMENT` birincil anahtardır. `active`, `created_at` ve `updated_at` alanları sistem tarafından yönetilir. Bağlamsal anahtar sütunları başka bir kategori tablosunun sayısal `id` alanına gerçek MySQL foreign key ile bağlanır.

İlk açılışta mevcut `api_category_rows` JSON kayıtları eski fiziksel biçime kopyalanır; ardından `readable_tables_v2` migrasyonu okunur adlarla yeni tablolar kurar, satırları artan ID'lerle kopyalar ve ilişkileri yeni ID'lere bağlar. `api_migration_state` geçişin tamamlandığını işaretler. Eski tablolar otomatik silinmez ve geri dönüş için yedek olarak kalır. Aynı SQL adına dönüşen kategori veya sütunlar varsa migrasyon hata verir; adları düzeltip yeniden başlatın. Üretim deploy'undan önce ayrıca MySQL yedeği alınmalıdır. Bu geçiş fiziksel tablo adlarını, sütun adlarını ve satır ID'lerini değiştirdiği için bu isimleri doğrudan kullanan harici istemciler güncellenmelidir.

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
