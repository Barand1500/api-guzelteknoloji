import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Database, HardDrive, KeyRound, Link2, RefreshCw, Rows3, Search, Table2 } from "lucide-react";
import { request } from "../../shared/api";
import type { DatabaseSchema } from "../../shared/types";
import { Loading } from "../../shared/ui";
import "./schema.css";

type Table = DatabaseSchema["tables"][number];
type Scope = "all" | "categories" | "other";

function formatBytes(value: number | null) {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  const power = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value / 1024 ** power)} ${["B", "KB", "MB", "GB"][power]}`;
}

export default function Schema({ token }: { token: string }) {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await request<DatabaseSchema>("/admin/database-schema", token);
      setSchema(next);
      setSelectedName(current => next.tables.some(table => table.name === current) ? current : next.tables[0]?.name || "");
      setRefreshedAt(new Date());
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!detailRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(detailRef.current, { autoAlpha: .5, y: 9 }, { autoAlpha: 1, y: 0, duration: .28, ease: "power2.out" });
  }, [selectedName]);

  const tables = useMemo(() => (schema?.tables || []).filter(table =>
    (scope === "all" || (scope === "categories" ? Boolean(table.category) : !table.category)) &&
    `${table.name} ${table.category?.name || ""}`.toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR"))
  ), [schema, scope, query]);
  const selected = schema?.tables.find(table => table.name === selectedName) || null;
  const relations = selected?.columns.filter(column => column.reference) || [];

  function selectTable(table: Table) {
    setSelectedName(table.name);
    setQuery("");
    setScope("all");
  }
  function openReference(tableName: string) {
    const target = schema?.tables.find(table => table.name === tableName);
    if (target) selectTable(target);
  }

  if (loading && !schema) return <Loading />;
  return <div className="schema-page">
    <header className="schema-heading"><div><span className="schema-eyebrow"><Database size={15} /> VERİTABANI GÖRÜNÜMÜ</span><h1>Şema</h1><p>Gerçek MySQL tablolarını, sütunları ve ilişkileri inceleyin.</p></div><button className="schema-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={17} className={loading ? "spinning" : ""} /> {loading ? "Yenileniyor" : "Yenile"}</button></header>
    {error && <div className="schema-error" role="alert">{error} <button onClick={() => void load()}>Tekrar dene</button></div>}
    {schema && <>
      <div className="schema-database-bar"><span className="schema-database-icon"><Database size={22} /></span><div className="schema-database-name"><small>BAĞLI VERİTABANI</small><strong>{schema.databaseName}</strong></div><div className="schema-database-count"><Table2 size={18} /><strong>{schema.tables.length}</strong><span>tablo ve görünüm</span></div><span className="schema-readonly">Salt okunur</span></div>
      <div className="schema-workspace">
        <aside className="schema-explorer" aria-label="Veritabanı tabloları"><div className="schema-explorer-head"><h2>Tablolar</h2><span>{schema.tables.length}</span></div><label className="schema-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tablo ara..." aria-label="Tablo ara" /></label><div className="schema-scopes" role="group" aria-label="Tablo filtresi"><button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>Tümü</button><button className={scope === "categories" ? "active" : ""} onClick={() => setScope("categories")}>Kategoriler</button><button className={scope === "other" ? "active" : ""} onClick={() => setScope("other")}>Diğer</button></div><div className="schema-table-list">{tables.map(table => <button key={table.name} className={selectedName === table.name ? "selected" : ""} onClick={() => selectTable(table)} title={table.name}><span className="schema-table-icon"><Table2 size={17} /></span><span className="schema-table-label"><strong>{table.name}</strong><small>{table.category?.name || (table.kind === "VIEW" ? "Görünüm" : "MySQL tablosu")}</small></span><span className="schema-table-column-count">{table.columns.length}</span></button>)}{!tables.length && <p className="schema-list-empty">Eşleşen tablo yok.</p>}</div></aside>
        {selected ? <main className="schema-detail" ref={detailRef}><div className="schema-detail-head"><div className="schema-detail-title"><span className="schema-detail-symbol"><Table2 size={23} /></span><div><span className="schema-detail-overline">{selected.category ? "KATEGORİ TABLOSU" : selected.kind === "VIEW" ? "VERİTABANI GÖRÜNÜMÜ" : "FİZİKSEL TABLO"}</span><h2>{selected.name}</h2>{selected.category && <p>{selected.category.name} kategorisine bağlı</p>}</div></div><span className="schema-engine">{selected.engine || selected.kind}</span></div>
          <div className="schema-facts"><div><Rows3 size={19} /><span><small>Tahmini kayıt</small><strong>{selected.estimatedRows === null ? "—" : selected.estimatedRows.toLocaleString("tr-TR")}</strong></span></div><div><Table2 size={19} /><span><small>Sütun</small><strong>{selected.columns.length}</strong></span></div><div><Link2 size={19} /><span><small>İlişki</small><strong>{relations.length}</strong></span></div><div><HardDrive size={19} /><span><small>Veri + indeks</small><strong>{formatBytes(selected.dataBytes === null && selected.indexBytes === null ? null : (selected.dataBytes || 0) + (selected.indexBytes || 0))}</strong></span></div></div>
          <section className="schema-columns"><div className="schema-section-head"><h3>Sütun yapısı</h3><span>MySQL üzerinden okundu</span></div><div className="schema-column-scroll"><table><thead><tr><th>#</th><th>Sütun adı</th><th>SQL tipi</th><th>Anahtar</th><th>NULL</th><th>Varsayılan</th><th>İlişkili tablo</th></tr></thead><tbody>{selected.columns.map(column => <tr key={column.name}><td className="schema-position">{column.position}</td><td><code className="schema-column-name">{column.name}</code>{column.extra && <small className="schema-extra">{column.extra}</small>}</td><td><code className="schema-sql-type">{column.sqlType}</code></td><td>{column.reference ? <span className="schema-key foreign"><Link2 size={13} /> FK</span> : column.key === "PRI" ? <span className="schema-key primary"><KeyRound size={13} /> PK</span> : column.key ? <span className="schema-key index">{column.key}</span> : <span className="schema-dash">—</span>}</td><td><span className={column.nullable ? "schema-null yes" : "schema-null"}>{column.nullable ? "Evet" : "Hayır"}</span></td><td><code className="schema-default">{column.defaultValue ?? "—"}</code></td><td>{column.reference ? <button className="schema-reference-link" onClick={() => openReference(column.reference!.table)} title={`${column.reference.table}.${column.reference.column}`}><span>{column.reference.table}</span><ArrowUpRight size={14} /></button> : <span className="schema-dash">—</span>}</td></tr>)}</tbody></table>{!selected.columns.length && <div className="schema-list-empty">Bu tabloda sütun bulunamadı.</div>}</div></section>
          <div className="schema-detail-foot">{refreshedAt && <span>Son yenileme: {refreshedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>}<span>Satır sayısı MySQL tahminidir.</span></div>
        </main> : <div className="schema-no-selection">Veritabanında henüz tablo bulunmuyor.</div>}
        {selected && <aside className="schema-relations"><div className="schema-section-head"><h3>İlişkiler</h3><span>{relations.length}</span></div><p className="schema-relations-intro">Bu tablodan diğer tablolara bağlı sütunlar.</p>{relations.map(column => <button className="schema-relation" key={column.name} onClick={() => openReference(column.reference!.table)}><span className="schema-relation-source"><Link2 size={15} />{column.name}</span><span className="schema-relation-line" /><strong>{column.reference?.table}<small>{column.reference?.column}</small></strong><ArrowUpRight size={15} /></button>)}{!relations.length && <div className="schema-relations-empty"><Link2 size={22} /><span>Bu tablodan çıkan yabancı anahtar bulunmuyor.</span></div>}</aside>}
      </div>
    </>}
  </div>;
}
