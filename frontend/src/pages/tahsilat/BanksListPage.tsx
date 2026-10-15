import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import "./binList.css";

type FormState = {
  name: string;
  shortName: string;
  logoDataUrl: string;
  gateway3dsUrl: string;
  apiUrl: string;
  xmlUrl: string;
};

const emptyForm: FormState = {
  name: "",
  shortName: "",
  logoDataUrl: "",
  gateway3dsUrl: "",
  apiUrl: "",
  xmlUrl: "",
};

const MAX_LOGO_BYTES = 3 * 1024 * 1024;

type Props = { token: string };

/** Bankalar — MySQL; BIN seçimi + AnyPay /v1/tahsilat/banks */
export default function BanksListPage({ token }: Props) {
  const { rows, loading, saveRow, removeRow } = useTahsilatDb(token, "banks");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      `${str(r, "name")} ${str(r, "shortName")}`.toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [rows, query]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setForm({
      name: str(row, "name"),
      shortName: str(row, "shortName"),
      logoDataUrl: str(row, "logo"),
      gateway3dsUrl: str(row, "gateway3dsUrl"),
      apiUrl: str(row, "apiUrl"),
      xmlUrl: str(row, "xmlUrl"),
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function onLogoFile(file: File | null) {
    if (!file) return;
    const okType =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      file.type === "image/svg+xml" ||
      /\.(png|jpe?g|svg)$/i.test(file.name);
    if (!okType) {
      setError("Logo PNG, JPG veya SVG olmalı.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo en fazla 3 MB olabilir.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, logoDataUrl: String(reader.result || "") }));
      setError("");
    };
    reader.onerror = () => setError("Logo okunamadı.");
    reader.readAsDataURL(file);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) {
      setError("Banka adı gerekli.");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        str(r, "name").toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu banka adı zaten var.");
      return;
    }
    const nextRow: TahsilatAdminRow = {
      id: editId || `new-${Date.now()}`,
      active: true,
      data: {
        name,
        shortName: form.shortName.trim(),
        logo: form.logoDataUrl,
        gateway3dsUrl: form.gateway3dsUrl.trim(),
        apiUrl: form.apiUrl.trim(),
        xmlUrl: form.xmlUrl.trim(),
      },
    };
    setBusy(true);
    try {
      await saveRow(nextRow);
      closeModal();
    } catch {
      setError("Kayıt veritabanına yazılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await removeRow(deleteId);
      setDeleteId(null);
    } catch {
      setError("Silme başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bin-page">
      <div className="bin-page-head">
        <div className="bin-page-head-copy">
          <span className="bin-page-eyebrow">ÖDEME ALTYAPISI</span>
          <h1>
            <Building2
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Bankalar
          </h1>
          <p>Tanımlı bankaları görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
          <Plus size={18} />
          Yeni Banka
        </button>
      </div>

      <p className="bin-hint">
        MySQL — AnyPay <code>/v1/tahsilat/banks</code>; BIN formundaki Banka seçimi buradan.
      </p>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <label className="bin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Banka adı veya kısa ad ara…"
              aria-label="Banka ara"
            />
          </label>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th style={{ width: 72 }}>Logo</th>
                  <th>Banka Adı</th>
                  <th>Kısa Ad</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="bank-logo-cell">
                        {str(row, "logo") ? (
                          <img src={str(row, "logo")} alt="" />
                        ) : (
                          <Building2 size={18} strokeWidth={1.7} />
                        )}
                      </span>
                    </td>
                    <td>{str(row, "name")}</td>
                    <td>{str(row, "shortName") || "—"}</td>
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
              <strong>{query ? "Eşleşen banka yok" : "Henüz banka yok"}</strong>
              <span>{query ? "Aramayı değiştirin." : "İlk bankayı ekleyin."}</span>
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
            aria-labelledby="bank-modal-title"
            style={{ width: "min(560px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="bank-modal-title">{editId ? "Banka Düzenle" : "Yeni Banka"}</h2>
                <p>Banka bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field-row">
                <div className="bin-field">
                  <label htmlFor="bank-name">
                    Banka Adı <em>*</em>
                  </label>
                  <input
                    id="bank-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Banka Adı"
                    autoFocus
                  />
                </div>
                <div className="bin-field">
                  <label htmlFor="bank-short">Kısa Ad</label>
                  <input
                    id="bank-short"
                    value={form.shortName}
                    onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                    placeholder="Kısa Ad"
                  />
                </div>
              </div>

              <div className="bin-field">
                <label>Logo</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg"
                  hidden
                  onChange={(e) => onLogoFile(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className="bank-logo-drop"
                  onClick={() => fileRef.current?.click()}
                >
                  {form.logoDataUrl ? (
                    <img src={form.logoDataUrl} alt="Logo önizleme" />
                  ) : (
                    <>
                      <ImagePlus size={22} />
                      <span>Görsel seçmek için tıklayın</span>
                    </>
                  )}
                </button>
                <small className="bank-logo-hint">PNG, JPG, SVG — max 3 MB</small>
                {form.logoDataUrl ? (
                  <button
                    type="button"
                    className="bank-logo-clear"
                    onClick={() => setForm((f) => ({ ...f, logoDataUrl: "" }))}
                  >
                    Logoyu kaldır
                  </button>
                ) : null}
              </div>

              <div className="bin-field">
                <label htmlFor="bank-3ds">3DS Gateway URL</label>
                <input
                  id="bank-3ds"
                  value={form.gateway3dsUrl}
                  onChange={(e) => setForm((f) => ({ ...f, gateway3dsUrl: e.target.value }))}
                  placeholder="3DS Gateway URL"
                />
              </div>
              <div className="bin-field">
                <label htmlFor="bank-api">API URL</label>
                <input
                  id="bank-api"
                  value={form.apiUrl}
                  onChange={(e) => setForm((f) => ({ ...f, apiUrl: e.target.value }))}
                  placeholder="API URL"
                />
              </div>
              <div className="bin-field">
                <label htmlFor="bank-xml">XML Servis URL</label>
                <input
                  id="bank-xml"
                  value={form.xmlUrl}
                  onChange={(e) => setForm((f) => ({ ...f, xmlUrl: e.target.value }))}
                  placeholder="XML Servis URL"
                />
              </div>

              {error ? (
                <span className="bin-modal-error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
                {busy ? "Kaydediliyor…" : "Kaydet"}
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
            aria-labelledby="bank-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="bank-del-title">Banka silinsin mi?</h2>
                <p>Bu kayıt listeden kaldırılacak. BIN kayıtları silinmez.</p>
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
              <button
                type="button"
                className="primary"
                onClick={() => void confirmDelete()}
                disabled={busy}
              >
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
