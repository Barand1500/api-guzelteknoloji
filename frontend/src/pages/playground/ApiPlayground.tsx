import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock3, Code2, Copy, FlaskConical, LoaderCircle, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { request } from "../../shared/api";
import type { Category, CategoryFolder } from "../../shared/types";
import { Loading } from "../../shared/ui";
import "./playground.css";

type TestResult = { status: number; durationMs: number; endpoint: string; response: unknown };

export default function ApiPlayground({ token }: { token: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [folders, setFolders] = useState<CategoryFolder[]>([]);
  const [targetType, setTargetType] = useState<"category" | "folder">("category");
  const [folderId, setFolderId] = useState("");
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const [items, folderItems] = await Promise.all([
        request<Category[]>("/admin/categories", token),
        request<CategoryFolder[]>("/admin/category-folders", token),
      ]);
      setCategories(items);
      setFolders(folderItems);
      setCategoryId(current => items.some(item => String(item.id) === current && item.active)
        ? current
        : items.find(item => item.active)?.id.toString() || "");
      setFolderId(current => folderItems.some(item => String(item.id) === current)
        ? current : folderItems[0]?.id.toString() || "");
      if (!items.some(item => item.active) && folderItems.length) setTargetType("folder");
    } catch (reason) {
      setCategoriesError((reason as Error).message || "Kategoriler alınamadı.");
    } finally {
      setCategoriesLoading(false);
    }
  }, [token]);
  useEffect(() => { void loadCategories(); }, [loadCategories]);
  useEffect(() => {
    if (rootRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(rootRef.current.querySelectorAll("[data-playground-card]"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.06, ease: "power2.out" });
    }
  }, []);

  async function runTest() {
    const targetId = targetType === "folder" ? folderId : categoryId;
    if (!targetId || !apiKey.trim()) {
      setError("Kategori veya klasör seçin ve API anahtarını girin.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const path = targetType === "folder" ? `/admin/playground/folders/${targetId}` : `/admin/playground/${targetId}`;
      const response = await request<TestResult>(path, token, {
        method: "POST",
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      setResult(response);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyResponse() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.response, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  if (categoriesLoading) return <Loading />;
  const selected = categories.find(item => String(item.id) === categoryId);
  const selectedFolder = folders.find(item => String(item.id) === folderId);
  const folderPath = (folder: CategoryFolder) => {
    const parts: string[] = [];
    const visited = new Set<number>();
    let current: CategoryFolder | undefined = folder;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      parts.unshift(current.name);
      const parentId: number | null = current.parentId;
      current = parentId === null ? undefined : folders.find(item => item.id === parentId);
    }
    return parts.join(" / ");
  };
  const endpoint = targetType === "folder"
    ? selectedFolder ? `/v1/folders/${selectedFolder.id}` : "/v1/folders/{klasör-id}"
    : selected ? `/v1/${selected.slug}` : "/v1/{kategori}";

  return <div className="playground-page" ref={rootRef}>
    <header className="playground-heading"><span className="playground-kicker"><FlaskConical size={14} /> GELİŞTİRİCİ ARAÇLARI</span><h1>API Deneme Alanı</h1></header>
    {categoriesError && <div className="playground-error" role="alert"><AlertCircle size={16} />{categoriesError}<button type="button" onClick={() => void loadCategories()}><RefreshCw size={14} /> Yeniden dene</button></div>}
    {!categoriesError && !categories.length && !folders.length && <div className="playground-empty" role="status"><AlertCircle size={18} /><div><strong>Henüz test edilecek kaynak yok</strong><span>Önce Yeni Kategori bölümünden bir kategori veya klasör oluşturun.</span></div></div>}
    {error && <div className="playground-error" role="alert">{error}</div>}
    <div className="playground-layout">
      <section className="playground-card playground-request" data-playground-card>
        <div className="playground-card-title"><span><Code2 size={18} /></span><div><h2>İstek ayarları</h2><p>İstek sunucuda doğrulanır; API anahtarı tarayıcı adresine eklenmez.</p></div></div>
        <div className="playground-target-switch" role="group" aria-label="API kapsamı"><button type="button" className={targetType === "category" ? "active" : ""} disabled={!categories.some(item => item.active)} onClick={() => { setTargetType("category"); setResult(null); }}>Tek kategori</button><button type="button" className={targetType === "folder" ? "active" : ""} disabled={!folders.length} onClick={() => { setTargetType("folder"); setResult(null); }}>Klasör paketi</button></div>
        {targetType === "folder" ? <label className="playground-field">Klasör<select value={folderId} onChange={event => { setFolderId(event.target.value); setResult(null); }} disabled={!folders.length}><option value="">Klasör seçin</option>{folders.map(item => <option key={item.id} value={item.id}>{folderPath(item)}</option>)}</select></label> : <label className="playground-field">Kategori<select value={categoryId} onChange={event => { setCategoryId(event.target.value); setResult(null); }} disabled={!categories.length}><option value="">Kategori seçin</option>{categories.map(item => <option key={item.id} value={item.id} disabled={!item.active}>{item.folderPath ? `${item.folderPath} / ` : ""}{item.name}{item.active ? "" : " (API kapalı)"}</option>)}</select></label>}
        <label className="playground-field">X-API-Key<input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="gtk_..." /></label>
        <div className="playground-endpoint"><span>GET</span><code>{endpoint}</code><button type="button" onClick={() => void navigator.clipboard.writeText(endpoint)} title="Endpoint adresini kopyala"><Copy size={15} /></button></div>
        <button className="playground-run" type="button" disabled={busy || (targetType === "folder" ? !selectedFolder : !selected?.active)} onClick={() => void runTest()}>{busy ? <LoaderCircle size={16} className="playground-spinner" /> : <Play size={16} />}{busy ? "İstek gönderiliyor..." : "API isteğini çalıştır"}</button>
        <div className="playground-security"><ShieldCheck size={16} /><span>Anahtar yalnızca test isteği sırasında kullanılır ve bu ekranda saklanmaz.</span></div>
      </section>
      <section className="playground-card playground-response" data-playground-card>
        <div className="playground-response-head"><div className="playground-card-title"><span><Code2 size={18} /></span><div><h2>Yanıt</h2><p>Yanıt gövdesi</p></div></div>{result && <div className="playground-response-meta"><span className="playground-ok"><Check size={14} /> HTTP {result.status}</span><span><Clock3 size={14} /> {result.durationMs} ms</span><button type="button" onClick={() => void copyResponse()} aria-label="JSON yanıtını kopyala">{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>}</div>
        <pre className="playground-json">{result ? JSON.stringify(result.response, null, 2) : busy ? "API yanıtı bekleniyor…" : "İstek sonucundaki JSON burada görüntülenecek."}</pre>
      </section>
    </div>
  </div>;
}
