import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  channelLabel,
  loadTemplateVars,
  newTemplateVarId,
  parseVariableKeys,
  saveTemplateVars,
  type TemplateChannel,
  type TemplateVarGroup,
} from "./templateVarsStore";
import "./binList.css";

type FormState = {
  name: string;
  type: TemplateChannel | "";
  variablesText: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  type: "",
  variablesText: "",
  active: true,
};

/** Sistem → Şablon Değişkenleri */
export default function TemplateVarsListPage() {
  const [rows, setRows] = useState<TemplateVarGroup[]>(loadTemplateVars);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveTemplateVars(rows);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((r) => {
        if (!q) return true;
        const tip = channelLabel(r.type);
        const vars = r.variables.join(" ");
        return `${r.name} ${tip} ${vars}`.toLocaleLowerCase("tr-TR").includes(q);
      })
      .sort((a, b) => {
        const n = a.name.localeCompare(b.name, "tr");
        if (n !== 0) return n;
        return a.type.localeCompare(b.type);
      });
  }, [rows, query]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TemplateVarGroup) {
    setEditId(row.id);
    setForm({
      name: row.name,
      type: row.type,
      variablesText: row.variables.join(", "),
      active: row.active,
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function onSave() {
    const name = form.name.trim();
    if (!name) {
      setError("Ad gerekli.");
      return;
    }
    if (!form.type) {
      setError("Tip seçin.");
      return;
    }
    const variables = parseVariableKeys(form.variablesText);
    if (!variables.length) {
      setError("En az bir değişken girin (virgülle ayırın).");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        r.type === form.type &&
        r.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu ad ve tip kombinasyonu zaten var.");
      return;
    }
    const next: TemplateVarGroup = {
      id: editId || newTemplateVarId(),
      name,
      type: form.type,
      variables,
      active: form.active,
    };
    setRows((prev) => (editId ? prev.map((r) => (r.id === editId ? next : r)) : [next, ...prev]));
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
          <span className="bin-page-eyebrow">SİSTEM</span>
          <h1>
            <Braces
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Şablon Değişkenleri
          </h1>
          <p>E-posta ve SMS şablon değişkenlerini yönetin</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          Yeni Değişken Grubu
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
                placeholder="Grup veya değişken ara…"
                aria-label="Ara"
              />
            </label>
          </div>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table tpl-table">
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Tip</th>
                  <th>Değişkenler</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>
                      <span className={`tpl-type ${row.type}`}>
                        {channelLabel(row.type)}
                      </span>
                    </td>
                    <td>
                      <div className="tpl-vars">
                        {row.variables.map((v) => (
                          <code key={v} className="tpl-var">
                            {`{{${v}}}`}
                          </code>
                        ))}
                      </div>
                    </td>
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
              <strong>{query ? "Eşleşen kayıt yok" : "Henüz değişken grubu yok"}</strong>
              <span>
                {query ? "Aramayı değiştirin." : "Yeni Değişken Grubu ile başlayın."}
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
            aria-labelledby="tpl-modal-title"
            style={{ width: "min(480px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="tpl-modal-title">
                  {editId ? "Değişken Grubu Düzenle" : "Yeni Değişken Grubu"}
                </h2>
                <p>Şablon değişken grubu bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="tpl-name">
                  Ad <em>*</em>
                </label>
                <input
                  id="tpl-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ad"
                  autoFocus
                />
              </div>
              <div className="bin-field">
                <label htmlFor="tpl-type">
                  Tip <em>*</em>
                </label>
                <select
                  id="tpl-type"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as TemplateChannel | "" }))
                  }
                >
                  <option value="">Seçiniz</option>
                  <option value="email">E-Posta</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <div className="bin-field">
                <label htmlFor="tpl-vars">
                  Değişkenler <em>*</em>
                </label>
                <textarea
                  id="tpl-vars"
                  className="vpos-textarea"
                  rows={5}
                  value={form.variablesText}
                  onChange={(e) => setForm((f) => ({ ...f, variablesText: e.target.value }))}
                  placeholder="musteri_adi,tutar,tarih"
                />
                <small className="bank-logo-hint">
                  Virgülle ayırın. Örn: musteri_adi,tutar,tarih
                </small>
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Bu değişken grubu aktif olarak kullanılsın.</p>
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
            aria-labelledby="tpl-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="tpl-del-title">Grup silinsin mi?</h2>
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
