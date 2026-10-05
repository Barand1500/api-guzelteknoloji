import type { View } from "../../shared/types";

export type GuideStep = {
  view: View;
  target: string;
  title: string;
  eyebrow: string;
  text: string;
  questions: { question: string; answer: string }[];
};

export function guideSteps(hasCategory: boolean): GuideStep[] {
  const steps: GuideStep[] = [
    {
      view: "dashboard", target: ".workspace-nav", eyebrow: "Yön bulma", title: "Her şey sol menüde başlıyor",
      text: "Buradan yönetim, istatistik, deneme alanı, şema ve API anahtarları arasında geçiş yaparsın. Üstteki arama alanı da sayfa ve kayıt bulur.",
      questions: [
        { question: "Menü çok yer kaplıyor mu?", answer: "Sol panelin boş bir yerine çift tıklayarak yalnız ikonların kaldığı görünüme geçebilirsin. Yeniden çift tıklayınca açılır." },
        { question: "Bir sayfayı hızlı bulabilir miyim?", answer: "Ctrl+K ile genel aramayı aç. Sayfa, kategori, sütun, kayıt ve API anahtarı adlarında arama yapabilirsin." },
      ],
    },
    {
      view: "dashboard", target: ".dashboard-page", eyebrow: "Genel Yönetim", title: "Veri kaynaklarını tek yerden gör",
      text: "Kategoriler burada kart veya liste görünümünde bulunur. Her kategorinin API durumunu değiştirebilir, adresini kopyalayabilir veya yönetim ekranını açabilirsin.",
      questions: [
        { question: "API'yi kapatırsam veriler silinir mi?", answer: "Hayır. Kapatma yalnız dışarıdan erişimi durdurur; kategori ve kayıtlar veritabanında kalır." },
        { question: "Kategoriye nasıl kayıt eklerim?", answer: "Kategoriyi yönet düğmesiyle tablo editörünü aç. Sütunlarını ve satırlarını oradan kaydedebilirsin." },
      ],
    },
    {
      view: "new", target: ".new-category-page", eyebrow: "API yapısı", title: "Klasörlerle düzen kur",
      text: "Yeni Kategori ekranında klasöre girip alt klasör veya kategori oluşturursun. Bir klasöre verilen API anahtarı altındaki kategorilere de erişebilir.",
      questions: [
        { question: "Klasörün kendisi veri tablosu mu?", answer: "Hayır. Klasör kategorileri toplar; paket API'si içindeki etkin kategorileri birlikte döndürür." },
        { question: "Tek kategoriyi ayrı verebilir miyim?", answer: "Evet. API anahtarında tekil kategori kapsamını seçerek yalnız istediğin tabloları açabilirsin." },
      ],
    },
  ];
  if (hasCategory) steps.push({
    view: "manage", target: ".category-editor-page", eyebrow: "Tablo Yönetimi", title: "Sütunları ve kayıtları oluştur",
    text: "Sütun türünü adım adım seç, satırları doldur ve alttaki Kaydet düğmesine bas. ID ile tarihler otomatik gelir; görünmelerini tablo araçlarından değiştirebilirsin.",
    questions: [
      { question: "Görseli nereye kaydetmeliyim?", answer: "Sütun oluştururken uploads seçersen dosya sunucuda tutulur. Base64 seçersen görsel veritabanına yazılır; çok sayıda görselde uploads daha hafiftir." },
      { question: "İlişki alanı ne işe yarar?", answer: "Başka kategorideki kaydı seçtirir ve MySQL üzerinde gerçek bir foreign key bağlantısı kurar." },
    ],
  });
  steps.push(
    {
      view: "keys", target: ".keys-page", eyebrow: "Erişim", title: "Her projeye kendi anahtarını ver",
      text: "API anahtarını klasör kapsamı veya seçili kategoriler için oluştur. Böylece bir projeye yalnız ihtiyacı olan verileri açarsın.",
      questions: [
        { question: "Klasöre sonradan kategori eklersem?", answer: "Klasör kapsamlı anahtar alt klasörleri ve sonradan eklenecek kategorileri de kapsar." },
        { question: "Anahtarı durdurabilir miyim?", answer: "API Anahtarları tablosundaki durum denetimiyle anahtarı pasif hale getirebilirsin." },
      ],
    },
    {
      view: "playground", target: ".playground-page", eyebrow: "Kontrol", title: "API'yi burada dene",
      text: "Kategori veya klasör paketi seç, anahtarını gir ve sunucunun döndürdüğü gerçek JSON yanıtını gör. Canlı bağlantıyı başka projeye vermeden önce burası en hızlı kontrol noktası.",
      questions: [
        { question: "Anahtar adres satırına yazılır mı?", answer: "Hayır. Deneme isteği sunucu üzerinden doğrulanır; anahtar tarayıcı adresine eklenmez." },
        { question: "Klasör paketini deneyebilir miyim?", answer: "Evet. Kapsam seçiminde Klasör paketi'ni seçerek içindeki kategorileri tek yanıtta görebilirsin." },
      ],
    },
    {
      view: "statistics", target: ".statistics-page", eyebrow: "Trafik", title: "Kullanımı takip et",
      text: "İstek sayısını, en çok kullanılan kategorileri ve son istekleri incele. Tarih aralığıyla trafiğin ne zaman arttığını görebilirsin.",
      questions: [
        { question: "Hangi proje çok istek yapıyor?", answer: "Proje sıralamasından görebilir, alttaki istek geçmişinde kayıtları filtreleyebilirsin." },
        { question: "Klasör isteği nasıl sayılıyor?", answer: "Bir klasör paketi çağrısı tek istek olarak kaydedilir." },
      ],
    },
    {
      view: "schema-keys", target: ".schema-page", eyebrow: "Veritabanı", title: "Gerçek tabloyu incele",
      text: "Şema ekranında soldan tabloyu seçip sütunlarını ve içindeki kayıtları görürsün. Kategoriye yeni sütun ekledikten sonra veritabanındaki sonucunu burada kontrol edebilirsin.",
      questions: [
        { question: "Şemadan veriyi değiştirebilir miyim?", answer: "Bu ekran inceleme içindir. Değişiklik yapmak için ilgili kategorinin Tablo Yönetimi ekranına git." },
        { question: "Yeni tabloyu nasıl bulurum?", answer: "Soldaki tablo listesinden seçebilir veya tablo aramasını kullanabilirsin." },
      ],
    },
  );
  return steps;
}
