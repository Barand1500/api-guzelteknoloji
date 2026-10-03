import { useCallback, useEffect, useState, type FormEvent } from "react";
import { request } from "../../shared/api";
import type { Category, Column, DataRow, Schema } from "../../shared/types";

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg>;
}

export default function CategoryEditor({ token, category, back }: { token: string; category: Category; back: () => void }) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState("");
  const [columnName, setColumnName] = useState("");
  const [edit, setEdit] = useState<{ rowId: string; columnId: number } | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try { setSchema(await request<Schema>(`/admin/categories/${category.id}/schema`, token)); }
    catch (reason) { setError((reason as Error).message); }
  }, [category.id, token]);
  useEffect(() => { void load(); }, [load]);
  if (!schema) return <div className="empty">Yükleniyor…</div>;
  const current = schema;

  function update(next: Schema) { setSchema(next); setDirty(true); setSaved(false); }
  function addColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = columnName.trim();
    if (!name) return;
    update({ ...current, columns: [...current.columns, { id: -Date.now(), name, fieldType: "text" }] });
    setColumnName("");
  }
  function addRow() {
    const row: DataRow = { id: `draft-${crypto.randomUUID()}`, data: {}, active: true };
    update({ ...current, rows: [row, ...current.rows] });
    if (current.columns[0]) { setEdit({ rowId: row.id, columnId: current.columns[0].id }); setValue(""); }
  }
  function commitCell() {
    if (!edit) return;
    update({ ...current, rows: current.rows.map(row => row.id === edit.rowId ? { ...row, data: { ...row.data, [String(edit.columnId)]: value } } : row) });
    setEdit(null);
  }
  async function saveAll() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const columnMap = new Map<number, number>();
      for (const column of current.columns) {
        if (column.id < 0) {
          const created = await request<Column>(`/admin/categories/${category.id}/columns`, token, { method: "POST", body: JSON.stringify({ name: column.name, fieldType: column.fieldType }) });
          columnMap.set(column.id, created.id);
          column.id = created.id;
        }
      }
      const before = await request<Schema>(`/admin/categories/${category.id}/schema`, token);
      const remainingRows = new Set(before.rows.map(row => row.id));
      for (const row of current.rows) {
        const data = Object.fromEntries(Object.entries(row.data).map(([key, item]) => [String(columnMap.get(Number(key)) ?? key), item]));
        if (row.id.startsWith("draft-")) {
          await request(`/admin/categories/${category.id}/rows`, token, { method: "POST", body: JSON.stringify({ data, active: row.active }) });
        } else {
          await request(`/admin/categories/${category.id}/rows/${row.id}`, token, { method: "PATCH", body: JSON.stringify({ data, active: row.active }) });
          remainingRows.delete(row.id);
        }
      }
      for (const id of remainingRows) await request(`/admin/categories/${category.id}/rows/${id}`, token, { method: "DELETE" });
      const after = await request<Schema>(`/admin/categories/${category.id}/schema`, token);
      for (const column of after.columns) if (!current.columns.some(item => item.id === column.id)) await request(`/admin/categories/${category.id}/columns/${column.id}`, token, { method: "DELETE" });
      await load(); setDirty(false); setSaved(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  return <div className="manager-page">
    <div className="manager-top manager-hero">
      <button className="btn soft" onClick={back}>← Geri</button>
      <div className="manager-title"><div className="eyebrow">KATEGORİ TABLOSU</div><h2>{current.category.name}</h2><code>GET /api/categories/{current.category.slug}</code></div>
      <button className={`switch ${current.category.active ? "on" : ""}`} onClick={async () => {
        try { const active = !current.category.active; await request(`/admin/categories/${category.id}`, token, { method: "PATCH", body: JSON.stringify({ active }) }); setSchema({ ...current, category: { ...current.category, active } }); }
        catch (reason) { setError((reason as Error).message); }
      }}>{current.category.active ? "API açık" : "API kapalı"}</button>
    </div>
    <section className="panel schema-panel spreadsheet-panel">
      <div className="spreadsheet-heading"><div><div className="eyebrow">VERİ TABLOSU</div><h2>{current.category.name} <span>tablosu</span></h2><p>Sütun ve satırları hazırlayın, ardından değişiklikleri birlikte kaydedin.</p></div><div className="table-count"><strong>{current.rows.length}</strong><span>satır</span><i /><strong>{current.columns.length}</strong><span>sütun</span></div></div>
      <div className="table-tools"><form className="column-add" onSubmit={addColumn}><input value={columnName} onChange={event => setColumnName(event.target.value)} placeholder="Yeni sütun adı (örn. Ülke kodu)" aria-label="Yeni sütun adı" /><button className="btn soft" disabled={!columnName.trim()}>＋ Sütun ekle</button></form><button className="btn" onClick={addRow} disabled={!current.columns.length}>＋ Satır ekle</button></div>
      {current.columns.length ? <div className="table-wrap spreadsheet-wrap"><table className="table spreadsheet"><thead><tr><th className="row-number-head">#</th>{current.columns.map(column => <th key={column.id}><span>{column.name}</span><button className="icon-button column-delete" onClick={() => update({ ...current, columns: current.columns.filter(item => item.id !== column.id), rows: current.rows.map(row => { const data = { ...row.data }; delete data[String(column.id)]; return { ...row, data }; }) })} title="Sütunu sil" aria-label={`Sütunu sil: ${column.name}`}><TrashIcon /></button></th>)}<th>Durum</th><th className="row-action-head" /></tr></thead>
        <tbody>{current.rows.map((row, index) => <tr key={row.id}><td className="row-number">{index + 1}</td>{current.columns.map(column => {
          const editing = edit?.rowId === row.id && edit.columnId === column.id;
          return <td key={column.id} className="spreadsheet-cell" onDoubleClick={() => { setEdit({ rowId: row.id, columnId: column.id }); setValue(row.data[String(column.id)] ?? ""); }} title="Düzenlemek için çift tıklayın">{editing ? <input autoFocus className="cell-editor" value={value} onChange={event => setValue(event.target.value)} onBlur={commitCell} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEdit(null); }} /> : <span className={!row.data[String(column.id)] ? "cell-placeholder" : ""}>{row.data[String(column.id)] || "—"}</span>}</td>;
        })}<td><button className={`switch compact ${row.active ? "on" : ""}`} onClick={() => update({ ...current, rows: current.rows.map(item => item.id === row.id ? { ...item, active: !item.active } : item) })}>{row.active ? "Aktif" : "Kapalı"}</button></td><td className="row-action-cell"><button className="icon-button delete-icon" onClick={() => update({ ...current, rows: current.rows.filter(item => item.id !== row.id) })} title="Satırı sil" aria-label="Satırı sil"><TrashIcon /></button></td></tr>)}</tbody>
      </table>{!current.rows.length && <div className="table-empty-state"><span>Henüz satır yok</span><small>Tabloya ilk verinizi ekleyin.</small></div>}</div> : <div className="table-empty-state no-columns"><span>Tablo henüz oluşturulmadı</span><small>Önce bir sütun ekleyin.</small></div>}
      <div className="spreadsheet-footer"><span>{saved ? "Değişiklikler kaydedildi." : dirty ? "Kaydedilmemiş değişiklikler var." : "Tüm değişiklikler kaydedildi."}</span><span>Hücreye çift tıklayarak düzenleyin</span></div>
      <div className="manager-save-bar"><span>{error && <b role="alert">{error}</b>}</span><button type="button" className="btn save-changes-button" disabled={!dirty || saving} onClick={() => void saveAll()}>{saving ? "Kaydediliyor…" : saved ? "Kaydedildi ✓" : "Değişiklikleri kaydet"}</button></div>
    </section>
  </div>;
}
