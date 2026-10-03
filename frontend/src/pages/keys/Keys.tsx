import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, FileKey2, Folder, KeyRound, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { request } from "../../shared/api";
import type { ApiKey, Category, CategoryFolder } from "../../shared/types";
import "./keys.css";

export default function Keys({ token }: { token: string }) {
  const [rows, setRows] = useState<ApiKey[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [folders, setFolders] = useState<CategoryFolder[]>([]);
  const [accessType, setAccessType] = useState<"folder" | "category">("folder");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [pageSizeText, setPageSizeText] = useState("10");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const modalRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [keys, available, availableFolders] = await Promise.all([
        request<ApiKey[]>("/admin/api-keys", token),
        request<Category[]>("/admin/categories", token),
        request<CategoryFolder[]>("/admin/category-folders", token),
      ]);
      setRows(keys);
      setCategories(available);
      setFolders(availableFolders);
      setAccessType(current => current === "folder" && !availableFolders.length ? "category" : current);
      setError("");
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (modalRef.current) gsap.fromTo(modalRef.current, { opacity: 0, y: 16, scale: .97 }, { opacity: 1, y: 0, scale: 1, duration: .25, ease: "power2.out" });
  }, [creating, deleteTarget]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("tr-TR");
    return rows.filter(row =>
      (status === "all" || row.active === (status === "active")) &&
      (!search || [row.projectName, row.apiKey, ...row.categoryNames, ...row.folderNames].some(value => value.toLocaleLowerCase("tr-TR").includes(search)))
    );
  }, [rows, query, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const shown = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  function folderPath(folderId: number | null): string {
    const path: string[] = [];
    let current = folderId === null ? undefined : folders.find(folder => folder.id === folderId);
    while (current) {
      path.unshift(current.name);
      const parentId = current.parentId;
      current = parentId === null ? undefined : folders.find(folder => folder.id === parentId);
    }
    return path.join(" / ");
  }
  useEffect(() => setPage(1), [query, status, pageSize]);
  function applyPageSize(raw: string) {
    const value = Math.min(99, Math.max(1, Number(raw) || 10));
    setPageSize(value);
    setPageSizeText(String(value));
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectName = String(form.get("projectName") || "").trim();
    const categoryIds = accessType === "category" ? form.getAll("categoryIds").map(Number) : [];
    const folderValue = accessType === "folder" ? Number(form.get("folderId")) : 0;
    const folderIds = folderValue ? [folderValue] : [];
    if (!projectName || (!categoryIds.length && !folderIds.length)) { setError("Proje adı ve erişim kapsamı seçin."); return; }
    setBusy(true); setError("");
    try {
      await request("/admin/api-keys", token, { method: "POST", body: JSON.stringify({ projectName, categoryIds, folderIds }) });
      setCreating(false); setPage(1); await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function toggle(row: ApiKey) {
    setBusy(true); setError("");
    try {
      await request(`/admin/api-keys/${row.id}`, token, { method: "PATCH", body: JSON.stringify({ active: !row.active }) });
      setRows(current => current.map(item => item.id === row.id ? { ...item, active: !item.active } : item));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleteTarget) return;
    setBusy(true); setError("");
    try {
      await request(`/admin/api-keys/${deleteTarget.id}`, token, { method: "DELETE" });
      setRows(current => current.filter(item => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(current => current === value ? null : current), 1800);
    } catch { setError("API anahtarı kopyalanamadı."); }
  }

  return <div className="keys-page">
    <div className="keys-heading">
      <div><span className="keys-kicker"><KeyRound size={14} /> ERİŞİM YÖNETİMİ</span><h1>API Anahtarları</h1><p>Projelerin hangi kategorilere erişebileceğini buradan yönetin.</p></div>
      <button className="keys-primary" onClick={() => { setError(""); setCreating(true); }}><Plus size={17} /> Yeni anahtar</button>
    </div>
    <section className="keys-panel">
      <div className="keys-toolbar">
        <label className="keys-page-size"><input inputMode="numeric" value={pageSizeText} onChange={event => setPageSizeText(event.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={() => applyPageSize(pageSizeText)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label="Sayfa başına kayıt" /> veri göster</label>
        <div className="keys-tools"><label className="keys-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Proje, API Key veya kategori ara..." aria-label="Anahtarlarda ara" /></label><select value={status} onChange={event => setStatus(event.target.value as typeof status)} aria-label="Duruma göre filtrele"><option value="all">Tüm durumlar</option><option value="active">Açık</option><option value="inactive">Kapalı</option></select></div>
      </div>
      <div className="keys-table-wrap"><table className="keys-table"><thead><tr><th>Proje</th><th>İzin verilen kategoriler</th><th>API Key</th><th>Site</th><th>İstek</th><th>Durum</th><th aria-label="İşlem" /></tr></thead><tbody>{shown.map(row => <tr key={row.id}>
        <td><span className="keys-project"><span className="keys-project-icon"><FileKey2 size={18} /></span><strong>{row.projectName}</strong></span></td>
        <td><div className="keys-tags">{row.folderNames.map(name => <span className="folder-scope" key={`folder-${name}`}><Folder size={12} />{name} + alt klasörleri</span>)}{row.categoryNames.map(name => <span key={`category-${name}`}>{name}</span>)}{!row.categoryNames.length && !row.folderNames.length && <em>Kategori seçilmemiş</em>}</div></td>
        <td className="keys-value-cell"><div className="keys-value"><code>{row.apiKey}</code><button onClick={() => void copy(row.apiKey)} title="API Key kopyala" aria-label="API Key kopyala">{copied === row.apiKey ? <Check size={16} /> : <Copy size={16} />}</button></div></td>
        <td className="keys-number">{row.siteCount}</td><td className="keys-number">{row.usageCount}</td>
        <td><button className={`keys-status ${row.active ? "active" : "inactive"}`} disabled={busy} onClick={() => void toggle(row)} title="Durumu değiştir"><span />{row.active ? "Açık" : "Kapalı"}</button></td>
        <td><button className="keys-delete" onClick={() => { setError(""); setDeleteTarget(row); }} title="Anahtarı sil" aria-label={`${row.projectName} anahtarını sil`}><Trash2 size={17} /></button></td>
      </tr>)}</tbody></table>{!loading && !shown.length && <div className="keys-empty"><ShieldCheck size={28} /><strong>{query || status !== "all" ? "Eşleşen anahtar yok" : "Henüz API anahtarı yok"}</strong><p>{query || status !== "all" ? "Arama veya filtreyi değiştirebilirsiniz." : "İlk anahtarınızı oluşturarak bir projeye erişim verin."}</p></div>}{loading && <div className="keys-empty">Anahtarlar yükleniyor...</div>}</div>
      <div className="keys-pagination"><span>{filtered.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)} arasında veri gösteriliyor. Toplam: {filtered.length}</span><div><button onClick={() => setPage(1)} disabled={safePage <= 1}>İlk</button><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={safePage <= 1}><ChevronLeft size={15} /> Geri</button><strong>{safePage}</strong><button onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={safePage >= totalPages}>İleri <ChevronRight size={15} /></button><button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages}>Son</button></div></div>
    </section>
    {error && !creating && !deleteTarget && <p className="keys-error" role="alert">{error}</p>}
    {creating && <div className="keys-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setCreating(false); }}><div ref={modalRef} className="keys-modal" role="dialog" aria-modal="true" aria-labelledby="keys-create-title"><button className="keys-modal-close" onClick={() => setCreating(false)} aria-label="Kapat"><X size={18} /></button><span className="keys-modal-icon"><KeyRound size={21} /></span><h2 id="keys-create-title">Yeni API anahtarı</h2><p>Bir anahtar klasörün tamamına veya seçtiğiniz tekil kategorilere erişebilir.</p><form onSubmit={event => void create(event)}><label className="keys-field">Proje / site adı<input name="projectName" placeholder="Örn. Anypay Tahsilat" required autoFocus /></label>
      <div className="keys-scope-options"><label><input type="radio" name="scopeType" checked={accessType === "folder"} onChange={() => setAccessType("folder")} disabled={!folders.length} /><span><strong>Klasör kapsamı</strong><small>Alt klasör ve ileride eklenecek kategoriler dahil</small></span></label><label><input type="radio" name="scopeType" checked={accessType === "category"} onChange={() => setAccessType("category")} disabled={!categories.length} /><span><strong>Tekil kategoriler</strong><small>Yalnızca seçtiğiniz tablolar</small></span></label></div>
      {accessType === "folder" ? <label className="keys-field">Erişim verilecek klasör<select name="folderId" required disabled={!folders.length}><option value="">Klasör seçin</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select><small>Klasörün alt klasörleri ve sonradan eklenecek kategoriler de kapsama girer.</small>{!folders.length && <small>Önce Yeni Kategori ekranından bir klasör oluşturun.</small>}</label> : <div className="keys-field">İzin verilen kategoriler<div className="keys-category-options">{categories.map(category => <label key={category.id}><input type="checkbox" name="categoryIds" value={category.id} />{category.folderPath ? `${category.folderPath} / ` : ""}{category.name}</label>)}{!categories.length && <small>Önce bir kategori oluşturun.</small>}</div></div>}
      {error && <span className="keys-error" role="alert">{error}</span>}<div className="keys-modal-actions"><button type="button" onClick={() => setCreating(false)}>Vazgeç</button><button className="keys-primary" disabled={busy || (accessType === "folder" ? !folders.length : !categories.length)} type="submit">{busy ? "Oluşturuluyor..." : "Anahtar oluştur"}</button></div></form></div></div>}
    {deleteTarget && <div className="keys-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setDeleteTarget(null); }}><div ref={modalRef} className="keys-modal keys-delete-modal" role="dialog" aria-modal="true" aria-labelledby="keys-delete-title"><button className="keys-modal-close" onClick={() => setDeleteTarget(null)} aria-label="Kapat"><X size={18} /></button><span className="keys-modal-icon danger"><Trash2 size={21} /></span><h2 id="keys-delete-title">API anahtarı silinsin mi?</h2><p><strong>{deleteTarget.projectName}</strong> projesinin erişimi hemen sona erecek.</p>{error && <span className="keys-error" role="alert">{error}</span>}<div className="keys-modal-actions"><button onClick={() => setDeleteTarget(null)}>Vazgeç</button><button className="keys-danger" disabled={busy} onClick={() => void remove()}>{busy ? "Siliniyor..." : "Anahtarı sil"}</button></div></div></div>}
  </div>;
}
