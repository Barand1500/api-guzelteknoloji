import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Database, Folder, FolderOpen, RefreshCw } from "lucide-react";
import { request } from "./api";
import type { Category, CategoryFolder } from "./types";

type Props = {
  token: string;
  active: boolean;
  refreshKey: string;
  selectedCategoryId: number | null;
  onOpenFolder: (id: number | null) => void;
  onOpenCategory: (id: number) => void;
};

export default function FolderSidebar({ token, active, refreshKey, selectedCategoryId, onOpenFolder, onOpenCategory }: Props) {
  const [folders, setFolders] = useState<CategoryFolder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextFolders, nextCategories] = await Promise.all([
        request<CategoryFolder[]>("/admin/category-folders", token),
        request<Category[]>("/admin/categories", token),
      ]);
      setFolders(nextFolders);
      setCategories(nextCategories);
      setExpanded(current => {
        if (current.size) return current;
        return new Set(nextFolders.map(folder => folder.id));
      });
    } catch (reason) {
      setError((reason as Error).message || "Klasörler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => { if (active) void load(); }, [active, refreshKey, load]);
  useEffect(() => {
    if (!active) return;
    const refresh = () => { void load(); };
    window.addEventListener("gtk-folder-tree-updated", refresh);
    return () => window.removeEventListener("gtk-folder-tree-updated", refresh);
  }, [active, load]);

  const foldersByParent = useMemo(() => {
    const map = new Map<number | null, CategoryFolder[]>();
    for (const folder of folders) {
      const parent = folder.parentId !== null && folders.some(item => item.id === folder.parentId) ? folder.parentId : null;
      map.set(parent, [...(map.get(parent) || []), folder]);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return map;
  }, [folders]);
  const categoriesByFolder = useMemo(() => {
    const map = new Map<number | null, Category[]>();
    for (const category of categories) {
      const folderId = category.folderId != null && folders.some(folder => folder.id === category.folderId) ? category.folderId : null;
      map.set(folderId, [...(map.get(folderId) || []), category]);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return map;
  }, [categories, folders]);

  function toggleFolder(id: number) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function renderChildren(parentId: number | null, ancestors: Set<number>, depth: number): ReactNode {
    if (depth > 20) return null;
    return <>
      {(foldersByParent.get(parentId) || []).filter(folder => !ancestors.has(folder.id)).map(folder => {
        const open = expanded.has(folder.id);
        const nextAncestors = new Set(ancestors).add(folder.id);
        return <div key={`folder-${folder.id}`} className="folder-tree-branch">
          <div className="folder-tree-line" style={{ paddingLeft: 11 + depth * 17 }}>
            <button className="folder-tree-expand" type="button" onClick={() => toggleFolder(folder.id)} aria-label={`${folder.name} ${open ? "daralt" : "genişlet"}`} aria-expanded={open}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
            <button className="folder-tree-item folder-tree-folder" type="button" onClick={() => { if (!open) toggleFolder(folder.id); onOpenFolder(folder.id); }} title={folder.name}>{open ? <FolderOpen size={18} /> : <Folder size={18} />}<span>{folder.name}</span></button>
          </div>
          {open && <div className="folder-tree-children">{renderChildren(folder.id, nextAncestors, depth + 1)}</div>}
        </div>;
      })}
      {(categoriesByFolder.get(parentId) || []).map(category => <button key={`category-${category.id}`} className={`folder-tree-line folder-tree-category ${selectedCategoryId === category.id ? "selected" : ""}`} style={{ paddingLeft: 42 + depth * 17 }} type="button" onClick={() => onOpenCategory(category.id)} title={category.name}><Database size={17} /><span>{category.name}</span>{!category.active && <i aria-label="API kapalı" />}</button>)}
    </>;
  }

  return <nav className="folder-tree" aria-label="Klasör ve kategori yapısı">
    <div className="folder-tree-heading"><div><span>ÇALIŞMA ALANI</span><strong>Klasör yapısı</strong></div><button type="button" onClick={() => void load()} disabled={loading} aria-label="Klasör yapısını yenile" title="Yenile"><RefreshCw size={17} /></button></div>
    {error && <div className="folder-tree-message" role="alert">{error}</div>}
    {loading && !folders.length && !categories.length ? <div className="folder-tree-message">Yükleniyor…</div> : <div className="folder-tree-list">
      <button className="folder-tree-line folder-tree-root" type="button" onClick={() => onOpenFolder(null)}><FolderOpen size={18} /><span>Ana klasör</span></button>
      {renderChildren(null, new Set(), 0)}
      {!loading && !folders.length && !categories.length && <p className="folder-tree-message">Henüz klasör veya kategori yok.</p>}
    </div>}
  </nav>;
}
