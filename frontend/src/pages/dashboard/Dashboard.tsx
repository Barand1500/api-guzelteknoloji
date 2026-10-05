import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Copy, LayoutGrid, List, Plus, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { request } from "../../shared/api";
import { NavIcon } from "../../shared/NavIcon";
import type { Category, State } from "../../shared/types";
import { Loading } from "../../shared/ui";

const iconChoices = [
  ["code", "Kod"], ["home", "Ev"], ["briefcase", "Çanta"], ["pulse", "Nabız"],
  ["pay", "Ödeme"], ["chart", "Grafik"], ["sliders", "Ayar"], ["gear", "Çark"],
  ["globe", "Dünya"], ["map", "Konum"], ["building", "Bina"], ["users", "Kişiler"],
  ["user", "Kişi"], ["folder", "Klasör"], ["data", "Veritabanı"], ["server", "Sunucu"],
  ["document", "Belge"], ["package", "Paket"], ["shop", "Mağaza"], ["book", "Kitap"],
  ["layers", "Katman"], ["shield", "Güvenlik"], ["link", "Bağlantı"], ["zap", "Enerji"],
  ["calendar", "Takvim"], ["cloud", "Bulut"], ["key", "Anahtar"], ["tag", "Etiket"],
  ["boxes", "Kutular"],
] as const;

