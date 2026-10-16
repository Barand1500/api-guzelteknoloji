import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { Award, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
import "./binList.css";

type FormState = { name: string; logoDataUrl: string };

const emptyForm: FormState = { name: "", logoDataUrl: "" };
const MAX_LOGO_BYTES = 3 * 1024 * 1024;

type Props = { token: string };

/** Kart Markaları — MySQL; BIN marka seçimi */
export default function CardBrandsListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, "card-brands");
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

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setForm({ name: str(row, "name"), logoDataUrl: str(row, "logo") });
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
      setError("Marka adı gerekli.");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        str(r, "name").toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu marka zaten var.");
      return;
    }
    const nextRow: TahsilatAdminRow = {
      id: editId || `new-${Date.now()}`,
      active: true,
      data: { name, logo: form.logoDataUrl },
    };
    setBusy(true);
    try {
      await saveRow(nextRow);
      closeModal();
      setDbError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt veritabanına yazılamadı.");
    } finally {
      setBusy(false);
    }
  }

  const tableColumns: TahsilatTableColumn<TahsilatAdminRow>[] = [
    {
      id: "logo",
      label: "Logo",
      filterable: false,
      accessor: () => "",
      render: (row) => (
        <span className="bank-logo-cell">
          {str(row, "logo") ? (
            <img src={str(row, "logo")} alt="" />
          ) : (
            <Award size={18} strokeWidth={1.7} />
          )}
        </span>
      ),
    },
    { id: "name", label: "Marka Adı", accessor: (r) => str(r, "name") },
    {
      id: "actions",
      label: "İşlemler",
      hideable: false,
      filterable: false,
      align: "right",
      accessor: () => "",
      render: (row) => (
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
      ),
    },
  ];

  async function confirmDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await removeRow(deleteId);
      setDeleteId(null);
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
          <span className="bin-page-eyebrow">KART YÖNETİMİ</span>
          <h1>
            <Award
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Kart Markaları
          </h1>
          <p>Kart markalarını görüntüleyin ve yönetin</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          Yeni Kart Markası
        </button>
      </div>

      <p className="bin-hint">Bu liste BIN formundaki Kart Markası seçimine yansır.</p>

      {dbError ? (
        <p className="bin-hint" style={{ color: "#be123c" }} role="alert">
          {dbError}
        </p>
      ) : null}

      <TahsilatDataTable
        rows={rows}
        columns={tableColumns}
        getRowId={(r) => r.id}
        storageKey="tahsilat-card-brands"
        searchPlaceholder="Marka adı ara…"
        loading={loading}
        emptyTitle="Henüz marka yok"
        emptyHint="İlk markayı ekleyin veya Excel'den içe aktarın."
        exportFileName="kart-markalari"
        excelImport={{
          title: "Kart markası Excel içe aktar",
          templateFileName: "kart-markalari-sablon.xlsx",
          columns: [{ key: "name", label: "Marka Adı", aliases: ["marka", "ad"], required: true }],
          validateRow: (cells) => (!cells.name.trim() ? "Marka adı gerekli" : null),
          mapRow: (cells, index) => ({
            id: `import-${Date.now()}-${index}`,
            active: true,
            data: { name: cells.name.trim(), logo: "" },
          }),
          onConfirm: async (imported) => {
            const existing = new Set(rows.map((r) => str(r, "name").toLocaleLowerCase("tr-TR")));
            const fresh = imported.filter(
              (r) => !existing.has(str(r, "name").toLocaleLowerCase("tr-TR")),
            );
            if (!fresh.length) {
              throw new Error("İçe aktarılacak yeni marka yok (hepsi zaten kayıtlı).");
            }
            await persistBulk(fresh);
            setDbError("");
          },
        }}
      />

      {modalOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div
            ref={modalRef}
            className="bin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="brand-modal-title"
            style={{ width: "min(480px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="brand-modal-title">{editId ? "Kart Markası Düzenle" : "Yeni Kart Markası"}</h2>
                <p>Kart markası bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="brand-name">
                  Marka Adı <em>*</em>
                </label>
                <input
                  id="brand-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Marka Adı"
                  autoFocus
                />
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
              {error ? (
                <span className="bin-modal-error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
                {busy ? "…" : editId ? "Güncelle" : "Kaydet"}
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
            aria-labelledby="brand-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="brand-del-title">Marka silinsin mi?</h2>
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
