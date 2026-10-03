# Proje çalışma kuralları

Bu dosya bu depoda çalışan kod ajanları için geçerlidir.

## Kaynak düzeni

- React sayfalarını `frontend/src/pages/<sayfa>/` altında tut. Sayfaya özel bileşenleri, yardımcıları ve CSS'i aynı klasöre koy.
- Birden fazla sayfada kullanılan küçük bileşenleri, tipleri, API istemcisini ve ortak stilleri `frontend/src/shared/` altında tut.
- `frontend/src/App.tsx` yalnızca sayfalar arası geçişi ve üst düzey oturum durumunu yönetsin. Sayfa arayüzlerini burada büyütme.
- Sunucu kodunu `src/backend/` altında tut; route, kimlik doğrulama, şema ve veritabanı işlemlerini sorumluluğuna göre ayrı modüllere ayır. `src/server.ts` yalnızca giriş dosyasıdır.
- Türkçe arayüz metinlerini ve kaynakları UTF-8 olarak kaydet. Bozuk karakterleri veya minify edilmiş kaynak kodu commit etme.

## Derleme çıktıları

- `public/` Vite tarafından üretilir. Bu klasördeki `assets/`, `index.html` ve diğer çıktıları elle düzenleme veya Git'e ekleme.
- Statik kaynak görselleri `frontend/public/` içine koy. `npm run build` çıktıyı `public/` içinde yeniden üretir.
- `dist/` ve `node_modules/` da kaynak kod değildir; Git'e ekleme.

## Değişiklik disiplini

- Var olan çalışma ağacı değişikliklerini kullanıcıya ait kabul et. İlgisiz dosyaları temizleme veya commit etme.
- Davranışı koruyan refaktörlerde önce importları ve dosya konumlarını düzenle; sonra `npm run build` ve frontend tip kontrolü ile doğrula.
- Veritabanı şemasını değiştiren işleri açık migrasyon ve mevcut veriyi koruma planıyla uygula. Yönetim ekranı, API ve depolama davranışını birlikte güncelle.
- Kategori tablolarındaki dinamik SQL tanımlayıcılarını yalnızca doğrulanmış metadata üzerinden üret. Satır değerlerini parametreli sorgularla yaz. Eski JSON tablolarını veri geçişi yapılmadan silme.
- Commit ve push öncesinde hangi dosyaların dahil olduğunu kontrol et. Kullanıcının bu oturumdaki Git gönderme yetkisi geçerlidir.
