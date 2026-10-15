# Tahsilat public API

AnyPay (müşteri) bu uçlara bağlanır.

## Base

```
https://api.guzelteknoloji.com/v1/tahsilat
```

Header: `X-API-Key`

Panelde: API Anahtarları → ilgili kategorilere veya **Tahsilat** klasörüne yetki ver.

## Uçlar

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Kaynak listesi |
| GET | `/health` | Sağlık |
| GET | `/bins` | BIN kataloğu |
| GET | `/bins/lookup?bin=` | Lookup |
| GET | `/banks` | Bankalar |
| GET | `/provinces` | İller |
| GET | `/districts?province=` | İlçeler |
| GET | `/card-types` | Kart tipleri |
| GET | `/card-kinds` | Kart türleri |
| GET | `/card-brands` | Kart markaları |

## AnyPay ayarı

- Kaynak: **uzak**
- Base URL: `https://api.guzelteknoloji.com/v1/tahsilat`
- API Key: merkezden alınan anahtar (Tahsilat klasörü / ilgili kategoriler yetkili)

Kapalıysa yerel DB kullanılır (bozulmaz).

Eski yol `.../v1/bins` hâlâ çalışır.

## Panel → DB

Tahsilat menüsünden girilen BIN / banka / il / ilçe / kart meta verileri
`PUT /admin/tahsilat/:resource` ile MySQL’e yazılır. AnyPay aynı tabloları
public uçlardan okur.
