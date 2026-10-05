import { ArrowRight, BookOpen, Database, FileKey2, FolderTree, Play, Radar, Table2 } from "lucide-react";
import type { View } from "../../shared/types";
import "./guide.css";

const chapters: { view: View; title: string; summary: string; icon: typeof Database; preview: string }[] = [
  { view: "dashboard", title: "Genel Yönetim", summary: "Kategorileri ve servis durumunu yönet.", icon: Database, preview: "cards" },
  { view: "new", title: "Klasör ve kategori", summary: "API yapını klasörlerle düzenle.", icon: FolderTree, preview: "folders" },
  { view: "manage", title: "Tablo Yönetimi", summary: "Sütun ve kayıtları oluşturup kaydet.", icon: Table2, preview: "table" },
  { view: "keys", title: "API Anahtarları", summary: "Projelerin veri erişimini belirle.", icon: FileKey2, preview: "keys" },
  { view: "playground", title: "API Deneme Alanı", summary: "Gerçek JSON yanıtını kontrol et.", icon: Play, preview: "code" },
  { view: "statistics", title: "İstatistikler", summary: "İstekleri ve kullanım eğilimini izle.", icon: Radar, preview: "bars" },
];

function MiniPreview({ variant }: { variant: string }) {
  return <div className={`guide-mini guide-mini-${variant}`} aria-hidden="true">
    <div className="guide-mini-top"><i /><i /><i /></div>
    <div className="guide-mini-body">
      {variant === "bars" ? <><b /><b /><b /><b /><b /><b /><b /></> :
       variant === "code" ? <><code>{"{ "}</code><code>"success": true,</code><code>"data": [...]</code><code>{"}"}</code></> :
       variant === "folders" ? <><b>▣</b><b>▣</b><b>▣</b></> :
       <><b /><b /><b /></>}
    </div>
  </div>;
}

export default function Guide({ onStart, onOpen, hasCategory }: { onStart: () => void; onOpen: (view: View) => void; hasCategory: boolean }) {
  return <div className="guide-page">
    <div className="guide-heading"><span><BookOpen size={17} /> REHBER</span><h1>Paneli birlikte keşfedelim</h1><p>Kısa bir turla her bölümün ne işe yaradığını gerçek ekranlarda gör.</p></div>
    <section className="guide-hero">
      <div className="guide-hero-copy"><span className="guide-hero-eyebrow">ETKİLEŞİMLİ TUR</span><h2>Merhaba, ben rehberin.</h2><p>Sayfaları seninle açacağım, önemli yerleri göstereceğim. Aklına bir soru gelirse her adımda bana sorabilirsin.</p><button type="button" onClick={onStart}><Play size={17} fill="currentColor" /> Turu başlat <ArrowRight size={17} /></button><small>Yaklaşık 3 dakika · İstediğin zaman çıkabilirsin</small></div>
      <div className="guide-hero-mascot"><div className="guide-mascot-halo" /><video autoPlay loop muted playsInline preload="metadata" poster="/guide-mascot-poster.png" aria-label="Hareketli robot rehber"><source src="/guide-mascot.webm" type="video/webm" />Robot rehber</video><span className="guide-mascot-speech">Hazır mısın? 👋</span></div>
    </section>
    <div className="guide-chapters-heading"><div><span>BÖLÜMLER</span><h2>Kendi hızında incele</h2></div><p>İstediğin karta tıklayıp doğrudan o ekrana geç.</p></div>
    <div className="guide-chapters">{chapters.filter(chapter => chapter.view !== "manage" || hasCategory).map((chapter, index) => {
      const Icon = chapter.icon;
      return <button className="guide-chapter" key={chapter.view} onClick={() => onOpen(chapter.view)}>
        <MiniPreview variant={chapter.preview} />
        <div className="guide-chapter-meta"><span className="guide-chapter-icon"><Icon size={19} /></span><small>{String(index + 1).padStart(2, "0")}</small></div>
        <strong>{chapter.title}</strong><span>{chapter.summary}</span><em>Sayfayı aç <ArrowRight size={15} /></em>
      </button>;
    })}</div>
    <p className="guide-credit">Hareketli maskot: <a href="https://github.com/theGoodB0rg/VideoMascot" target="_blank" rel="noreferrer">VideoMascot / Nexus Bot</a> · MIT lisansı</p>
  </div>;
}
