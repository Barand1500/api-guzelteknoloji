import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CheckSquare, Columns3, Database, Link2, Plus, Save, Search, Square, Trash2, X } from "lucide-react";
import { request } from "../../shared/api";
import type { Category, Column, DataRow, Schema } from "../../shared/types";

const types: { value: Column["fieldType"]; label: string }[] = [
  { value: "text", label: "Metin" }, { value: "number", label: "Sayı" },
  { value: "boolean", label: "Evet / Hayır" }, { value: "date", label: "Tarih" },
  { value: "relation", label: "Bağlamsal anahtar" },
];
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString("tr-TR") : "Kaydedilince oluşur";

export default function CategoryEditor({ token, category, back }: { token: string; category: Category; back: () => void }) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [options, setOptions] = useState<Schema["relationOptions"]>({});
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<Column["fieldType"]>("text");
  const [referenceCategoryId, setReferenceCategoryId] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmState, setConfirmState] = useState(false);
  const [rowQuery, setRowQuery] = useState("");
  const [rowStatus, setRowStatus] = useState<"all" | "active" | "inactive">("all");
  const [rowSort, setRowSort] = useState<"default" | "newest" | "oldest">("default");
  const [rowPage, setRowPage] = useState(1);
  const [rowPageSize, setRowPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const nextDraftId = useRef(-1);

  const load = useCallback(async () => {
    const [data, available] = await Promise.all([
      request<Schema>(`/admin/categories/${category.id}/schema`, token),
      request<Category[]>("/admin/categories", token),
    ]);
    setSchema(data); setCategories(available); setOptions(data.relationOptions || {});
  }, [category.id, token]);
  useEffect(() => { void load().catch(reason => setError((reason as Error).message)); }, [load]);

  async function loadRelationOptions(targetId: number) {
    if (!targetId || options[targetId]) return;
    try {
      const target = await request<Schema>(`/admin/categories/${targetId}/schema`, token);
      const labelColumn = target.columns.find(column => column.fieldType === "text") || target.columns[0];
      setOptions(current => ({ ...current, [targetId]: target.rows.map(row => ({
        id: row.id, label: labelColumn ? row.data[String(labelColumn.id)] || row.id : row.id,
      })) }));
    } catch (reason) { setError((reason as Error).message); }
  }

  function change(next: Schema) { setSchema(next); setDirty(true); setSaved(false); }
  function addColumn() {
    if (!schema) return;
    const label = name.trim();
    if (!label) { setError("Sütun adını girin"); return; }
    if (schema.columns.some(column => column.name.toLocaleLowerCase("tr-TR") === label.toLocaleLowerCase("tr-TR"))) { setError("Bu sütun zaten var"); return; }
    if (fieldType === "relation" && !referenceCategoryId) { setError("İlişkinin hedef kategorisini seçin"); return; }
    const column: Column = { id: nextDraftId.current--, name: label, fieldType, referenceCategoryId: fieldType === "relation" ? referenceCategoryId : null };
    change({ ...schema, columns: [...schema.columns, column] });
    setName(""); setFieldType("text"); setReferenceCategoryId(0); setError("");
  }
  function addRow() {
    if (!schema || !schema.columns.length) return;
    change({ ...schema, rows: [...schema.rows, { id: `draft-${crypto.randomUUID()}`, active: true, data: {} }] });
  }
  function moveRow(index: number, direction: -1 | 1) {
    if (!schema || index + direction < 0 || index + direction >= schema.rows.length) return;
    const rows = [...schema.rows];
    [rows[index], rows[index + direction]] = [rows[index + direction], rows[index]];
    change({ ...schema, rows });
  }
  async function toggleCategory() {
    if (!schema) return;
    try {
      const active = !schema.category.active;
      await request(`/admin/categories/${category.id}`, token, { method: "PATCH", body: JSON.stringify({ active }) });
      setSchema(current => current ? { ...current, category: { ...current.category, active } } : current);
      setConfirmState(false);
    } catch (reason) { setError((reason as Error).message); }
  }
  function setCell(rowId: string, columnId: number, value: string) {
    if (!schema) return;
    change({ ...schema, rows: schema.rows.map(row => row.id === rowId ? { ...row, data: { ...row.data, [String(columnId)]: value } } : row) });
  }
  const filteredRows = useMemo(() => {
    if (!schema) return [];
    const query = rowQuery.trim().toLocaleLowerCase("tr-TR");
    const rows = schema.rows.filter(row =>
      (rowStatus === "all" || row.active === (rowStatus === "active")) &&
      (!query || [row.id, ...schema.columns.map(column => column.name), ...Object.values(row.data)]
        .join(" ").toLocaleLowerCase("tr-TR").includes(query)),
    );
    if (rowSort !== "default") rows.sort((a, b) => {
      const dateA = a.createdAt ? Date.parse(a.createdAt) : Number.MAX_SAFE_INTEGER;
      const dateB = b.createdAt ? Date.parse(b.createdAt) : Number.MAX_SAFE_INTEGER;
      const result = dateA === dateB ? a.id.localeCompare(b.id, "en", { numeric: true }) : dateA - dateB;
      return rowSort === "newest" ? -result : result;
    });
    return rows;
  }, [schema, rowQuery, rowStatus, rowSort]);
  const rowPages = Math.max(1, Math.ceil(filteredRows.length / rowPageSize));
  const visibleRows = filteredRows.slice((rowPage - 1) * rowPageSize, rowPage * rowPageSize);
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(row => selectedRows.has(row.id));
  function selectVisibleRows(checked: boolean) {
    setSelectedRows(current => {
      const next = new Set(current);
      visibleRows.forEach(row => checked ? next.add(row.id) : next.delete(row.id));
      return next;
    });
  }
  function bulkSetActive(active: boolean) {
    if (!schema || !selectedRows.size) return;
    change({ ...schema, rows: schema.rows.map(row => selectedRows.has(row.id) ? { ...row, active } : row) });
    setSelectedRows(new Set());
  }
  function deleteSelectedRows() {
    if (!schema || !selectedRows.size) return;
    change({ ...schema, rows: schema.rows.filter(row => !selectedRows.has(row.id)) });
    setSelectedRows(new Set());
    setConfirmBulkDelete(false);
  }
  async function save() {
    if (!schema || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const result = await request<Schema>(`/admin/categories/${category.id}/schema`, token, {
        method: "PUT", body: JSON.stringify({ columns: schema.columns, rows: schema.rows }),
      });
      setSchema(result); setOptions(result.relationOptions || {}); setDirty(false); setSaved(true); setSelectedRows(new Set());
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }
  if (!schema) return <div className="editor-loading">{error || "Veri tablosu yükleniyor…"}</div>;

  return <div className="category-editor-page">
    <div className="editor-head">
      <div><button className="editor-back" onClick={back}><ArrowLeft size={15} /> Kategorilere dön</button><h2>{schema.category.name}</h2><p>Kayıtları ve SQL sütunlarını bu ekrandan yönetin.</p></div>
      <div className="editor-head-actions"><button className={`editor-status ${schema.category.active ? "live" : ""}`} onClick={() => setConfirmState(true)} title="API durumunu değiştir">{schema.category.active ? "● API açık" : "● API kapalı"}</button></div>
    </div>
    <div className="editor-meta"><div><span>MySQL tablosu</span><code>{schema.category.tableName}</code></div><div><span>API adresi</span><code>GET /api/categories/{schema.category.slug}</code></div><div><span>Kayıt</span><strong>{schema.rows.length}</strong></div><div><span>Özel sütun</span><strong>{schema.columns.length}</strong></div></div>

    <section className="editor-card">
      <div className="editor-section-head"><div><Columns3 size={18} /><div><h3>Sütun yapısı</h3><p>ID ve tarih alanları otomatik yönetilir.</p></div></div></div>
      <div className="editor-column-list">{schema.columns.map(column => <div className="editor-column" key={column.id}><span className="editor-column-icon">{column.fieldType === "relation" ? <Link2 size={16} /> : <Columns3 size={16} />}</span><div><strong>{column.name}</strong><small>{types.find(type => type.value === column.fieldType)?.label}{column.referenceCategoryId ? ` · ${categories.find(item => item.id === column.referenceCategoryId)?.name || "Kategori"}` : ""}</small></div><code>{column.sqlName || "Kaydedilince oluşur"}</code><button aria-label={`${column.name} sütununu sil`} title="Sütunu sil" onClick={() => change({ ...schema, columns: schema.columns.filter(item => item.id !== column.id), rows: schema.rows.map(row => { const data = { ...row.data }; delete data[String(column.id)]; return { ...row, data }; }) })}><Trash2 size={16} /></button></div>)}</div>
      <div className="editor-add-column"><input value={name} onChange={event => setName(event.target.value)} placeholder="Yeni sütun adı" aria-label="Yeni sütun adı" /><select value={fieldType} onChange={event => setFieldType(event.target.value as Column["fieldType"])} aria-label="Sütun türü">{types.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select>{fieldType === "relation" && <select value={referenceCategoryId} onChange={event => { const id = Number(event.target.value); setReferenceCategoryId(id); void loadRelationOptions(id); }} aria-label="Hedef kategori"><option value={0}>Hedef kategori seçin</option>{categories.filter(item => item.id !== category.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button onClick={addColumn}><Plus size={16} /> Sütun ekle</button></div>
    </section>

    <section className="editor-card editor-data-card">    <div className="editor-section-head"><div><Database size={18} /><div><h3>Tablo kayıtları</h3><p>Filtreleyin, birden fazla satır seçin ve kaydedin.</p></div></div><button className="editor-add-row" onClick={addRow} disabled={!schema.columns.length}><Plus size={16} /> Satır ekle</button></div>
    <div className="editor-table-tools">
      <label className="editor-table-search"><Search size={15} /><input value={rowQuery} onChange={event => { setRowQuery(event.target.value); setRowPage(1); }} placeholder="Kayıt veya alan değeri ara" aria-label="Kayıtları ara" /></label>
      <select value={rowStatus} onChange={event => { setRowStatus(event.target.value as typeof rowStatus); setRowPage(1); }} aria-label="Kayıt durumuna göre filtrele"><option value="all">Tüm durumlar</option><option value="active">Aktif</option><option value="inactive">Pasif</option></select>
      <select value={rowSort} onChange={event => { setRowSort(event.target.value as typeof rowSort); setRowPage(1); }} aria-label="Kayıtları sırala"><option value="default">Özel sıra</option><option value="newest">Yeni kayıtlar</option><option value="oldest">Eski kayıtlar</option></select>
      <select value={rowPageSize} onChange={event => { setRowPageSize(Number(event.target.value)); setRowPage(1); }} aria-label="Sayfa başına kayıt"><option value={10}>10 satır</option><option value={25}>25 satır</option><option value={50}>50 satır</option></select>
    </div>
    {selectedRows.size > 0 && <div className="editor-bulk-toolbar"><strong>{selectedRows.size} satır seçildi</strong><button onClick={() => bulkSetActive(true)}>Aktif yap</button><button onClick={() => bulkSetActive(false)}>Pasif yap</button><button className="danger" onClick={() => setConfirmBulkDelete(true)}><Trash2 size={14} /> Seçilenleri sil</button></div>}
    <div className="editor-table-wrap"><table className="editor-table"><thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={event => selectVisibleRows(event.target.checked)} aria-label="Bu sayfadaki tüm satırları seç" /></th><th>Sıra</th><th>id <span>otomatik</span></th>{schema.columns.map(column => <th key={column.id}>{column.name}<small>{types.find(type => type.value === column.fieldType)?.label}</small></th>)}<th>created_at</th><th>updated_at</th><th>Durum</th><th aria-label="İşlemler" /></tr></thead><tbody>{visibleRows.map((row, index) => { const sourceIndex = schema.rows.findIndex(item => item.id === row.id); return <tr key={row.id}><td><input type="checkbox" checked={selectedRows.has(row.id)} onChange={event => setSelectedRows(current => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} aria-label={`${row.id} satırını seç`} /></td><td className="editor-row-order"><button onClick={() => moveRow(sourceIndex, -1)} disabled={sourceIndex === 0} aria-label={`${sourceIndex + 1}. satırı yukarı taşı`}><ArrowUp size={14} /></button><span>{sourceIndex + 1}</span><button onClick={() => moveRow(sourceIndex, 1)} disabled={sourceIndex === schema.rows.length - 1} aria-label={`${sourceIndex + 1}. satırı aşağı taşı`}><ArrowDown size={14} /></button></td><td><code className="editor-readonly-id" title={row.id}>{row.id.startsWith("draft-") ? "Otomatik" : row.id}</code></td>{schema.columns.map(column => <td key={column.id}><CellInput value={row.data[String(column.id)] || ""} column={column} options={options[column.referenceCategoryId || 0] || []} onChange={value => setCell(row.id, column.id, value)} /></td>)}<td className="editor-date">{dateLabel(row.createdAt)}</td><td className="editor-date">{dateLabel(row.updatedAt)}</td><td><button className={`editor-row-toggle ${row.active ? "on" : ""}`} onClick={() => change({ ...schema, rows: schema.rows.map(item => item.id === row.id ? { ...item, active: !item.active } : item) })}>{row.active ? "Aktif" : "Kapalı"}</button></td><td><button className="editor-delete-row" onClick={() => change({ ...schema, rows: schema.rows.filter(item => item.id !== row.id) })} aria-label="Satırı sil"><Trash2 size={16} /></button></td></tr>; })}</tbody></table>{schema.rows.length > 0 && !filteredRows.length && <div className="editor-empty">Filtreye uygun kayıt bulunamadı.</div>}{!schema.rows.length && <div className="editor-empty">Henüz kayıt yok. İlk satırı ekleyin.</div>}</div>
    <div className="editor-table-pagination"><span>{filteredRows.length ? `${(rowPage - 1) * rowPageSize + 1}–${Math.min(rowPage * rowPageSize, filteredRows.length)} / ${filteredRows.length} kayıt` : "0 kayıt"}</span><div><button disabled={rowPage <= 1} onClick={() => setRowPage(value => Math.max(1, value - 1))}>Geri</button><strong>{Math.min(rowPage, rowPages)} / {rowPages}</strong><button disabled={rowPage >= rowPages} onClick={() => setRowPage(value => Math.min(rowPages, value + 1))}>İleri</button></div></div>
    </section>
    <div className="editor-save-bar"><div>{error ? <span className="editor-error" role="alert">{error}</span> : saved ? <span className="editor-saved"><Check size={16} /> Kaydedildi. Değişiklikler MySQL tablosuna yazıldı.</span> : dirty ? <span>Kaydedilmemiş değişiklikler var.</span> : <span>Tablo güncel.</span>}</div><button onClick={() => void save()} disabled={!dirty || saving}><Save size={17} /> {saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>
    {confirmState && <div className="editor-confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmState(false); }}><div className="editor-confirm" role="dialog" aria-modal="true" aria-labelledby="editor-confirm-title"><button className="editor-confirm-close" onClick={() => setConfirmState(false)} aria-label="Kapat"><X size={18} /></button><h3 id="editor-confirm-title">API'yi {schema.category.active ? "kapat" : "aç"}?</h3><p>{schema.category.active ? "Bu kategorinin verileri API üzerinden erişilemez olacak." : "Bu kategorinin verileri yeniden API üzerinden erişilebilir olacak."}</p><div><button onClick={() => setConfirmState(false)}>Vazgeç</button><button className={schema.category.active ? "danger" : "confirm"} onClick={() => void toggleCategory()}>{schema.category.active ? "Evet, kapat" : "Evet, aç"}</button></div></div></div>}
    {confirmBulkDelete && <div className="editor-confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmBulkDelete(false); }}><div className="editor-confirm" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title"><button className="editor-confirm-close" onClick={() => setConfirmBulkDelete(false)} aria-label="Kapat"><X size={18} /></button><h3 id="bulk-delete-title">{selectedRows.size} satır silinsin mi?</h3><p>Bu işlem seçilen kayıtları siler. Değişikliği veritabanına uygulamak için ayrıca “Değişiklikleri kaydet” düğmesine basmanız gerekir.</p><div><button onClick={() => setConfirmBulkDelete(false)}>Vazgeç</button><button className="danger" onClick={deleteSelectedRows}>Seçilen satırları sil</button></div></div></div>}
  </div>;
}

function CellInput({ value, column, options, onChange }: { value: string; column: Column; options: { id: string; label: string }[]; onChange: (value: string) => void }) {
  if (column.fieldType === "relation") return <select value={value} onChange={event => onChange(event.target.value)} aria-label={column.name}><option value="">İlişki seçin</option>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
  if (column.fieldType === "boolean") return <select value={value} onChange={event => onChange(event.target.value)} aria-label={column.name}><option value="">Boş</option><option value="1">Evet</option><option value="0">Hayır</option></select>;
  return <input type={column.fieldType === "number" ? "number" : column.fieldType === "date" ? "date" : "text"} step={column.fieldType === "number" ? "any" : undefined} value={value} onChange={event => onChange(event.target.value)} aria-label={column.name} placeholder={column.fieldType === "text" ? "Değer girin" : undefined} />;
}
