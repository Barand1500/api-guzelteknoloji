import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Puzzle, Search, Trash2, X } from "lucide-react";
import {
  loadModules,
  moduleNameById,
  newModuleId,
  saveModules,
  slugifyCode,
  type ModuleRow,
} from "./modulesStore";
import "./binList.css";

type FormState = {
  name: string;
  code: string;
  icon: string;
  sortOrder: number;
  parentId: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  code: "",
  icon: "",
  sortOrder: 0,
  parentId: "",
  active: true,
};

/** Sistem → Modüller */
export default function ModulesListPage() {
  const [rows, setRows] = useState<ModuleRow[]>(loadModules);
  const [query, setQuery] = useState("");
  const [filterParentId, setFilterParentId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [codeTouched, setCodeTouched] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveModules(rows);
  }, [rows]);

  const anyModal = modalOpen || Boolean(deleteId);

  useEffect(() => {
    if (!anyModal) return;
    if (modalRef.current) {
      gsap.fromTo(
        modalRef.current,
        { autoAlpha: 0, y: 14, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.26, ease: "power2.out" },
      );
    }
  }, [anyModal, modalOpen, deleteId]);

  useEffect(() => {
    if (!anyModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalOpen(false);
        setDeleteId(null);
        setEditId(null);
        setError("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyModal]);

  const parentOptions = useMemo(
    () =>
      rows
        .filter((r) => r.id !== editId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [rows, editId],
  );

  const filterParents = useMemo(() => {
    const ids = new Set(rows.map((r) => r.parentId).filter(Boolean) as string[]);
    return rows
      .filter((r) => ids.has(r.id) || rows.some((c) => c.parentId === r.id))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((r) => {
        if (!filterParentId) return true;
        if (filterParentId === "__root__") return !r.parentId;
        return r.parentId === filterParentId;
      })
      .filter((r) => {
        if (!q) return true;
        const parent = moduleNameById(r.parentId, rows);
        return `${r.name} ${r.code} ${r.icon} ${parent}`.toLocaleLowerCase("tr-TR").includes(q);
      })
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, "tr");
      });
  }, [rows, query, filterParentId]);

  function openCreate() {
    setEditId(null);
    setForm({
      ...emptyForm,
      parentId: filterParentId && filterParentId !== "__root__" ? filterParentId : "",
      sortOrder: rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0,
    });
    setCodeTouched(false);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: ModuleRow) {
    setEditId(row.id);
    setForm({
      name: row.name,
      code: row.code,
      icon: row.icon,
      sortOrder: row.sortOrder,
      parentId: row.parentId || "",
      active: row.active,
    });
    setCodeTouched(true);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function onNameChange(value: string) {
    setForm((f) => ({
      ...f,
      name: value,
      code: !editId && !codeTouched ? slugifyCode(value) : f.code,
    }));
  }

  function onSave() {
    const name = form.name.trim();
    const code = form.code.trim();
    if (!name) {
      setError("Ad gerekli.");
      return;
    }
    if (!code) {
      setError("Kod gerekli.");
      return;
    }
    const parentId = form.parentId || null;
    if (parentId === editId) {
      setError("Modül kendi üstü olamaz.");
      return;
    }
    if (parentId && !rows.some((r) => r.id === parentId)) {
      setError("Üst modül bulunamadı.");
      return;
    }
    const dupCode = rows.some(
      (r) =>
        r.id !== editId && r.code.toLocaleLowerCase("tr-TR") === code.toLocaleLowerCase("tr-TR"),
    );
    if (dupCode) {
      setError("Bu kod zaten var.");
      return;
    }
    const next: ModuleRow = {
      id: editId || newModuleId(),
      name,
      code,
      icon: form.icon.trim(),
      sortOrder: Number.isFinite(form.sortOrder) ? form.sortOrder : 0,
      parentId,
      active: form.active,
    };
    setRows((prev) => (editId ? prev.map((r) => (r.id === editId ? next : r)) : [next, ...prev]));
    closeModal();
  }

  function confirmDelete() {
    if (!deleteId) return;
    const hasChildren = rows.some((r) => r.parentId === deleteId);
    if (hasChildren) {
      setError("Alt modülleri olan kayıt silinemez. Önce altları silin veya taşıyın.");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== deleteId));
    setDeleteId(null);
    setError("");
  }

  return (
    <div className="bin-page">
      <div className="bin-page-head">
        <div className="bin-page-head-copy">
          <span className="bin-page-eyebrow">SİSTEM</span>
          <h1>
            <Puzzle
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Modüller
          </h1>
          <p>Sistem modüllerini görüntüleyin ve yönetin</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          Yeni Modül
        </button>
      </div>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <div className="bin-toolbar-left">
            <label className="bin-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Modül ara…"
                aria-label="Modül ara"
              />
            </label>
            <select
              className="bin-filter-select"
              value={filterParentId}
              onChange={(e) => setFilterParentId(e.target.value)}
              aria-label="Üst modüle göre filtrele"
            >
              <option value="">Üst Modüle Göre Filtrele</option>
              <option value="__root__">Üst seviye (üst yok)</option>
              {filterParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>Üst Modül</th>
                  <th>Ad</th>
                  <th>Kod</th>
                  <th>İkon</th>
                  <th>Sıra</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.parentId ? moduleNameById(row.parentId, rows) || "—" : "—"}</td>
                    <td>{row.name}</td>
                    <td>
                      <code className="bin-code">{row.code}</code>
                    </td>
                    <td>{row.icon || "—"}</td>
                    <td>{row.sortOrder}</td>
                    <td>
                      <span className={`vpos-status ${row.active ? "on" : "off"}`}>
                        {row.active ? <Check size={14} strokeWidth={2.4} /> : null}
                        {row.active ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td>
                      <div className="bin-actions">
                        <button
                          type="button"
                          className="bin-icon-btn"
                          title="Düzenle"
                          aria-label="Düzenle"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="bin-icon-btn danger"
                          title="Sil"
                          aria-label="Sil"
                          onClick={() => {
                            setError("");
                            setDeleteId(row.id);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="bin-empty">
              <strong>{query || filterParentId ? "Eşleşen kayıt yok" : "Henüz modül yok"}</strong>
              <span>
                {query || filterParentId
                  ? "Filtreyi veya aramayı değiştirin."
                  : "Yeni Modül ile başlayın."}
              </span>
            </div>
          )}
        </div>
      </section>

      {modalOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div
            ref={modalRef}
            className="bin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mod-modal-title"
            style={{ width: "min(480px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="mod-modal-title">{editId ? "Modül Düzenle" : "Yeni Modül"}</h2>
                <p>Modül bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="mod-name">
                  Ad <em>*</em>
                </label>
                <input
                  id="mod-name"
                  value={form.name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Ad"
                  autoFocus
                />
              </div>
              <div className="bin-field">
                <label htmlFor="mod-code">
                  Kod <em>*</em>
                </label>
                <input
                  id="mod-code"
                  value={form.code}
                  onChange={(e) => {
                    setCodeTouched(true);
                    setForm((f) => ({ ...f, code: e.target.value }));
                  }}
                  placeholder="ornek_kod"
                />
              </div>
              <div className="bin-field-row">
                <div className="bin-field">
                  <label htmlFor="mod-icon">İkon</label>
                  <input
                    id="mod-icon"
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                    placeholder="Zap"
                  />
                </div>
                <div className="bin-field">
                  <label htmlFor="mod-order">Sıra</label>
                  <input
                    id="mod-order"
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="bin-field">
                <label htmlFor="mod-parent">Üst Modül</label>
                <select
                  id="mod-parent"
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Modülü aktif veya pasif yapın</p>
                </div>
                <button
                  type="button"
                  className={`vpos-switch ${form.active ? "on" : ""}`}
                  role="switch"
                  aria-checked={form.active}
                  aria-label="Aktif"
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                >
                  <span />
                </button>
              </div>
              {error ? (
                <span className="bin-modal-error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={onSave}>
                {editId ? "Güncelle" : "Kaydet"}
              </button>
              <button type="button" className="ghost" onClick={closeModal}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div className="bin-modal-overlay" role="presentation">
          <div
            ref={modalRef}
            className="bin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mod-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="mod-del-title">Modül silinsin mi?</h2>
                <p>Bu kayıt listeden kaldırılacak.</p>
              </div>
              <button
                type="button"
                className="bin-modal-close"
                onClick={() => {
                  setDeleteId(null);
                  setError("");
                }}
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>
            {error ? (
              <div className="bin-modal-body">
                <span className="bin-modal-error" role="alert">
                  {error}
                </span>
              </div>
            ) : null}
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={confirmDelete}>
                Sil
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDeleteId(null);
                  setError("");
                }}
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
