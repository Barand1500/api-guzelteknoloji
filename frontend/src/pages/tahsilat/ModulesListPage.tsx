import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Puzzle, Search, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { slugifyCode } from "./modulesStore";
import { str, useTahsilatDb } from "./useTahsilatDb";
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

type Props = { token: string };

function parentNameOf(row: TahsilatAdminRow, rows: TahsilatAdminRow[]) {
  const pid = str(row, "parentId");
  if (!pid) return "";
  const parent = rows.find((r) => r.id === pid);
  return parent ? str(parent, "name") : str(row, "parentName");
}

/** Sistem → Modüller — MySQL */
export default function ModulesListPage({ token }: Props) {
  const { rows, loading, saveRow, removeRow } = useTahsilatDb(token, "modules");
  const [query, setQuery] = useState("");
  const [filterParentId, setFilterParentId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

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
        .sort((a, b) => str(a, "name").localeCompare(str(b, "name"), "tr")),
    [rows, editId],
  );

  const filterParents = useMemo(() => {
    const ids = new Set(rows.map((r) => str(r, "parentId")).filter(Boolean));
    return rows
      .filter((r) => ids.has(r.id) || rows.some((c) => str(c, "parentId") === r.id))
      .sort((a, b) => str(a, "name").localeCompare(str(b, "name"), "tr"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((r) => {
        const parentId = str(r, "parentId");
        if (!filterParentId) return true;
        if (filterParentId === "__root__") return !parentId;
        return parentId === filterParentId;
      })
      .filter((r) => {
        if (!q) return true;
        const parent = parentNameOf(r, rows);
        return `${str(r, "name")} ${str(r, "code")} ${str(r, "icon")} ${parent}`
          .toLocaleLowerCase("tr-TR")
          .includes(q);
      })
      .sort((a, b) => {
        const ao = Number(a.data.sortOrder) || 0;
        const bo = Number(b.data.sortOrder) || 0;
        if (ao !== bo) return ao - bo;
        return str(a, "name").localeCompare(str(b, "name"), "tr");
      });
  }, [rows, query, filterParentId]);

  function openCreate() {
    setEditId(null);
    setForm({
      ...emptyForm,
      parentId: filterParentId && filterParentId !== "__root__" ? filterParentId : "",
      sortOrder: rows.length
        ? Math.max(...rows.map((r) => Number(r.data.sortOrder) || 0)) + 1
        : 0,
    });
    setCodeTouched(false);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setForm({
      name: str(row, "name"),
      code: str(row, "code"),
      icon: str(row, "icon"),
      sortOrder: Number(row.data.sortOrder) || 0,
      parentId: str(row, "parentId"),
      active: row.active !== false,
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

  async function onSave() {
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
    const parentId = form.parentId || "";
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
        r.id !== editId &&
        str(r, "code").toLocaleLowerCase("tr-TR") === code.toLocaleLowerCase("tr-TR"),
    );
    if (dupCode) {
      setError("Bu kod zaten var.");
      return;
    }
    const parent = rows.find((r) => r.id === parentId);
    setBusy(true);
    try {
      await saveRow({
        id: editId || `new-${Date.now()}`,
        active: form.active,
        data: {
          name,
          code,
          icon: form.icon.trim(),
          sortOrder: Number.isFinite(form.sortOrder) ? form.sortOrder : 0,
          parentId,
          parentName: parent ? str(parent, "name") : "",
        },
      });
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt veritabanına yazılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const hasChildren = rows.some((r) => str(r, "parentId") === deleteId);
    if (hasChildren) {
      setError("Alt modülleri olan kayıt silinemez. Önce altları silin veya taşıyın.");
      return;
    }
    setBusy(true);
    try {
      await removeRow(deleteId);
      setDeleteId(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme başarısız.");
    } finally {
      setBusy(false);
    }
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
          <p>Sistem modüllerini görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
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
                  {str(p, "name")}
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
                    <td>{parentNameOf(row, rows) || "—"}</td>
                    <td>{str(row, "name")}</td>
                    <td>
                      <code className="bin-code">{str(row, "code")}</code>
                    </td>
                    <td>{str(row, "icon") || "—"}</td>
                    <td>{Number(row.data.sortOrder) || 0}</td>
                    <td>
                      <span className={`vpos-status ${row.active !== false ? "on" : "off"}`}>
                        {row.active !== false ? <Check size={14} strokeWidth={2.4} /> : null}
                        {row.active !== false ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td>
                      <div className="bin-actions">
                        <button type="button" className="bin-icon-btn" onClick={() => openEdit(row)}>
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="bin-icon-btn danger"
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
              <strong>
                {loading ? "Yükleniyor…" : query || filterParentId ? "Eşleşen kayıt yok" : "Henüz modül yok"}
              </strong>
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
            style={{ width: "min(480px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "Modül Düzenle" : "Yeni Modül"}</h2>
                <p>Modül bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label>
                  Ad <em>*</em>
                </label>
                <input value={form.name} onChange={(e) => onNameChange(e.target.value)} autoFocus />
              </div>
              <div className="bin-field">
                <label>
                  Kod <em>*</em>
                </label>
                <input
                  value={form.code}
                  onChange={(e) => {
                    setCodeTouched(true);
                    setForm((f) => ({ ...f, code: e.target.value }));
                  }}
                />
              </div>
              <div className="bin-field-row">
                <div className="bin-field">
                  <label>İkon</label>
                  <input
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  />
                </div>
                <div className="bin-field">
                  <label>Sıra</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="bin-field">
                <label>Üst Modül</label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {str(p, "name")}
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
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                >
                  <span />
                </button>
              </div>
              {error ? <span className="bin-modal-error">{error}</span> : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={() => void onSave()} disabled={busy}>
                Kaydet
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
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2>Modül silinsin mi?</h2>
                <p>Veritabanından kaldırılacak.</p>
              </div>
              <button
                type="button"
                className="bin-modal-close"
                onClick={() => {
                  setDeleteId(null);
                  setError("");
                }}
              >
                <X size={18} />
              </button>
            </div>
            {error ? (
              <div className="bin-modal-body">
                <span className="bin-modal-error">{error}</span>
              </div>
            ) : null}
            <div className="bin-modal-foot">
              <button
                type="button"
                className="primary"
                onClick={() => void confirmDelete()}
                disabled={busy}
              >
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
