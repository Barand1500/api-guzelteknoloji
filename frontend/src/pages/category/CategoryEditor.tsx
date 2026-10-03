import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarClock, Check, Columns3, Database, Link2, Plus, Save, Trash2 } from "lucide-react";
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
    change({ ...schema, rows: [{ id: `draft-${crypto.randomUUID()}`, active: true, data: {} }, ...schema.rows] });
  }
  function setCell(rowId: string, columnId: number, value: string) {
    if (!schema) return;
    change({ ...schema, rows: schema.rows.map(row => row.id === rowId ? { ...row, data: { ...row.data, [String(columnId)]: value } } : row) });
  }
  async function save() {
    if (!schema || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const result = await request<Schema>(`/admin/categories/${category.id}/schema`, token, {
        method: "PUT", body: JSON.stringify({ columns: schema.columns, rows: schema.rows }),
      });
      setSchema(result); setOptions(result.relationOptions || {}); setDirty(false); setSaved(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }
  if (!schema) return <div className="editor-loading">{error || "Veri tablosu yükleniyor…"}</div>;

  return <div className="category-editor-page">
    <div className="editor-crumb"><button onClick={back}><ArrowLeft size={15} /> Genel Yönetim</button><span>›</span><strong>{schema.category.name}</strong></div>
    <div className="editor-head">
      <div><div className="editor-kicker"><Database size={15} /> VERİTABANI TABLOSU</div><h2>{schema.category.name}</h2><p>Kayıtları ve SQL sütunlarını bu ekrandan yönetin.</p></div>
      <div className="editor-head-actions"><span className={`editor-status ${schema.category.active ? "live" : ""}`}>{schema.category.active ? "API açık" : "API kapalı"}</span><button className="editor-secondary" onClick={async () => {
        try { const active = !schema.category.active; await request(`/admin/categories/${category.id}`, token, { method: "PATCH", body: JSON.stringify({ active }) }); setSchema({ ...schema, category: { ...schema.category, active } }); }
        catch (reason) { setError((reason as Error).message); }
      }}>{schema.category.active ? "Kapat" : "Aç"}</button></div>
    </div>
    <div className="editor-meta"><div><span>MySQL tablosu</span><code>{schema.category.tableName}</code></div><div><span>API adresi</span><code>GET /api/categories/{schema.category.slug}</code></div><div><span>Kayıt</span><strong>{schema.rows.length}</strong></div><div><span>Özel sütun</span><strong>{schema.columns.length}</strong></div></div>

    <section className="editor-card">
      <div className="editor-section-head"><div><Columns3 size={18} /><div><h3>Sütun yapısı</h3><p>ID ve tarih alanları otomatik yönetilir.</p></div></div></div>
      <div className="editor-system-columns"><span><Database size={14} /> id <small>Birincil anahtar · salt okunur</small></span><span><CalendarClock size={14} /> created_at <small>Otomatik</small></span><span><CalendarClock size={14} /> updated_at <small>Otomatik</small></span></div>
      <div className="editor-column-list">{schema.columns.map(column => <div className="editor-column" key={column.id}><span className="editor-column-icon">{column.fieldType === "relation" ? <Link2 size={16} /> : <Columns3 size={16} />}</span><div><strong>{column.name}</strong><small>{types.find(type => type.value === column.fieldType)?.label}{column.referenceCategoryId ? ` · ${categories.find(item => item.id === column.referenceCategoryId)?.name || "Kategori"}` : ""}</small></div><code>{column.sqlName || "Kaydedilince oluşur"}</code><button aria-label={`${column.name} sütununu sil`} title="Sütunu sil" onClick={() => change({ ...schema, columns: schema.columns.filter(item => item.id !== column.id), rows: schema.rows.map(row => { const data = { ...row.data }; delete data[String(column.id)]; return { ...row, data }; }) })}><Trash2 size={16} /></button></div>)}</div>
      <div className="editor-add-column"><input value={name} onChange={event => setName(event.target.value)} placeholder="Yeni sütun adı" aria-label="Yeni sütun adı" /><select value={fieldType} onChange={event => setFieldType(event.target.value as Column["fieldType"])} aria-label="Sütun türü">{types.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select>{fieldType === "relation" && <select value={referenceCategoryId} onChange={event => { const id = Number(event.target.value); setReferenceCategoryId(id); void loadRelationOptions(id); }} aria-label="Hedef kategori"><option value={0}>Hedef kategori seçin</option>{categories.filter(item => item.id !== category.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button onClick={addColumn}><Plus size={16} /> Sütun ekle</button></div>
    </section>

    <section className="editor-card editor-data-card"><div className="editor-section-head"><div><Database size={18} /><div><h3>Tablo kayıtları</h3><p>Hücrelere doğrudan yazın, ardından kaydedin.</p></div></div><button className="editor-add-row" onClick={addRow} disabled={!schema.columns.length}><Plus size={16} /> Satır ekle</button></div>
      <div className="editor-table-wrap"><table className="editor-table"><thead><tr><th>#</th><th>id <span>otomatik</span></th>{schema.columns.map(column => <th key={column.id}>{column.name}<small>{types.find(type => type.value === column.fieldType)?.label}</small></th>)}<th>created_at</th><th>updated_at</th><th>Durum</th><th aria-label="İşlemler" /></tr></thead><tbody>{schema.rows.map((row, index) => <tr key={row.id}><td className="editor-row-number">{index + 1}</td><td><code className="editor-readonly-id" title={row.id}>{row.id.startsWith("draft-") ? "Otomatik" : row.id}</code></td>{schema.columns.map(column => <td key={column.id}><CellInput value={row.data[String(column.id)] || ""} column={column} options={options[column.referenceCategoryId || 0] || []} onChange={value => setCell(row.id, column.id, value)} /></td>)}<td className="editor-date">{dateLabel(row.createdAt)}</td><td className="editor-date">{dateLabel(row.updatedAt)}</td><td><button className={`editor-row-toggle ${row.active ? "on" : ""}`} onClick={() => change({ ...schema, rows: schema.rows.map(item => item.id === row.id ? { ...item, active: !item.active } : item) })}>{row.active ? "Aktif" : "Kapalı"}</button></td><td><button className="editor-delete-row" onClick={() => change({ ...schema, rows: schema.rows.filter(item => item.id !== row.id) })} aria-label="Satırı sil"><Trash2 size={16} /></button></td></tr>)}</tbody></table>{!schema.rows.length && <div className="editor-empty">Henüz kayıt yok. İlk satırı ekleyin.</div>}</div>
    </section>
    <div className="editor-save-bar"><div>{error ? <span className="editor-error" role="alert">{error}</span> : saved ? <span className="editor-saved"><Check size={16} /> Kaydedildi. Değişiklikler MySQL tablosuna yazıldı.</span> : dirty ? <span>Kaydedilmemiş değişiklikler var.</span> : <span>Tablo güncel.</span>}</div><button onClick={() => void save()} disabled={!dirty || saving}><Save size={17} /> {saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>
  </div>;
}

function CellInput({ value, column, options, onChange }: { value: string; column: Column; options: { id: string; label: string }[]; onChange: (value: string) => void }) {
  if (column.fieldType === "relation") return <select value={value} onChange={event => onChange(event.target.value)} aria-label={column.name}><option value="">İlişki seçin</option>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
  if (column.fieldType === "boolean") return <select value={value} onChange={event => onChange(event.target.value)} aria-label={column.name}><option value="">Boş</option><option value="1">Evet</option><option value="0">Hayır</option></select>;
  return <input type={column.fieldType === "number" ? "number" : column.fieldType === "date" ? "date" : "text"} step={column.fieldType === "number" ? "any" : undefined} value={value} onChange={event => onChange(event.target.value)} aria-label={column.name} placeholder={column.fieldType === "text" ? "Değer girin" : undefined} />;
}