export default function Dashboard({ token, manage, create }: {
  token: string; manage: (category: Category) => void; create: () => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"grid" | "list">(() => localStorage.getItem("gtk_category_view") === "list" ? "list" : "grid");
  const [copied, setCopied] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [iconTarget, setIconTarget] = useState<Category | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => request<State>("/admin/state", token).then(setState), [token]);
  useEffect(() => { void load().catch(reason => setError((reason as Error).message)); }, [load]);
  useEffect(() => {
    if (modalRef.current) gsap.fromTo(modalRef.current, { autoAlpha: 0, y: 16, scale: .97 }, { autoAlpha: 1, y: 0, scale: 1, duration: .28, ease: "power2.out" });
  }, [confirmStop, deleteTarget, iconTarget]);
  useEffect(() => {
    if (!cardsRef.current) return;
    gsap.fromTo(cardsRef.current.querySelectorAll(".dash-category-card"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .35, stagger: .04, ease: "power2.out" });
  }, [state?.categories.length, mode]);
  const categories = useMemo(() => (state?.categories || []).filter(category =>
    `${category.name} ${category.slug} ${category.folderPath || ""}`.toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR"))
  ), [state, query]);

  function changeView(next: "grid" | "list") {
    setMode(next);
    localStorage.setItem("gtk_category_view", next);
  }
  async function copy(category: Category) {
    try {
      await navigator.clipboard.writeText(new URL(`/api/categories/${category.slug}`, window.location.origin).toString());
      setCopied(category.id);
      window.setTimeout(() => setCopied(current => current === category.id ? null : current), 1700);
    } catch { setError("API adresi kopyalanamadı."); }
  }
  async function remove() {
    if (!deleteTarget) return;
    setBusy(true); setError("");
    try {
      await request(`/admin/categories/${deleteTarget.id}`, token, { method: "DELETE" });
      setState(current => current ? { ...current, categories: current.categories.filter(item => item.id !== deleteTarget.id) } : current);
      setDeleteTarget(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function setService(enabled: boolean) {
    setBusy(true); setError("");
    try {
      await request("/admin/state", token, { method: "PATCH", body: JSON.stringify({ enabled }) });
      setState(current => current ? { ...current, enabled } : current);
      setConfirmStop(false);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function setCategoryActive(category: Category) {
    setBusy(true); setError("");
    try {
      const active = !category.active;
      await request(`/admin/categories/${category.id}`, token, { method: "PATCH", body: JSON.stringify({ active }) });
      setState(current => current ? { ...current, categories: current.categories.map(item => item.id === category.id ? { ...item, active } : item) } : current);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function setIcon(category: Category, icon: string) {
    setBusy(true); setError("");
    try {
      await request(`/admin/categories/${category.id}`, token, { method: "PATCH", body: JSON.stringify({ icon }) });
      setState(current => current ? { ...current, categories: current.categories.map(item => item.id === category.id ? { ...item, icon } : item) } : current);
      setIconTarget(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  if (!state) return <Loading />;
  const currentIcon = iconTarget && state.categories.find(item => item.id === iconTarget.id);

  return <div className="dashboard-page">
    <div className="dash-heading"><div><span className="dash-eyebrow">API YÖNETİMİ</span><h1>Genel Yönetim</h1></div><div className={`dash-service ${state.enabled ? "running" : "stopped"}`}><span className="dash-service-dot" /><div><strong>{state.enabled ? "Servis çalışıyor" : "Servis duraklatıldı"}</strong><small>Genel API durumu</small></div><button className={state.enabled ? "stop" : "start"} disabled={busy} onClick={() => state.enabled ? setConfirmStop(true) : void setService(true)}>{state.enabled ? "Durdur" : "Başlat"}</button></div></div>
    <section className="dash-section">
      <div className="dash-toolbar"><h2>Kategoriler</h2><div className="dash-toolbar-actions"><label className="dash-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Kategori ara" aria-label="Kategori ara" /></label><div className={`dash-view-switch ${mode}`} role="group" aria-label="Kategori görünümü"><span className="dash-view-indicator" aria-hidden /><button className={mode === "grid" ? "active" : ""} onClick={() => changeView("grid")} title="Kart görünümü" aria-label="Kart görünümü" aria-pressed={mode === "grid"}><LayoutGrid size={18} /></button><button className={mode === "list" ? "active" : ""} onClick={() => changeView("list")} title="Liste görünümü" aria-label="Liste görünümü" aria-pressed={mode === "list"}><List size={19} /></button></div><button className="dash-add" onClick={create}><Plus size={18} /> Yeni kategori</button></div></div>
      {categories.length ? <div className={`dash-category-grid ${mode}`} ref={cardsRef}>
        {mode === "list" && <div className="dash-list-head" aria-hidden><span>Kategori</span><span>API adresi</span><span>Durum</span><span>İşlemler</span></div>}
        {categories.map(category => <article className="dash-category-card" key={category.id}>
          <div className="dash-card-main"><button className="dash-icon" onClick={() => { setError(""); setIconTarget(category); }} title="Kategori ikonunu değiştir" aria-label={`${category.name} ikonunu değiştir`}><NavIcon name={category.icon || "code"} size={23} /></button><h3 title={category.name}>{category.name}</h3>{mode === "grid" && <button className="dash-delete" disabled={busy} onClick={() => { setError(""); setDeleteTarget(category); }} title="Kategoriyi sil" aria-label={`${category.name} kategorisini sil`}><Trash2 size={18} /></button>}</div>
          <div className="dash-card-endpoint"><span>API ADRESİ</span><button onClick={() => void copy(category)} title="API adresini kopyala"><code>{new URL(`/api/categories/${category.slug}`, window.location.origin).toString()}</code>{copied === category.id ? <Check size={16} /> : <Copy size={16} />}</button></div>
          <button className={`dash-api-switch ${category.active ? "on" : ""}`} role="switch" aria-checked={category.active} aria-label={`${category.name} API erişimini ${category.active ? "kapat" : "aç"}`} disabled={busy} onClick={() => void setCategoryActive(category)}><span className="dash-switch-track"><span className="dash-switch-thumb" /></span><span>{category.active ? "API açık" : "API kapalı"}</span></button>
          <div className="dash-card-actions"><button className="dash-manage" onClick={() => manage(category)}>Kategoriyi yönet <ArrowRight size={17} /></button>{mode === "list" && <button className="dash-delete" disabled={busy} onClick={() => { setError(""); setDeleteTarget(category); }} title="Kategoriyi sil" aria-label={`${category.name} kategorisini sil`}><Trash2 size={18} /></button>}</div>
        </article>)}
      </div> : <div className="dash-empty"><NavIcon name="code" size={29} /><h3>{query ? "Eşleşen kategori yok" : "Henüz kategori yok"}</h3><p>{query ? "Başka bir arama deneyin." : "İlk kategorinizi oluşturun."}</p>{!query && <button onClick={create}><Plus size={16} /> Kategori oluştur</button>}</div>}
    </section>
    {error && !deleteTarget && !iconTarget && !confirmStop && <div className="dash-error" role="alert">{error}</div>}
    {confirmStop && <div className="dash-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setConfirmStop(false); }}><div ref={modalRef} className="dash-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="dash-stop-title"><button className="dash-modal-close" onClick={() => setConfirmStop(false)} aria-label="Kapat"><X size={18} /></button><div className="dash-modal-icon"><ShieldAlert size={24} /></div><h2 id="dash-stop-title">API servisini durdur?</h2><p>Dış uygulamalar kategori verilerine erişemeyecek. Servisi istediğiniz zaman yeniden başlatabilirsiniz.</p>{error && <span className="dash-modal-error" role="alert">{error}</span>}<div className="dash-modal-actions"><button className="cancel" onClick={() => setConfirmStop(false)}>Vazgeç</button><button className="confirm" disabled={busy} onClick={() => void setService(false)}>{busy ? "Durduruluyor..." : "Evet, durdur"}</button></div></div></div>}
    {deleteTarget && <div className="dash-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setDeleteTarget(null); }}><div ref={modalRef} className="dash-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="dash-delete-title"><button className="dash-modal-close" onClick={() => setDeleteTarget(null)} aria-label="Kapat"><X size={18} /></button><div className="dash-modal-icon"><Trash2 size={23} /></div><h2 id="dash-delete-title">Kategori silinsin mi?</h2><p><strong>{deleteTarget.name}</strong> kategorisi ve içindeki tüm kayıtlar kalıcı olarak silinecek.</p>{error && <span className="dash-modal-error" role="alert">{error}</span>}<div className="dash-modal-actions"><button className="cancel" onClick={() => setDeleteTarget(null)}>Vazgeç</button><button className="confirm" disabled={busy} onClick={() => void remove()}>{busy ? "Siliniyor..." : "Kategoriyi sil"}</button></div></div></div>}
    {currentIcon && <div className="dash-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setIconTarget(null); }}><div ref={modalRef} className="dash-icon-dialog" role="dialog" aria-modal="true" aria-labelledby="dash-icon-title"><div className="dash-icon-dialog-head"><div><h2 id="dash-icon-title">İkon seç</h2><p>{currentIcon.name} için bir simge seçin.</p></div><button onClick={() => setIconTarget(null)} aria-label="Kapat"><X size={19} /></button></div><div className="dash-icon-options">{iconChoices.map(([id, label]) => <button key={id} className={(currentIcon.icon || "code") === id ? "selected" : ""} onClick={() => void setIcon(currentIcon, id)} disabled={busy} title={label} aria-label={label}><NavIcon name={id} size={22} /><span>{label}</span></button>)}</div>{error && <span className="dash-modal-error" role="alert">{error}</span>}</div></div>}
  </div>;
}
