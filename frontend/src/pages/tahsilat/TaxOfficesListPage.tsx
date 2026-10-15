import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import "./binList.css";

export type TaxOfficeRow = {
  id: string;
  name: string;
  active: boolean;
};

type FormState = { name: string; active: boolean };

const STORAGE_KEY = "gtk_tahsilat_tax_offices_v1";
const emptyForm: FormState = { name: "", active: true };

const SAMPLE: TaxOfficeRow[] = [
  { id: "to1", name: "100. Yıl İhtisas V.D.", active: true },
  { id: "to2", name: "19 Mayıs Ballıca V.D.", active: true },
  { id: "to3", name: "19 Mayıs V.D.", active: true },
  { id: "to4", name: "23 Temmuz V.D.", active: true },
  { id: "to5", name: "5 Ocak V.D.", active: true },
  { id: "to6", name: "Çankaya V.D.", active: true },
  { id: "to7", name: "Kadıköy V.D.", active: true },
];

function loadRows(): TaxOfficeRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw as TaxOfficeRow[];
  } catch {
    /* örnek */
  }
  return SAMPLE.map((r) => ({ ...r }));
}

function uid() {
  return `tax-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Vergi Daireleri — Genel Tanımlar */
export default function TaxOfficesListPage() {
  const [rows, setRows] = useState<TaxOfficeRow[]>(loadRows);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

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
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TaxOfficeRow) {
    setEditId(row.id);
    setForm({ name: row.name, active: row.active });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function save() {
    const name = form.name.trim();
    if (!name) {
      setError("Vergi dairesi adı gerekli.");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        r.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu vergi dairesi zaten var.");
      return;
    }
    const next: TaxOfficeRow = {
      id: editId || uid(),
      name,
      active: form.active,
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
          <span className="bin-page-eyebrow">GENEL TANIMLAR</span>
          <h1>
            <Building2
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Vergi Daireleri
          </h1>
          <p>Vergi dairelerini görüntüleyin ve yönetin</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          Yeni Vergi Dairesi
        </button>
      </div>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <label className="bin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Vergi dairesi ara…"
              aria-label="Vergi dairesi ara"
            />
          </label>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>Vergi Dairesi</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
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
              <strong>{query ? "Eşleşen kayıt yok" : "Henüz vergi dairesi yok"}</strong>
              <span>{query ? "Aramayı değiştirin." : "İlk vergi dairesini ekleyin."}</span>
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
            aria-labelledby="tax-modal-title"
            style={{ width: "min(440px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="tax-modal-title">{editId ? "Vergi Dairesi Düzenle" : "Yeni Vergi Dairesi"}</h2>
                <p>Vergi dairesi bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="tax-name">
                  Ad <em>*</em>
                </label>
                <input
                  id="tax-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ad"
                  autoFocus
                />
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Bu vergi dairesi aktif olarak kullanılsın.</p>
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
              <button type="button" className="primary" onClick={save}>
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
            aria-labelledby="tax-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="tax-del-title">Vergi dairesi silinsin mi?</h2>
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
