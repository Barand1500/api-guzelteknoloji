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

SMTP values can also be updated from **Ayarlar → E-posta/SMTP Ayarları**. Panel overrides are stored in MySQL; the SMTP password is encrypted with AES-256-GCM and is never returned to the browser. Set `SMTP_SETTINGS_ENCRYPTION_KEY` in the server `.env` before saving a new password. Generate a key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep this key private and persistent: changing or losing it makes previously saved SMTP passwords unreadable. `SMTP_SECURE=false` is appropriate for STARTTLS on port 587; use `true` for direct TLS, commonly on port 465. The settings screen can send a test message to `ADMIN_EMAIL`.

## Panel tools

The administration panel includes combined request statistics/history, an authenticated API playground, schema/API-key management, persistent appearance preferences, and filtering/bulk actions in the category editor. Appearance preferences include four self-hosted font families and 0–10 quick-access slots. Categories can be organized into nested folders; API keys can target a folder tree (including future categories) or selected individual categories. Folder metadata and folder-scoped key grants are created during database initialization. Panel preferences and SMTP overrides use `api_panel_preferences` and `api_smtp_settings`.

The read-only database table inventory is available with `npm run db:audit`. It reports row counts and possible legacy category tables; it never drops tables. Review `database-audit.txt` and inspect the report before approving any cleanup.

## Klasör paketi API'si

`GET /v1/folders/:folderId` veya `GET /api/folders/:folderId` isteğinde `X-API-Key` başlığı gönderilir. Anahtarın seçilen klasöre veya üst klasörlerinden birine **klasör yetkisi** olması gerekir. Tekil kategori yetkisi klasör paketine erişim vermez. Yanıt seçilen klasörü ve bütün alt klasörlerini `groups` dizisinde ayrı ayrı döndürür; her grubun `categories` dizisi etkin kategorilerin güncel kayıtlarını içerir. Mevcut tek kategori adresleri (`/v1/:slug` ve `/api/categories/:slug`) değişmez.

Örnek yanıt:

```json
{
  "success": true,
  "folder": { "id": 3, "name": "Ödeme Altyapısı" },
  "groups": [
    { "folder": { "id": 4, "name": "Bankalar", "path": "Ödeme Altyapısı / Bankalar" },
      "categories": [{ "id": 9, "name": "Banka Listesi", "slug": "bankalar", "data": [] }] }
  ]
}
```

Bir paket çağrısı istatistiklerde tek istek olarak kaydedilir. İlk deploy sırasında `api_usage_logs.folder_id` nullable sütunu ve foreign key'i eklenir; eski istek kayıtları korunur. Üretim deploy'undan önce MySQL yedeği alın.

## Git ile deploy

Sunucuda proje bir kez klonlandıktan sonra:

```bash
chmod +x deploy.sh
./deploy.sh
```

Sonraki güncellemelerde aynı komut GitHub'dan `main` dalını çeker, derler ve PM2'yi yeniden başlatır. `.env` sunucuda kalır; Git'ten silinmez veya üzerine yazılmaz.

Deploy önce sunucu kodunu ve ön yüzü geçici klasörlere derler. `index.html` içindeki JS/CSS referanslarını doğruladıktan sonra `dist/` ve `public/` klasörlerini yeni sürümle değiştirir. PM2 yeniden başlatılamazsa önceki klasörleri geri yükler. Başarılı deploy sonunda eski `public/assets` dosyaları da kaldırılmış olur; çalışan sürümün assetlerini elle silmeyin.

Bu deploy düzenine ilk geçişte sunucuda önce proje klasörüne girin:

```bash
cd ~/htdocs/api.guzelteknoloji.com
git pull --ff-only origin main
./deploy.sh
```

Sonraki güncellemelerde aynı klasörde yalnızca `./deploy.sh` çalıştırın. Font seçenekleri korunur, ancak derleme yalnızca Türkçe/Latin yazı tiplerini içerir. Dosya adlarının sonundaki hash ve tek satırlı JS/CSS üretim çıktısının normal biçimidir.
