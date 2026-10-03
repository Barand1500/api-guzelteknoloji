import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, Database, KeyRound, RefreshCw, ShieldCheck, Trash2, Workflow } from "lucide-react";
import { request } from "../../shared/api";
import type { ApiKey, SchemaOverviewCategory } from "../../shared/types";
import { Loading } from "../../shared/ui";
import "./schema-keys.css";

type KeyDetail = {
  id: string;
  projectName: string;
  active: boolean;
  createdAt: string;
  keySuffix: string;
  usageCount: number;
  lastUsedAt: string | null;
  categories: { id: number; name: string; slug: string; active: boolean }[];
  recent: { createdAt: string; originHost: string | null; categoryName: string | null }[];
};

export default function SchemaKeys({ token }: { token: string }) {
  const [schema, setSchema] = useState<SchemaOverviewCategory[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KeyDetail | null>(null);
  const [issuedKey, setIssuedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [nextSchema, nextKeys] = await Promise.all([
        request<SchemaOverviewCategory[]>("/admin/schema-overview", token),
        request<ApiKey[]>("/admin/api-keys", token),
      ]);
      setSchema(nextSchema);
      setKeys(nextKeys);
      setSelectedId(current => current && nextKeys.some(item => item.id === current) ? current : nextKeys[0]?.id || null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [token]);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    request<KeyDetail>(`/admin/api-keys/${selectedId}`, token)
      .then(value => { if (!cancelled) setDetail(value); })
      .catch(reason => { if (!cancelled) setError((reason as Error).message); });
    return () => { cancelled = true; };
  }, [selectedId, token]);
  useEffect(() => {
    if (rootRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(rootRef.current.querySelectorAll("[data-schema-card]"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.34, stagger: 0.05, ease: "power2.out" });
    }
  }, []);

  async function setActive(active: boolean) {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/api-keys/${detail.id}`, token, { method: "PATCH", body: JSON.stringify({ active }) });
      setDetail(current => current ? { ...current, active } : current);
      setKeys(current => current.map(key => key.id === detail.id ? { ...key, active } : key));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function rotate() {
    if (!detail || !window.confirm(`“${detail.projectName}” anahtarı yenilensin mi? Eski anahtar hemen çalışmayı bırakır.`)) return;
    setBusy(true);
    setError("");
    setIssuedKey("");
    try {
      const result = await request<{ apiKey: string }>(`/admin/api-keys/${detail.id}/rotate`, token, { method: "POST" });
      setIssuedKey(result.apiKey);
      await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function removeKey() {
    if (!detail || !window.confirm(`“${detail.projectName}” API anahtarı ve erişimi silinsin mi?`)) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/api-keys/${detail.id}`, token, { method: "DELETE" });
      setKeys(current => current.filter(item => item.id !== detail.id));
      setSelectedId(null);
      setDetail(null);
      setIssuedKey("");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  if (loading && !schema.length && !keys.length) return <Loading />;
  return <div className="schema-keys-page" ref={rootRef}>
    <header className="schema-keys-heading"><span className="schema-keys-kicker"><Workflow size={14} /> VERİ YAPISI VE ERİŞİM</span><h1>Şema ve Anahtarlar</h1><p>Kategori ilişkilerini görün ve API anahtarlarının erişim durumunu yönetin.</p></header>
    {error && <div className="schema-keys-error" role="alert">{error}</div>}
    <section className="schema-panel" data-schema-card>
      <div className="schema-panel-head"><div><Database size={18} /><div><h2>Kategori ilişkileri</h2><p>Bağlamsal anahtar sütunları hedef tabloya bağlanır.</p></div></div><span>{schema.length} kategori</span></div>
      {!schema.length ? <div className="schema-empty">Henüz kategori şeması bulunmuyor.</div> : <div className="schema-map">
        {schema.map(category => <article className="schema-node" key={category.id}>
          <header><span><Database size={16} /></span><div><strong>{category.name}</strong><small>{category.tableName}</small></div><i className={category.active ? "active" : ""}>{category.active ? "API açık" : "API kapalı"}</i></header>
          <div className="schema-node-columns">{category.columns.length ? category.columns.map(column => <div key={column.id} className={column.referenceCategoryId ? "relation" : ""}><span>{column.name}</span><small>{column.fieldType === "relation" ? "İlişki" : column.fieldType}</small>{column.referenceCategoryId && <span className="schema-relation-target"><ArrowRight size={13} />{column.referenceCategoryName || "Hedef kategori"}</span>}</div>) : <p>Sütun tanımlanmamış</p>}</div>
          <footer><code>GET /v1/{category.slug}</code><span>{category.columns.length} sütun</span></footer>
        </article>)}
      </div>}
    </section>
    <section className="schema-key-panel" data-schema-card>
      <div className="schema-panel-head"><div><KeyRound size={18} /><div><h2>API anahtarı detayı ve yaşam döngüsü</h2><p>Anahtarı duraklatın, yenileyin veya kullanımını inceleyin.</p></div></div></div>
      <div className="schema-key-layout">
        <div className="schema-key-list">{keys.map(key => <button key={key.id} className={selectedId === key.id ? "selected" : ""} onClick={() => { setSelectedId(key.id); setIssuedKey(""); }}><span><KeyRound size={17} /></span><strong>{key.projectName}</strong><code>••••{key.apiKey.slice(-4)}</code><i className={key.active ? "active" : ""}>{key.active ? "Açık" : "Kapalı"}</i></button>)}{!keys.length && <div className="schema-empty">Henüz API anahtarı yok.</div>}</div>
        {detail ? <div className="schema-key-detail">
          <div className="schema-detail-title"><div><h3>{detail.projectName}</h3><span className={detail.active ? "active" : ""}>{detail.active ? "Anahtar açık" : "Anahtar kapalı"}</span></div><code>••••{detail.keySuffix}</code></div>
          <div className="schema-detail-metrics"><div><small>Toplam istek</small><strong>{detail.usageCount.toLocaleString("tr-TR")}</strong></div><div><small>Oluşturulma</small><strong>{new Date(detail.createdAt).toLocaleDateString("tr-TR")}</strong></div><div><small>Son kullanım</small><strong>{detail.lastUsedAt ? new Date(detail.lastUsedAt).toLocaleString("tr-TR") : "Henüz yok"}</strong></div></div>
          <div className="schema-detail-categories"><strong>Erişebildiği kategoriler</strong><div>{detail.categories.map(category => <span key={category.id}>{category.name}{!category.active && " · Kapalı"}</span>)}{!detail.categories.length && <small>Erişim izni bulunmuyor.</small>}</div></div>
          {issuedKey && <div className="schema-issued-key" role="status"><Check size={16} /><div><strong>Yeni anahtar oluşturuldu</strong><code>{issuedKey}</code><small>Bu değeri şimdi güvenli yere kopyalayın. Eski anahtar artık geçersiz.</small></div><button type="button" onClick={() => { void navigator.clipboard.writeText(issuedKey); }} aria-label="Yeni anahtarı kopyala">Kopyala</button></div>}
          <div className="schema-detail-actions"><button disabled={busy} onClick={() => void setActive(!detail.active)}><ShieldCheck size={15} />{detail.active ? "Anahtarı duraklat" : "Anahtarı etkinleştir"}</button><button disabled={busy} onClick={() => void rotate()}><RefreshCw size={15} /> Anahtarı yenile</button><button className="danger" disabled={busy} onClick={() => void removeKey()}><Trash2 size={15} /> Sil</button></div>
          <div className="schema-recent"><strong><Clock3 size={15} /> Son istekler</strong>{detail.recent.length ? detail.recent.slice(0, 5).map((item, index) => <div key={`${item.createdAt}-${index}`}><span>{item.categoryName || "Kategori silinmiş"}</span><small>{item.originHost || "Kaynak bilinmiyor"}</small><time>{new Date(item.createdAt).toLocaleString("tr-TR")}</time></div>) : <p>Henüz kullanım kaydı yok.</p>}</div>
        </div> : <div className="schema-empty schema-detail-placeholder">Detayları görmek için bir API anahtarı seçin.</div>}
      </div>
    </section>
  </div>;
}
