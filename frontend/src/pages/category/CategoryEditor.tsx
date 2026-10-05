import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Columns3,
  Database,
  Eye,
  ImagePlus,
  Link2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { request } from "../../shared/api";
import type { Category, Column, Schema } from "../../shared/types";
import FieldTypePicker, { fieldTypeLabels } from "./FieldTypePicker";

type SystemColumn = "id" | "created_at" | "updated_at";
const systemColumns: { key: SystemColumn; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "created_at", label: "Oluşturulma tarihi" },
  { key: "updated_at", label: "Güncellenme tarihi" },
];
const dateLabel = (value?: string) =>
  value ? new Date(value).toLocaleString("tr-TR") : "Kaydedilince oluşur";

export default function CategoryEditor({
  token,
  category,
  back,
}: {
  token: string;
  category: Category;
  back: () => void;
}) {
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
  const [rowStatus, setRowStatus] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [pendingImages, setPendingImages] = useState(0);
  const [rowPage, setRowPage] = useState(1);
  const [rowPageSize, setRowPageSize] = useState(25);
  const [visibleSystemColumns, setVisibleSystemColumns] = useState<Set<SystemColumn>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`category-system-columns-${category.id}`) || '["id"]');
      return new Set(Array.isArray(saved) ? saved.filter((key): key is SystemColumn => systemColumns.some(column => column.key === key)) : ["id"]);
    } catch { return new Set<SystemColumn>(["id"]); }
  });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(
    () => new Set(),
  );
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const nextDraftId = useRef(-1);

  function toggleSystemColumn(key: SystemColumn) {
    setVisibleSystemColumns(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(`category-system-columns-${category.id}`, JSON.stringify([...next]));
      return next;
    });
  }

  const load = useCallback(async () => {
    const [data, available] = await Promise.all([
      request<Schema>(`/admin/categories/${category.id}/schema`, token),
      request<Category[]>("/admin/categories", token),
    ]);
    setSchema(data);
    setCategories(available);
    setOptions(data.relationOptions || {});
  }, [category.id, token]);
  useEffect(() => {
    void load().catch((reason) => setError((reason as Error).message));
  }, [load]);

  async function loadRelationOptions(targetId: number) {
    if (!targetId || options[targetId]) return;
    try {
      const choices = await request<Schema["relationOptions"][number]>(
        `/admin/categories/${targetId}/relation-options`, token,
      );
      setOptions((current) => ({
        ...current,
        [targetId]: choices,
      }));
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  function change(next: Schema) {
    setSchema(next);
    setDirty(true);
    setSaved(false);
  }
  function addColumn() {
    if (!schema) return;
    const label = name.trim();
    if (!label) {
      setError("Sütun adını girin");
      return;
    }
    if (
      schema.columns.some(
        (column) =>
          column.name.toLocaleLowerCase("tr-TR") ===
          label.toLocaleLowerCase("tr-TR"),
      )
    ) {
      setError("Bu sütun zaten var");
      return;
    }
    if (fieldType === "relation" && !referenceCategoryId) {
      setError("İlişkinin hedef kategorisini seçin");
      return;
    }
    const column: Column = {
      id: nextDraftId.current--,
      name: label,
      fieldType,
      referenceCategoryId:
        fieldType === "relation" ? referenceCategoryId : null,
    };
    change({ ...schema, columns: [...schema.columns, column] });
    setName("");
    setFieldType("text");
    setReferenceCategoryId(0);
    setError("");
  }
  function addRow() {
    if (!schema || !schema.columns.length) return;
    change({
      ...schema,
      rows: [
        ...schema.rows,
        { id: `draft-${crypto.randomUUID()}`, active: true, data: {} },
      ],
    });
  }
  async function toggleCategory() {
    if (!schema) return;
    try {
      const active = !schema.category.active;
      await request(`/admin/categories/${category.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      setSchema((current) =>
        current
          ? { ...current, category: { ...current.category, active } }
          : current,
      );
      setConfirmState(false);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  function setCell(rowId: string, columnId: number, value: string) {
    setSchema(current => current ? ({
      ...current,
      rows: current.rows.map(row => row.id === rowId
        ? { ...row, data: { ...row.data, [String(columnId)]: value } } : row),
    }) : current);
    setDirty(true);
    setSaved(false);
  }
  async function selectImage(rowId: string, columnId: number, file: File, storage: "upload" | "base64") {
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 1024 * 1024) {
      setError("PNG, JPEG veya WebP görsel seçin (en fazla 1 MB).");
      return;
    }
    setPendingImages(count => count + 1);
    setError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Görsel okunamadı"));
        reader.readAsDataURL(file);
      });
      const value = storage === "base64" ? dataUrl
        : (await request<{ url: string }>("/admin/images", token, { method: "POST", body: JSON.stringify({ dataUrl }) })).url;
      setCell(rowId, columnId, value);
    } catch (reason) { setError((reason as Error).message); }
    finally { setPendingImages(count => count - 1); }
  }
  const filteredRows = useMemo(() => {
    if (!schema) return [];
    const query = rowQuery.trim().toLocaleLowerCase("tr-TR");
    const rows = schema.rows.filter(
      (row) =>
        (rowStatus === "all" || row.active === (rowStatus === "active")) &&
        (!query ||
          [
            row.id,
            ...schema.columns.map((column) => column.name),
            ...Object.values(row.data),
          ]
            .join(" ")
            .toLocaleLowerCase("tr-TR")
            .includes(query)),
    );
    return rows;
  }, [schema, rowQuery, rowStatus]);
  const rowPages = Math.max(1, Math.ceil(filteredRows.length / rowPageSize));
  const visibleRows = filteredRows.slice(
    (rowPage - 1) * rowPageSize,
    rowPage * rowPageSize,
  );
  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selectedRows.has(row.id));
  function selectVisibleRows(checked: boolean) {
    setSelectedRows((current) => {
      const next = new Set(current);
      visibleRows.forEach((row) =>
        checked ? next.add(row.id) : next.delete(row.id),
      );
      return next;
    });
  }
  function bulkSetActive(active: boolean) {
    if (!schema || !selectedRows.size) return;
    change({
      ...schema,
      rows: schema.rows.map((row) =>
        selectedRows.has(row.id) ? { ...row, active } : row,
      ),
    });
    setSelectedRows(new Set());
  }
  function deleteSelectedRows() {
    if (!schema || !selectedRows.size) return;
    change({
      ...schema,
      rows: schema.rows.filter((row) => !selectedRows.has(row.id)),
    });
    setSelectedRows(new Set());
    setConfirmBulkDelete(false);
  }
  async function save() {
    if (!schema || saving || pendingImages) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await request<Schema>(
        `/admin/categories/${category.id}/schema`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({ columns: schema.columns, rows: schema.rows }),
        },
      );
      setSchema(result);
      setOptions(result.relationOptions || {});
      setDirty(false);
      setSaved(true);
      setSelectedRows(new Set());
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!schema)
    return (
      <div className="editor-loading">
        {error || "Veri tablosu yükleniyor…"}
      </div>
    );

  return (
    <div className="category-editor-page">
      <div className="editor-head">
        <div>
          <button className="editor-back" onClick={back}>
            <ArrowLeft size={15} /> Kategorilere dön
          </button>
          <h2>{schema.category.name}</h2>
          <code className="editor-table-name">{schema.category.tableName}</code>
        </div>
        <div className="editor-head-actions">
          <code className="editor-api-address">GET /api/categories/{schema.category.slug}</code>
          <button
            className={`editor-status ${schema.category.active ? "live" : ""}`}
            onClick={() => setConfirmState(true)}
            title="API durumunu değiştir"
          >
            {schema.category.active ? "● API açık" : "● API kapalı"}
          </button>
        </div>
      </div>

      <details className="editor-card editor-columns-accordion">
        <summary className="editor-section-head">
          <div>
            <Columns3 size={18} />
            <div>
              <h3>Sütun yapısı</h3>
              <p>{schema.columns.length} özel sütun</p>
            </div>
          </div>
          <span className="editor-accordion-action">Sütunları düzenle <ChevronDown size={18} /></span>
        </summary>
        <div className="editor-columns-content">
        <div className="editor-column-list">
          {schema.columns.map((column) => (
            <div className="editor-column" key={column.id}>
              <span className="editor-column-icon">
                {column.fieldType === "relation" ? (
                  <Link2 size={16} />
                ) : (
                  <Columns3 size={16} />
                )}
              </span>
              <div>
                <strong>{column.name}</strong>
                <small>
                  {fieldTypeLabels[column.fieldType]}
                  {column.referenceCategoryId
                    ? ` · ${categories.find((item) => item.id === column.referenceCategoryId)?.name || "Kategori"}`
                    : ""}
                </small>
              </div>
              <code>{column.sqlName || "Kaydedilince oluşur"}</code>
              <button
                aria-label={`${column.name} sütununu sil`}
                title="Sütunu sil"
                onClick={() =>
                  change({
                    ...schema,
                    columns: schema.columns.filter(
                      (item) => item.id !== column.id,
                    ),
                    rows: schema.rows.map((row) => {
                      const data = { ...row.data };
                      delete data[String(column.id)];
                      return { ...row, data };
                    }),
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="editor-add-column">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Yeni sütun adı"
            aria-label="Yeni sütun adı"
          />
          <FieldTypePicker value={fieldType} onChange={setFieldType} />
          {fieldType === "relation" && (
            <select
              value={referenceCategoryId}
              onChange={(event) => {
                const id = Number(event.target.value);
                setReferenceCategoryId(id);
                void loadRelationOptions(id);
              }}
              aria-label="Hedef kategori"
            >
              <option value={0}>Hedef kategori seçin</option>
              {categories
                .filter((item) => item.id !== category.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          )}
          <button onClick={addColumn}>
            <Plus size={16} /> Sütun ekle
          </button>
        </div>
        </div>
      </details>

      <section className="editor-card editor-data-card">
        {" "}
        <div className="editor-section-head">
          <div>
            <Database size={18} />
            <div>
              <h3>Tablo kayıtları</h3>
              <p>Filtreleyin, birden fazla satır seçin ve kaydedin.</p>
            </div>
          </div>
          <button
            className="editor-add-row"
            onClick={addRow}
            disabled={!schema.columns.length}
          >
            <Plus size={16} /> Satır ekle
          </button>
        </div>
        <div className="editor-table-tools">
          <label className="editor-table-search">
            <Search size={15} />
            <input
              value={rowQuery}
              onChange={(event) => {
                setRowQuery(event.target.value);
                setRowPage(1);
              }}
              placeholder="Kayıt veya alan değeri ara"
              aria-label="Kayıtları ara"
            />
          </label>
          <select
            value={rowStatus}
            onChange={(event) => {
              setRowStatus(event.target.value as typeof rowStatus);
              setRowPage(1);
            }}
            aria-label="Kayıt durumuna göre filtrele"
          >
            <option value="all">Tüm durumlar</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
          <details className="editor-system-visibility">
            <summary><Eye size={16} /> Otomatik alanlar</summary>
            <div>{systemColumns.map(column => <label key={column.key}>
              <input type="checkbox" checked={visibleSystemColumns.has(column.key)} onChange={() => toggleSystemColumn(column.key)} />
              {column.label}
            </label>)}</div>
          </details>
          <select
            value={rowPageSize}
            onChange={(event) => {
              setRowPageSize(Number(event.target.value));
              setRowPage(1);
            }}
            aria-label="Sayfa başına kayıt"
          >
            <option value={10}>10 satır</option>
            <option value={25}>25 satır</option>
            <option value={50}>50 satır</option>
          </select>
        </div>
        {selectedRows.size > 0 && (
          <div className="editor-bulk-toolbar">
            <strong>{selectedRows.size} satır seçildi</strong>
            <button onClick={() => bulkSetActive(true)}>Aktif yap</button>
            <button onClick={() => bulkSetActive(false)}>Pasif yap</button>
            <button
              className="danger"
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 size={14} /> Seçilenleri sil
            </button>
          </div>
        )}
        <div className="editor-table-wrap">
          <table className="editor-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) =>
                      selectVisibleRows(event.target.checked)
                    }
                    aria-label="Bu sayfadaki tüm satırları seç"
                  />
                </th>
                {visibleSystemColumns.has("id") && <th>id <span>otomatik</span></th>}
                {schema.columns.map((column) => (
                  <th key={column.id}>
                    {column.name}
                    <small>
                      {fieldTypeLabels[column.fieldType]}
                    </small>
                  </th>
                ))}
                {visibleSystemColumns.has("created_at") && <th>created_at</th>}
                {visibleSystemColumns.has("updated_at") && <th>updated_at</th>}
                <th>Durum</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                return (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={(event) =>
                          setSelectedRows((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })
                        }
                        aria-label={`${row.id} satırını seç`}
                      />
                    </td>
                    {visibleSystemColumns.has("id") && <td>
                      <code className="editor-readonly-id" title={row.id}>
                        {row.id.startsWith("draft-") ? "Otomatik" : row.id}
                      </code>
                    </td>}
                    {schema.columns.map((column) => (
                      <td key={column.id}>
                        <CellInput
                          value={row.data[String(column.id)] || ""}
                          column={column}
                          options={
                            options[column.referenceCategoryId || 0] || []
                          }
                          onChange={(value) =>
                            setCell(row.id, column.id, value)
                          }
                          onImage={(file, storage) => selectImage(row.id, column.id, file, storage)}
                        />
                      </td>
                    ))}
                    {visibleSystemColumns.has("created_at") && <td className="editor-date">{dateLabel(row.createdAt)}</td>}
                    {visibleSystemColumns.has("updated_at") && <td className="editor-date">{dateLabel(row.updatedAt)}</td>}
                    <td>
                      <button
                        className={`editor-row-toggle ${row.active ? "on" : ""}`}
                        onClick={() =>
                          change({
                            ...schema,
                            rows: schema.rows.map((item) =>
                              item.id === row.id
                                ? { ...item, active: !item.active }
                                : item,
                            ),
                          })
                        }
                      >
                        {row.active ? "Aktif" : "Kapalı"}
                      </button>
                    </td>
                    <td>
                      <button
                        className="editor-delete-row"
                        onClick={() =>
                          change({
                            ...schema,
                            rows: schema.rows.filter(
                              (item) => item.id !== row.id,
                            ),
                          })
                        }
                        aria-label="Satırı sil"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {schema.rows.length > 0 && !filteredRows.length && (
            <div className="editor-empty">Filtreye uygun kayıt bulunamadı.</div>
          )}
          {!schema.rows.length && (
            <div className="editor-empty">
              Henüz kayıt yok. İlk satırı ekleyin.
            </div>
          )}
        </div>
        <div className="editor-table-pagination">
          <span>
            {filteredRows.length
              ? `${(rowPage - 1) * rowPageSize + 1}–${Math.min(rowPage * rowPageSize, filteredRows.length)} / ${filteredRows.length} kayıt`
              : "0 kayıt"}
          </span>
          <div>
            <button
              disabled={rowPage <= 1}
              onClick={() => setRowPage((value) => Math.max(1, value - 1))}
            >
              Geri
            </button>
            <strong>
              {Math.min(rowPage, rowPages)} / {rowPages}
            </strong>
            <button
              disabled={rowPage >= rowPages}
              onClick={() =>
                setRowPage((value) => Math.min(rowPages, value + 1))
              }
            >
              İleri
            </button>
          </div>
        </div>
      </section>
      <div className="editor-save-bar">
        <div>
          {error ? (
            <span className="editor-error" role="alert">
              {error}
            </span>
          ) : saved ? (
            <span className="editor-saved">
              <Check size={16} /> Kaydedildi. Değişiklikler MySQL tablosuna
              yazıldı.
            </span>
          ) : dirty ? (
            <span>Kaydedilmemiş değişiklikler var.</span>
          ) : (
            <span>Tablo güncel.</span>
          )}
        </div>
        <button onClick={() => void save()} disabled={!dirty || saving || pendingImages > 0}>
          <Save size={17} />{" "}
          {pendingImages ? "Görsel yükleniyor…" : saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
        </button>
      </div>
      {confirmState && (
        <div
          className="editor-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmState(false);
          }}
        >
          <div
            className="editor-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-confirm-title"
          >
            <button
              className="editor-confirm-close"
              onClick={() => setConfirmState(false)}
              aria-label="Kapat"
            >
              <X size={18} />
            </button>
            <h3 id="editor-confirm-title">
              API'yi {schema.category.active ? "kapat" : "aç"}?
            </h3>
            <p>
              {schema.category.active
                ? "Bu kategorinin verileri API üzerinden erişilemez olacak."
                : "Bu kategorinin verileri yeniden API üzerinden erişilebilir olacak."}
            </p>
            <div>
              <button onClick={() => setConfirmState(false)}>Vazgeç</button>
              <button
                className={schema.category.active ? "danger" : "confirm"}
                onClick={() => void toggleCategory()}
              >
                {schema.category.active ? "Evet, kapat" : "Evet, aç"}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmBulkDelete && (
        <div
          className="editor-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setConfirmBulkDelete(false);
          }}
        >
          <div
            className="editor-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
          >
            <button
              className="editor-confirm-close"
              onClick={() => setConfirmBulkDelete(false)}
              aria-label="Kapat"
            >
              <X size={18} />
            </button>
            <h3 id="bulk-delete-title">
              {selectedRows.size} satır silinsin mi?
            </h3>
            <p>
              Bu işlem seçilen kayıtları siler. Değişikliği veritabanına
              uygulamak için ayrıca “Değişiklikleri kaydet” düğmesine basmanız
              gerekir.
            </p>
            <div>
              <button onClick={() => setConfirmBulkDelete(false)}>
                Vazgeç
              </button>
              <button className="danger" onClick={deleteSelectedRows}>
                Seçilen satırları sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CellInput({
  value,
  column,
  options,
  onChange,
  onImage,
}: {
  value: string;
  column: Column;
  options: { id: string; label: string; detail?: string }[];
  onChange: (value: string) => void;
  onImage: (file: File, storage: "upload" | "base64") => Promise<void>;
}) {
  if (column.fieldType === "relation")
    return <RelationPicker value={value} label={column.name} options={options} onChange={onChange} />;
  if (column.fieldType === "image" || column.fieldType === "image_upload" || column.fieldType === "image_base64")
    return <ImageCell value={value} label={column.name} fieldType={column.fieldType} onChange={onChange} onImage={onImage} />;
  if (column.fieldType === "boolean" || column.fieldType === "boolean_text")
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={column.name}
      >
        <option value="">Boş</option>
        <option value={column.fieldType === "boolean_text" ? "true" : "1"}>{column.fieldType === "boolean_text" ? "true" : "1"}</option>
        <option value={column.fieldType === "boolean_text" ? "false" : "0"}>{column.fieldType === "boolean_text" ? "false" : "0"}</option>
      </select>
    );
  return (
    <input
      type={column.fieldType === "date" ? "date" : "text"}
      inputMode={column.fieldType === "number" || column.fieldType === "float" ? "decimal" : column.fieldType === "integer" ? "numeric" : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={column.name}
      placeholder={column.fieldType === "text" ? "Değer girin" : undefined}
    />
  );
}

function RelationPicker({ value, label, options, onChange }: {
  value: string;
  label: string;
  options: { id: string; label: string; detail?: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find(option => option.id === value);
  const filtered = options.filter(option =>
    `${option.id} ${option.label} ${option.detail || ""}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <>
    <button type="button" className="editor-relation-trigger" role="combobox" aria-expanded={open} aria-label={label} onClick={() => { setQuery(""); setOpen(true); }}>
      {current ? <><strong>{current.label}</strong><small>#{current.id}</small></> : value ? `#${value}` : "Kayıt seçin"}
    </button>
    {open && <div className="editor-relation-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="editor-relation-dialog" role="dialog" aria-modal="true" aria-label={`${label} için ilişkili kayıt seç`}>
        <div className="editor-relation-head"><h3>{label} seç</h3><button type="button" onClick={() => setOpen(false)} aria-label="Kapat"><X size={18} /></button></div>
        <label className="editor-relation-search"><Search size={17} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="ID, ad veya bilgide ara" /></label>
        <div className="editor-relation-options" role="listbox">
          <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(""); setOpen(false); }}>İlişki yok</button>
          {filtered.map(option => <button type="button" role="option" aria-selected={value === option.id} key={option.id} onClick={() => { onChange(option.id); setOpen(false); }}><span className="editor-relation-id">#{option.id}</span><span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>{value === option.id && <Check size={16} />}</button>)}
          {!filtered.length && <p>Bu aramaya uygun kayıt yok.</p>}
        </div>
      </div>
    </div>}
  </>;
}

function ImageCell({ value, label, fieldType, onChange, onImage }: {
  value: string;
  label: string;
  fieldType: "image" | "image_upload" | "image_base64";
  onChange: (value: string) => void;
  onImage: (file: File, storage: "upload" | "base64") => Promise<void>;
}) {
  const [legacyStorage, setLegacyStorage] = useState<"upload" | "base64">("upload");
  const storage = fieldType === "image_upload" ? "upload" : fieldType === "image_base64" ? "base64" : legacyStorage;
  const [busy, setBusy] = useState(false);
  return <div className="editor-image-cell">
    {value && <img src={value} alt={label} />}
    {fieldType === "image" && <select value={legacyStorage} onChange={event => setLegacyStorage(event.target.value as typeof legacyStorage)} aria-label="Görsel depolama yöntemi"><option value="upload">Sunucuya yükle</option><option value="base64">Base64 sakla</option></select>}
    <label className="editor-image-picker"><ImagePlus size={15} />{busy ? "Yükleniyor…" : value ? "Değiştir" : "Görsel seç"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) { setBusy(true); void onImage(file, storage).finally(() => setBusy(false)); } event.target.value = ""; }} /></label>
    {value && <button type="button" className="editor-image-remove" onClick={() => onChange("")} aria-label="Görseli kaldır"><X size={14} /></button>}
  </div>;
}
