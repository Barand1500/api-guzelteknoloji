import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { Check, GripVertical, RotateCcw, Save, Search, SlidersHorizontal, X } from "lucide-react";
import { NavIcon } from "../../shared/NavIcon";
import type { PanelPage, PanelPreferences } from "../../shared/types";
import "./appearance.css";

const sidebarPages: { id: PanelPage; label: string; icon: string }[] = [
  { id: "dashboard", label: "Genel Yönetim", icon: "home" },
  { id: "statistics", label: "İstatistikler", icon: "chart" },
  { id: "playground", label: "API Deneme Alanı", icon: "play" },
  { id: "schema-keys", label: "Şema ve Anahtarlar", icon: "database" },
  { id: "keys", label: "API Anahtarları", icon: "briefcase" },
];
const quickPages: { id: PanelPage; label: string; icon: string }[] = [
  ...sidebarPages,
  { id: "new", label: "Yeni Kategori", icon: "code" },
  { id: "settings", label: "Ayarlar", icon: "gear" },
  { id: "appearance", label: "Görünüm", icon: "sliders" },
];
const defaultPreferences: PanelPreferences = {
  sidebarOrder: sidebarPages.map(page => page.id),
  quickAccess: ["dashboard", "keys", null, null, null, null],
  searchWidth: 300,
};

export default function Appearance({ preferences, onSave }: { preferences: PanelPreferences; onSave: (value: PanelPreferences) => Promise<void> }) {
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<{ view: PanelPage; zone: "sidebar" | "quick" } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(preferences), [preferences]);
  useEffect(() => {
    if (rootRef.current) gsap.fromTo(rootRef.current.querySelectorAll("[data-appearance-card]"),
      { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.06, ease: "power2.out" });
  }, []);

  const pageFor = (id: PanelPage) => quickPages.find(page => page.id === id);
  function reorderSidebar(target: PanelPage) {
    if (!dragged || dragged.zone !== "sidebar") return;
    const next = [...draft.sidebarOrder];
    const from = next.indexOf(dragged.view), to = next.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    setDraft(current => ({ ...current, sidebarOrder: next }));
  }
  function putQuickAccess(index: number) {
    if (!dragged) return;
    const next = [...draft.quickAccess];
    next.forEach((item, slot) => { if (item === dragged.view) next[slot] = null; });
    next[index] = dragged.view;
    setDraft(current => ({ ...current, quickAccess: next }));
  }
  function removeQuickAccess(index: number) {
    setDraft(current => ({ ...current, quickAccess: current.quickAccess.map((item, slot) => slot === index ? null : item) }));
  }
  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await onSave(draft);
      setSaved(true);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="appearance-page" ref={rootRef}>
    <header className="appearance-heading">
      <span className="appearance-kicker"><SlidersHorizontal size={14} /> KİŞİSELLEŞTİRME</span>
      <h1>Görünüm</h1>
      <p>Menü sırasını, hızlı erişim kutularını ve arama alanı genişliğini düzenleyin.</p>
    </header>
    <section className="appearance-card" data-appearance-card>
      <div className="appearance-card-head"><span><GripVertical size={18} /></span><div><h2>Sol menü sırası</h2><p>Sayfaları tutup sürükleyerek sıralayın.</p></div></div>
      <div className="appearance-sort-list">
        {draft.sidebarOrder.map(id => {
          const page = sidebarPages.find(item => item.id === id);
          if (!page) return null;
          return <div key={id} className="appearance-sort-item" draggable onDragStart={event => { setDragged({ view: id, zone: "sidebar" }); event.dataTransfer.setData("text/plain", id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragged(null)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorderSidebar(id); }}>
            <GripVertical size={16} /><NavIcon name={page.icon} size={18} /><strong>{page.label}</strong><small>Menüde gösterilir</small>
          </div>;
        })}
      </div>
    </section>
    <section className="appearance-card" data-appearance-card>
      <div className="appearance-card-head"><span><Search size={18} /></span><div><h2>Arama alanı</h2><p>Üst çubuktaki arama kutusunun genişliğini ayarlayın.</p></div><strong className="appearance-width-value">{draft.searchWidth}px</strong></div>
      <input className="appearance-range" type="range" min="180" max="520" step="10" value={draft.searchWidth} onChange={event => { setSaved(false); setDraft(current => ({ ...current, searchWidth: Number(event.target.value) })); }} aria-label="Arama alanı genişliği" />
      <div className="appearance-range-labels"><span>Dar</span><span>Geniş</span></div>
    </section>
    <section className="appearance-card" data-appearance-card>
      <div className="appearance-card-head"><span><SlidersHorizontal size={18} /></span><div><h2>Hızlı erişim</h2><p>Sayfaları kutulara sürükleyin; kutuyu boşaltmak için × seçin.</p></div></div>
      <div className="appearance-page-palette">
        {quickPages.map(page => <div key={page.id} draggable onDragStart={event => { setDragged({ view: page.id, zone: "quick" }); event.dataTransfer.setData("text/plain", page.id); event.dataTransfer.effectAllowed = "copy"; }} onDragEnd={() => setDragged(null)}><NavIcon name={page.icon} size={16} />{page.label}</div>)}
      </div>
      <div className="appearance-quick-slots">
        {Array.from({ length: 6 }, (_, index) => {
          const page = draft.quickAccess[index] ? pageFor(draft.quickAccess[index]!) : undefined;
          return <div key={index} className={`appearance-quick-slot ${dragged ? "ready" : ""}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); putQuickAccess(index); setDragged(null); }}>
            <small>Kutu {index + 1}</small>
            {page ? <div className="appearance-quick-item"><NavIcon name={page.icon} size={17} /><strong>{page.label}</strong><button type="button" onClick={() => removeQuickAccess(index)} aria-label={`${page.label} hızlı erişimden çıkar`}><X size={15} /></button></div> : <span>Buraya sürükleyin</span>}
          </div>;
        })}
      </div>
    </section>
    <footer className="appearance-save">
      <span role="status">{error ? <em>{error}</em> : saved ? <i><Check size={15} /> Tercihler veritabanına kaydedildi.</i> : "Düzenlemeler yalnızca kaydedildiğinde hesabınıza uygulanır."}</span>
      <div><button type="button" onClick={() => { setDraft(defaultPreferences); setSaved(false); }}><RotateCcw size={15} /> Varsayılanlar</button><button type="button" disabled={saving} onClick={() => void save()}><Save size={15} />{saving ? "Kaydediliyor..." : "Kaydet"}</button></div>
    </footer>
  </div>;
}
