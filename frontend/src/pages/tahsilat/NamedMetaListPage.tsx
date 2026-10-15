import gsap from "gsap";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { newMetaId, type NamedMetaRow } from "./cardMetaStore";
import "./binList.css";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  titleIcon: ReactNode;
  addLabel: string;
  columnLabel: string;
  modalCreateTitle: string;
  modalEditTitle: string;
  modalHint: string;
  fieldLabel: string;
  load: () => NamedMetaRow[];
  save: (rows: NamedMetaRow[]) => void;
  idPrefix: string;
};

/** Kart tipi / tür / marka gibi tek-alanlı listeler */
export default function NamedMetaListPage({
  eyebrow,
  title,
  subtitle,
  titleIcon,
  addLabel,
  columnLabel,
  modalCreateTitle,
  modalEditTitle,
  modalHint,
  fieldLabel,
  load,
  save,
  idPrefix,
}: Props) {
  const [rows, setRows] = useState<NamedMetaRow[]>(load);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    save(rows);
  }, [rows, save]);

  useEffect(() => {
    if (!modalOpen && !deleteId) return;
    if (modalRef.current) {
      gsap.fromTo(
        modalRef.current,
        { autoAlpha: 0, y: 14, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.26, ease: "power2.out" },
      );
    }
  }, [modalOpen, deleteId]);

  useEffect(() => {
    if (!modalOpen && !deleteId) return;
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
  }, [modalOpen, deleteId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) => r.name.toLocaleLowerCase("tr-TR").includes(q));
  }, [rows, query]);

  function openCreate() {
    setEditId(null);
    setName("");
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: NamedMetaRow) {
    setEditId(row.id);
    setName(row.name);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function onSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(`${fieldLabel} gerekli.`);
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        r.name.toLocaleLowerCase("tr-TR") === trimmed.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu ad zaten var.");
      return;
    }
    const next: NamedMetaRow = {
      id: editId || newMetaId(idPrefix),
      name: trimmed,
    };
    setRows((prev) =>
      editId ? prev.map((r) => (r.id === editId ? next : r)) : [next, ...prev],
    );
    closeModal();
  }

  function confirmDelete() {
    if (!deleteId) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteId));
    setDeleteId(null);
  }

  return (
    <div className="bin-page">
      <div className="bin-page-head">
        <div className="bin-page-head-copy">
          <span className="bin-page-eyebrow">{eyebrow}</span>
          <h1>
            <span style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}>{titleIcon}</span>
            {title}
          </h1>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          {addLabel}
        </button>
      </div>

      <p className="bin-hint">Bu liste BIN formundaki ilgili seçime yansır.</p>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <label className="bin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`${columnLabel} ara…`}
              aria-label={`${columnLabel} ara`}
            />
          </label>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>{columnLabel}</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
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
                          onClick={() => setDeleteId(row.id)}
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
              <strong>{query ? "Eşleşen kayıt yok" : "Henüz kayıt yok"}</strong>
              <span>{query ? "Aramayı değiştirin." : "İlk kaydı ekleyin."}</span>
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
            aria-labelledby="meta-modal-title"
            style={{ width: "min(420px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="meta-modal-title">{editId ? modalEditTitle : modalCreateTitle}</h2>
                <p>{modalHint}</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="meta-name">
                  {fieldLabel} <em>*</em>
                </label>
                <input
                  id="meta-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={fieldLabel}
                  autoFocus
                />
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
            aria-labelledby="meta-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="meta-del-title">Kayıt silinsin mi?</h2>
                <p>Bu kayıt listeden kaldırılacak.</p>
              </div>
              <button
                type="button"
                className="bin-modal-close"
                onClick={() => setDeleteId(null)}
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={confirmDelete}>
                Sil
              </button>
              <button type="button" className="ghost" onClick={() => setDeleteId(null)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
