import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Database, Folder, FolderInput, FolderPlus, Layers3, Plus, RefreshCw, Table2 } from "lucide-react";
import { request } from "../../shared/api";
import type { Category, CategoryFolder } from "../../shared/types";
import "./new-category.css";

type Props = { token: string; done: () => void; manage: (category: Category) => void };
type TreeStyle = CSSProperties & { "--tree-depth": number };

export default function NewCategory({ token, done, manage }: Props) {
  const [folders, setFolders] = useState<CategoryFolder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [movingCategoryId, setMovingCategoryId] = useState<number | null>(null);
  const [folderName, setFolderName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [folderList, categoryList] = await Promise.all([
        request<CategoryFolder[]>("/admin/category-folders", token),
        request<Category[]>("/admin/categories", token),
      ]);
      setFolders(folderList);
      setCategories(categoryList);
    } catch (reason) {
      setError((reason as Error).message || "Klasörler ve kategoriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderName.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const folder = await request<CategoryFolder>("/admin/category-folders", token, {
        method: "POST",
        body: JSON.stringify({ name: folderName.trim(), parentId: selectedFolderId }),
      });
      setFolderName("");
      setSelectedFolderId(folder.id);
      setSuccess(`“${folder.name}” klasörü oluşturuldu.`);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim() || !slug.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await request<Category>("/admin/categories", token, {
        method: "POST",
        body: JSON.stringify({ name: categoryName.trim(), slug: slug.trim(), folderId: selectedFolderId }),
      });
      setSuccess(`“${categoryName.trim()}” kategorisi oluşturuldu.`);
      setCategoryName("");
      setSlug("");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function moveCategory(category: Category, folderId: number | null) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await request(`/admin/categories/${category.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ folderId }),
      });
      setMovingCategoryId(null);
      setSuccess(`“${category.name}” kategorisi taşındı.`);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

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

  function folderTree(parentId: number | null, depth = 0): ReactNode {
    const nestedFolders = folders.filter(folder => folder.parentId === parentId);
    const containedCategories = categories.filter(category => (category.folderId ?? null) === parentId);
    return <>
      {parentId === null && <button type="button" className={`new-category-tree-root ${selectedFolderId === null ? "selected" : ""}`} onClick={() => setSelectedFolderId(null)}>
        <Database size={18} /><span><strong>Ana klasör</strong><small>Kök dizin</small></span><b>{containedCategories.length}</b>
      </button>}
      {nestedFolders.map(folder => {
        const count = categories.filter(category => category.folderId === folder.id).length;
        return <div key={folder.id} className="new-category-tree-node" style={{ "--tree-depth": depth } as TreeStyle}>
          <button type="button" className={`new-category-tree-folder ${selectedFolderId === folder.id ? "selected" : ""}`} onClick={() => setSelectedFolderId(folder.id)}>
            <Folder size={18} /><span><strong>{folder.name}</strong><small>{folderPath(folder.id)}</small></span><b>{count}</b>
          </button>
          {folderTree(folder.id, depth + 1)}
        </div>;
      })}
      {containedCategories.map(category => <div key={`category-${category.id}`} className="new-category-tree-category-wrap" style={{ "--tree-depth": depth } as TreeStyle}>
        <button type="button" className="new-category-tree-category" onClick={() => manage(category)}>
          <Table2 size={17} /><span><strong>{category.name}</strong><small>/v1/{category.slug}</small></span><span className={`new-category-status ${category.active ? "online" : ""}`}>{category.active ? "Etkin" : "Kapalı"}</span>
        </button>
        <button type="button" className="new-category-tree-move" title="Kategoriyi başka klasöre taşı" aria-label={`${category.name} kategorisini başka klasöre taşı`} onClick={() => setMovingCategoryId(current => current === category.id ? null : category.id)}><FolderInput size={14} /></button>
        {movingCategoryId === category.id && <select className="new-category-move-select" aria-label={`${category.name} için hedef klasör`} value={category.folderId ?? ""} disabled={saving} onChange={event => void moveCategory(category, event.target.value ? Number(event.target.value) : null)}>
          <option value="">Ana klasör</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}
        </select>}
      </div>)}
    </>;
  }

  return <div className="new-category-page">
    <header className="new-category-heading">
      <div><span className="new-category-kicker"><Layers3 size={16} /> API YAPISI</span><h1>Yeni kategori</h1><p>Klasörlerini düzenle, yeni API kategorileri oluştur.</p></div>
      <button type="button" className="new-category-back" onClick={done}><ArrowLeft size={17} /> Genel Yönetim</button>
    </header>
    {(error || success) && <div className={`new-category-notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error || success}{error && <button type="button" onClick={() => void load()}><RefreshCw size={14} /> Yeniden dene</button>}</div>}
    <div className="new-category-layout">
      <section className="new-category-panel new-category-tree-panel">
        <div className="new-category-panel-heading"><span className="new-category-icon"><Layers3 size={21} /></span><div><h2>Klasörler</h2><p>Kategori veya klasör seç</p></div><button type="button" onClick={() => void load()} aria-label="Klasör yapısını yenile"><RefreshCw size={18} /></button></div>
        <div className="new-category-tree">
          {loading ? <div className="new-category-tree-empty">Klasör yapısı yükleniyor…</div> : folderTree(null)}
          {!loading && !folders.length && !categories.length && <div className="new-category-tree-empty"><FolderPlus size={26} /><strong>Henüz içerik yok</strong><span>İlk klasörünü veya kategorini oluştur.</span></div>}
        </div>
      </section>

      <div className="new-category-create-column">
        <section className="new-category-panel">
          <div className="new-category-panel-heading"><span className="new-category-icon folder"><FolderPlus size={21} /></span><div><h2>Klasör oluştur</h2><p>Seçili konuma ekle</p></div></div>
          <div className="new-category-current-path"><Folder size={15} />{selectedFolderId === null ? "Ana klasör" : folderPath(selectedFolderId)}</div>
          <form onSubmit={event => void createFolder(event)}>
            <label>Klasör adı<input value={folderName} onChange={event => setFolderName(event.target.value)} maxLength={120} placeholder="Örn. Ücretsiz API'ler" required /></label>
            <button type="submit" disabled={saving || loading}><Plus size={18} />{saving ? "Oluşturuluyor…" : "Klasör ekle"}</button>
          </form>
        </section>

        <section className="new-category-panel">
          <div className="new-category-panel-heading"><span className="new-category-icon table"><Table2 size={21} /></span><div><h2>API kategorisi oluştur</h2><p>Yeni bir veri kaynağı ekle</p></div></div>
          <div className="new-category-current-path"><Folder size={15} />{selectedFolderId === null ? "Ana klasör" : folderPath(selectedFolderId)}</div>
          <form onSubmit={event => void createCategory(event)}>
            <label>Kategori adı<input value={categoryName} onChange={event => {
              const nextName = event.target.value;
              setCategoryName(nextName);
              setSlug(nextName.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
            }} maxLength={120} placeholder="Örn. Vergi Daireleri" required /></label>
            <label>API endpoint adresi<input value={slug} onChange={event => setSlug(event.target.value)} maxLength={100} placeholder="vergi-daireleri" required /></label>
            <button type="submit" disabled={saving || loading}><Plus size={18} />{saving ? "Oluşturuluyor…" : "Kategori oluştur"}</button>
          </form>
        </section>
      </div>
    </div>
  </div>;
}
