import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Database, KeyRound, Link2, RefreshCw, Search, Table2 } from "lucide-react";
import { request } from "../../shared/api";
import type { DatabaseSchema, DatabaseTableRows } from "../../shared/types";
import { Loading } from "../../shared/ui";
import "./schema.css";

type Table = DatabaseSchema["tables"][number];
type View = "data" | "columns";

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function Schema({ token }: { token: string }) {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("data");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DatabaseTableRows | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [error, setError] = useState("");
  const [rowsError, setRowsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request<DatabaseSchema>("/admin/database-schema", token);
      setSchema(result);
      setSelectedName(current => result.tables.some(table => table.name === current) ? current : result.tables[0]?.name || "");
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selectedName) { setRows(null); return; }
    let cancelled = false;
    setRowsLoading(true);
    setRowsError("");
    request<DatabaseTableRows>(`/admin/database-schema/${encodeURIComponent(selectedName)}/rows?page=${page}`, token)
      .then(result => { if (!cancelled) setRows(result); })
      .catch(reason => { if (!cancelled) { setRows(null); setRowsError((reason as Error).message); } })
      .finally(() => { if (!cancelled) setRowsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedName, page, token, refreshKey]);

  const selected = schema?.tables.find(table => table.name === selectedName) || null;
  const tables = useMemo(() => (schema?.tables || []).filter(table =>
    `${table.name} ${table.category?.name || ""}`.toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR")),
  ), [schema, query]);
  const outgoing = selected?.columns.filter(column => column.reference) || [];
  const totalPages = Math.max(1, Math.ceil((rows?.total || 0) / (rows?.pageSize || 25)));

  function selectTable(table: Table) {
    setSelectedName(table.name);
    setPage(1);
    setRows(null);
    setView("data");
  }
  function followRelation(tableName: string) {
    const target = schema?.tables.find(table => table.name === tableName);
    if (target) selectTable(target);
  }

  if (loading && !schema) return <Loading />;
  return <div className="schema-page">
    <header className="schema-heading">
      <div><span className="schema-kicker">VERİTABANI GEZGİNİ</span><h1>Şema</h1></div>
      <button className="schema-refresh" onClick={() => { void load(); setRefreshKey(value => value + 1); }} disabled={loading}><RefreshCw size={17} className={loading ? "schema-spin" : ""} /> Yenile</button>
    </header>
    {error && <div className="schema-error" role="alert">{error}</div>}
    {schema && <div className="schema-browser">
      <aside className="schema-sidebar" aria-label="Veritabanı tabloları">
        <div className="schema-sidebar-title"><Database size={19} /><strong>{schema.databaseName || "Veritabanı"}</strong></div>
        <label className="schema-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tablo ara" aria-label="Tablo ara" /></label>
        <div className="schema-sidebar-caption">TABLOLAR <span>{tables.length}</span></div>
        <nav className="schema-table-list">{tables.map(table => <button key={table.name} className={selectedName === table.name ? "selected" : ""} onClick={() => selectTable(table)} title={table.name}><Table2 size={17} /><span><strong>{table.name}</strong>{table.category && <small>{table.category.name}</small>}</span><span className="schema-table-count">{table.columns.length}</span></button>)}</nav>
        {!tables.length && <p className="schema-empty">Eşleşen tablo yok.</p>}
      </aside>
      <main className="schema-main">
        {selected ? <>
          <div className="schema-main-head"><div><span className="schema-main-kind">{selected.category ? "KATEGORİ TABLOSU" : selected.kind === "VIEW" ? "GÖRÜNÜM" : "MYSQL TABLOSU"}</span><h2>{selected.name}</h2></div></div>
          <div className="schema-tabs" role="tablist" aria-label="Tablo görünümü"><button role="tab" aria-selected={view === "data"} className={view === "data" ? "active" : ""} onClick={() => setView("data")}>Kayıtlar</button><button role="tab" aria-selected={view === "columns"} className={view === "columns" ? "active" : ""} onClick={() => setView("columns")}>Sütun yapısı</button></div>
          {view === "data" ? <section className="schema-content" aria-label="Tablo kayıtları">
            <div className="schema-content-title"><h3>Tablo içeriği</h3><span>{rows?.total.toLocaleString("tr-TR") ?? "—"} kayıt</span></div>
            {rowsError && <div className="schema-error" role="alert">{rowsError}</div>}
            <div className="schema-grid-scroll"><table><thead><tr>{selected.columns.map(column => <th key={column.name}>{column.name}</th>)}</tr></thead><tbody>{!rowsLoading && rows?.rows.map((row, index) => <tr key={`${page}-${index}`}>{selected.columns.map(column => <td key={column.name} title={displayValue(row[column.name])} className={row[column.name] == null ? "schema-null" : ""}>{displayValue(row[column.name])}</td>)}</tr>)}</tbody></table>{rowsLoading && <div className="schema-grid-message">Kayıtlar yükleniyor...</div>}{!rowsLoading && !rowsError && rows?.rows.length === 0 && <div className="schema-grid-message">Bu tabloda henüz kayıt yok.</div>}</div>
            <div className="schema-pagination"><span>{rows?.total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, rows.total)} / ${rows.total.toLocaleString("tr-TR")}` : "0 kayıt"}</span><div><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1 || rowsLoading} aria-label="Önceki sayfa"><ChevronLeft size={17} /></button><strong>{page} / {totalPages}</strong><button onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page >= totalPages || rowsLoading} aria-label="Sonraki sayfa"><ChevronRight size={17} /></button></div></div>
          </section> : <section className="schema-content" aria-label="Sütun yapısı"><div className="schema-content-title"><h3>Sütun yapısı</h3><span>{selected.columns.length} sütun</span></div><div className="schema-grid-scroll"><table><thead><tr><th>Sütun</th><th>SQL tipi</th><th>Anahtar</th><th>NULL</th><th>Varsayılan</th><th>Ek bilgi</th></tr></thead><tbody>{selected.columns.map(column => <tr key={column.name}><td><strong>{column.name}</strong></td><td><code>{column.sqlType}</code></td><td>{column.reference ? <span className="schema-badge foreign"><Link2 size={13} /> FK</span> : column.key === "PRI" ? <span className="schema-badge primary"><KeyRound size={13} /> PK</span> : column.key || "—"}</td><td>{column.nullable ? "Evet" : "Hayır"}</td><td>{column.defaultValue ?? "—"}</td><td>{column.extra || "—"}</td></tr>)}</tbody></table></div></section>}
          <section className="schema-relations"><div><h3>İlişkiler</h3><span>{outgoing.length + selected.referencedBy.length}</span></div>{outgoing.length + selected.referencedBy.length ? <div className="schema-relation-list">{outgoing.map(column => <button key={column.name} onClick={() => followRelation(column.reference!.table)}><Link2 size={16} /><span><strong>{column.name}</strong> → {column.reference!.table}.{column.reference!.column}</span></button>)}{selected.referencedBy.map(reference => <button key={`${reference.table}.${reference.column}`} onClick={() => followRelation(reference.table)}><Link2 size={16} /><span><strong>{reference.table}.{reference.column}</strong> → {selected.name}.{reference.targetColumn}</span></button>)}</div> : <p>Bu tabloda tanımlı yabancı anahtar yok.</p>}</section>
        </> : <div className="schema-empty-state"><Database size={29} /><h2>Tablo seçin</h2><p>Soldaki listeden bir tablo seçerek içeriğini görüntüleyin.</p></div>}
      </main>
    </div>}
  </div>;
}
