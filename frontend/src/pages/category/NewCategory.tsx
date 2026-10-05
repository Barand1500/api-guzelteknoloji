import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Database, Folder, FolderInput, FolderPlus, Home, KeyRound, Plus, RefreshCw, Table2, X } from "lucide-react";
import { request } from "../../shared/api";
import type { ApiKey, Category, CategoryFolder } from "../../shared/types";
import "./new-category.css";

type Props = { token: string; done: () => void; openKeys: () => void; manage: (category: Category) => void; initialFolderId?: number | null; openSequence?: number };
type Dialog = "choose" | "folder" | "category" | null;

function slugFromName(name: string) {
  return name.toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function NewCategory({ token, done, openKeys, manage, initialFolderId = null, openSequence = 0 }: Props) {
  const [folders, setFolders] = useState<CategoryFolder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [movingCategoryId, setMovingCategoryId] = useState<number | null>(null);
  const [folderName, setFolderName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [folderList, categoryList, keyList] = await Promise.all([
        request<CategoryFolder[]>("/admin/category-folders", token),
        request<Category[]>("/admin/categories", token),
        request<ApiKey[]>("/admin/api-keys", token),
      ]);
      setFolders(folderList);
      setCategories(categoryList);
      setApiKeys(keyList);
      window.dispatchEvent(new Event("gtk-folder-tree-updated"));
      setCurrentFolderId(current => current === null || folderList.some(folder => folder.id === current) ? current : null);
      setError("");
    } catch (reason) {
      setError((reason as Error).message || "İçerik yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setCurrentFolderId(initialFolderId); }, [initialFolderId, openSequence]);
  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) setDialog(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, saving]);

  const currentFolder = currentFolderId === null ? null : folders.find(folder => folder.id === currentFolderId) || null;
  const path = useMemo(() => {
    const result: CategoryFolder[] = [];
    const visited = new Set<number>();
    let folder = currentFolder;
    while (folder && !visited.has(folder.id)) {
      visited.add(folder.id);
      result.unshift(folder);
      folder = folder.parentId === null ? null : folders.find(item => item.id === folder!.parentId) || null;
    }
    return result;
  }, [currentFolder, folders]);
  const visibleFolders = folders.filter(folder => folder.parentId === currentFolderId);
  const visibleCategories = categories.filter(category => (category.folderId ?? null) === currentFolderId);
  const folderApiKeys = currentFolderId === null ? [] : apiKeys.filter(key => (key.folderIds || []).includes(currentFolderId));
  const locationLabel = currentFolder?.name || "Ana klasör";

  function openDialog(next: Dialog) {
    setError("");
    setNotice("");
    setDialog(next);
  }
  function openNew() { openDialog(currentFolderId === null ? "folder" : "choose"); }
  function folderPath(id: number | null) {
    if (id === null) return "Ana klasör";
    const names: string[] = [];
    const visited = new Set<number>();
    let folder = folders.find(item => item.id === id);
    while (folder && !visited.has(folder.id)) {
      visited.add(folder.id);
      names.unshift(folder.name);
      folder = folder.parentId === null ? undefined : folders.find(item => item.id === folder!.parentId);
    }
    return names.join(" / ");
  }
  async function copyAccess(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(current => current === value ? "" : current), 1600);
    } catch { setError("Panoya kopyalanamadı."); }
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || saving) return;
    setSaving(true); setError("");
    try {
      const folder = await request<CategoryFolder>("/admin/category-folders", token, {
        method: "POST", body: JSON.stringify({ name, parentId: currentFolderId }),
      });
      setFolderName("");
      setDialog(null);
      await load();
      setCurrentFolderId(folder.id);
      setNotice(`“${folder.name}” klasörü oluşturuldu.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }
  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    const endpoint = slug.trim();
    if (!name || !endpoint || saving) return;
    setSaving(true); setError("");
    try {
      await request<Category>("/admin/categories", token, {
        method: "POST", body: JSON.stringify({ name, slug: endpoint, folderId: currentFolderId }),
      });
      setCategoryName(""); setSlug(""); setDialog(null);
      await load();
      setNotice(`“${name}” kategorisi oluşturuldu.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }
  async function moveCategory(category: Category, folderId: number | null) {
    setSaving(true); setError("");
    try {
      await request(`/admin/categories/${category.id}`, token, { method: "PATCH", body: JSON.stringify({ folderId }) });
      setMovingCategoryId(null);
      await load();
      setNotice(`“${category.name}” taşındı.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  return <div className="new-category-page">
    <div className="new-category-heading">
      <div><span className="new-category-eyebrow">API YAPISI</span><h1>{locationLabel}</h1></div>
      <div className="new-category-heading-actions"><button type="button" className="new-category-home" onClick={done}><ArrowLeft size={17} /> Genel Yönetim</button><button type="button" className="new-category-primary" onClick={openNew}><Plus size={19} /> Yeni</button></div>
    </div>
    <nav className="new-category-path" aria-label="Klasör yolu"><button type="button" onClick={() => setCurrentFolderId(null)}><Home size={16} /> Ana klasör</button>{path.map(folder => <span key={folder.id}><ArrowRight size={14} /><button type="button" onClick={() => setCurrentFolderId(folder.id)}>{folder.name}</button></span>)}</nav>
    {(error || notice) && !dialog && <div className={`new-category-message ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || <><Check size={17} />{notice}</>}{error && <button type="button" onClick={() => void load()}><RefreshCw size={16} /> Yeniden dene</button>}</div>}

    <section className="new-category-section">
      <div className="new-category-section-head"><h2>Klasörler <span>{visibleFolders.length}</span></h2><button type="button" onClick={() => void load()} aria-label="İçeriği yenile"><RefreshCw size={18} /></button></div>
      {loading ? <div className="new-category-empty">Klasörler yükleniyor…</div> : visibleFolders.length ? <div className="new-category-folder-grid">{visibleFolders.map(folder => {
        const folderCount = folders.filter(item => item.parentId === folder.id).length;
        const categoryCount = categories.filter(item => item.folderId === folder.id).length;
        return <button type="button" className="new-category-folder-card" key={folder.id} onClick={() => { setCurrentFolderId(folder.id); setMovingCategoryId(null); setNotice(""); }}>
          <span className="new-category-folder-icon"><Folder size={24} /></span><span><strong>{folder.name}</strong><small>{folderCount} klasör · {categoryCount} kategori</small></span><ArrowRight size={18} />
        </button>;
      })}</div> : <div className="new-category-empty"><Folder size={25} /><span>Bu konumda klasör yok.</span></div>}
    </section>

    <section className="new-category-section">
      <div className="new-category-section-head"><h2>{folderApiKeys.length ? "Kategoriler ve API erişimleri" : "Kategoriler"} <span>{visibleCategories.length + folderApiKeys.length}</span></h2>{currentFolderId === null && <button type="button" className="new-category-inline-add" onClick={() => openDialog("category")}><Plus size={17} /> Kategori ekle</button>}</div>
      {loading ? <div className="new-category-empty">Kategoriler yükleniyor…</div> : visibleCategories.length ? <div className="new-category-table-wrap"><table className="new-category-table"><thead><tr><th>Kategori</th><th>API adresi</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{visibleCategories.map(category => <tr key={category.id}>
        <td><span className="new-category-category-name"><Table2 size={18} /><strong>{category.name}</strong></span></td>
        <td><code>/v1/{category.slug}</code></td>
        <td><span className={`new-category-status ${category.active ? "online" : ""}`}>{category.active ? "Etkin" : "Kapalı"}</span></td>
        <td><div className="new-category-row-actions"><button type="button" onClick={() => manage(category)}>Yönet <ArrowRight size={16} /></button><button type="button" className="new-category-move" title="Başka klasöre taşı" aria-label={`${category.name} kategorisini taşı`} onClick={() => setMovingCategoryId(current => current === category.id ? null : category.id)}><FolderInput size={17} /></button></div>{movingCategoryId === category.id && <select className="new-category-move-select" aria-label={`${category.name} için hedef klasör`} defaultValue={category.folderId ?? ""} disabled={saving} onChange={event => void moveCategory(category, event.target.value ? Number(event.target.value) : null)}><option value="">Ana klasör</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select>}</td>
      </tr>)}</tbody></table></div> : !folderApiKeys.length ? <div className="new-category-empty"><Database size={25} /><span>Bu konumda kategori yok.</span>{currentFolderId !== null && <button type="button" onClick={() => openDialog("category")}>Kategori oluştur</button>}</div> : null}
      {folderApiKeys.length > 0 && <div className="folder-api-access-grid">{folderApiKeys.map(key => {
        const endpoint = `${window.location.origin}/v1/folders/${currentFolderId}`;
        return <article className="folder-api-access-card" key={key.id}>
          <div className="folder-api-access-top"><span className="folder-api-access-icon"><KeyRound size={20} /></span><span className={`folder-api-access-status ${key.active ? "active" : ""}`}><i />{key.active ? "Etkin" : "Kapalı"}</span></div>
          <div className="folder-api-access-title"><strong>{key.projectName}</strong><span>{currentFolder?.name} klasörüne bağlı API anahtarı</span></div>
          <div className="folder-api-access-item"><small>KLASÖR API ADRESİ</small><div><code>{endpoint}</code><button type="button" onClick={() => void copyAccess(endpoint)} aria-label="API adresini kopyala" title="API adresini kopyala">{copied === endpoint ? <CheckCircle2 size={17} /> : <Copy size={17} />}</button></div></div>
          <div className="folder-api-access-item key"><small>API ANAHTARI</small><div><code>{key.apiKey}</code><button type="button" onClick={() => void copyAccess(key.apiKey)} aria-label="API anahtarını kopyala" title="API anahtarını kopyala">{copied === key.apiKey ? <CheckCircle2 size={17} /> : <Copy size={17} />}</button></div></div>
          <button className="folder-api-access-manage" type="button" onClick={openKeys}>Anahtarı yönet <ArrowRight size={16} /></button>
        </article>;
      })}</div>}
    </section>

    {dialog && <div className="new-category-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setDialog(null); }}><div className="new-category-dialog" role="dialog" aria-modal="true" aria-labelledby="new-category-dialog-title">
      <div className="new-category-dialog-head"><div><span>{locationLabel}</span><h2 id="new-category-dialog-title">{dialog === "choose" ? "Ne eklemek istersin?" : dialog === "folder" ? "Yeni klasör" : "Yeni kategori"}</h2></div><button type="button" onClick={() => setDialog(null)} disabled={saving} aria-label="Kapat"><X size={20} /></button></div>
      {dialog === "choose" ? <div className="new-category-choices"><button type="button" onClick={() => openDialog("folder")}><span className="folder"><FolderPlus size={23} /></span><strong>Alt klasör</strong><small>Bu klasörün içinde yeni bir alan aç.</small><ArrowRight size={18} /></button><button type="button" onClick={() => openDialog("category")}><span className="category"><Table2 size={23} /></span><strong>API kategorisi</strong><small>Bu klasöre veri kaynağı ekle.</small><ArrowRight size={18} /></button></div> : dialog === "folder" ? <form onSubmit={event => void createFolder(event)}><label>Klasör adı<input autoFocus value={folderName} onChange={event => setFolderName(event.target.value)} maxLength={120} placeholder="Örn. Müşteriler" required /></label>{error && <p className="new-category-dialog-error" role="alert">{error}</p>}<div className="new-category-dialog-actions"><button type="button" onClick={() => setDialog(null)}>Vazgeç</button><button className="new-category-primary" type="submit" disabled={saving}>{saving ? "Oluşturuluyor…" : "Klasör oluştur"}</button></div></form> : <form onSubmit={event => void createCategory(event)}><label>Kategori adı<input autoFocus value={categoryName} onChange={event => { setCategoryName(event.target.value); setSlug(slugFromName(event.target.value)); }} maxLength={120} placeholder="Örn. Ülkeler" required /></label><label>API adresi<span className="new-category-slug-field"><span>/v1/</span><input value={slug} onChange={event => setSlug(slugFromName(event.target.value))} maxLength={100} placeholder="ulkeler" required /></span></label>{error && <p className="new-category-dialog-error" role="alert">{error}</p>}<div className="new-category-dialog-actions"><button type="button" onClick={() => setDialog(null)}>Vazgeç</button><button className="new-category-primary" type="submit" disabled={saving}>{saving ? "Oluşturuluyor…" : "Kategori oluştur"}</button></div></form>}
    </div></div>}
  </div>;
}
