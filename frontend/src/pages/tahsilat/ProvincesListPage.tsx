import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  loadProvinces,
  newGeoId,
  saveProvinces,
  type ProvinceRow,
} from "./geoStore";
import "./binList.css";

type FormState = { name: string; plateCode: string; active: boolean };
const emptyForm: FormState = { name: "", plateCode: "", active: true };

/** İller — Coğrafi Veriler */
export default function ProvincesListPage() {
  const [rows, setRows] = useState<ProvinceRow[]>(loadProvinces);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveProvinces(rows);
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
    return rows.filter((r) =>
      `${r.name} ${r.plateCode}`.toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [rows, query]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: ProvinceRow) {
    setEditId(row.id);
    setForm({ name: row.name, plateCode: row.plateCode, active: row.active });
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
    const plateCode = form.plateCode.replace(/\D/g, "").slice(0, 2);
    if (!name) {
      setError("İl adı gerekli.");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        r.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu il zaten var.");
      return;
    }
    const next: ProvinceRow = {
      id: editId || newGeoId("prov"),
      name,
      plateCode,
      active: form.active,
    };
    setRows((prev) => {
      const list = editId
        ? prev.map((r) => (r.id === editId ? next : r))
        : [next, ...prev];
      return list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    });
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
          <span className="bin-page-eyebrow">COĞRAFİ VERİLER</span>
          <h1>
            <MapPin
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            İller
          </h1>
          <p>Tanımlı illeri görüntüleyin ve yönetin</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          Yeni İl
        </button>
      </div>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <label className="bin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İl adı veya plaka ara…"
              aria-label="İl ara"
            />
          </label>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>Plaka</th>
                  <th>İl Adı</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="bin-mono">{row.plateCode || "—"}</td>
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
              <strong>{query ? "Eşleşen kayıt yok" : "Henüz il yok"}</strong>
              <span>{query ? "Aramayı değiştirin." : "İlk ili ekleyin."}</span>
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
            aria-labelledby="prov-modal-title"
            style={{ width: "min(440px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="prov-modal-title">{editId ? "İl Düzenle" : "Yeni İl"}</h2>
                <p>İl bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="prov-name">
                  İl Adı <em>*</em>
                </label>
                <input
                  id="prov-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="İl Adı"
                  autoFocus
                />
              </div>
              <div className="bin-field">
                <label htmlFor="prov-plate">Plaka Kodu</label>
                <input
                  id="prov-plate"
                  inputMode="numeric"
                  value={form.plateCode}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      plateCode: e.target.value.replace(/\D/g, "").slice(0, 2),
                    }))
                  }
                  placeholder="Plaka Kodu"
                />
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Bu il aktif olarak listelensin.</p>
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
            aria-labelledby="prov-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="prov-del-title">İl silinsin mi?</h2>
                <p>Bu kayıt listeden kaldırılacak. Bağlı ilçeler etkilenmez (şimdilik).</p>
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
