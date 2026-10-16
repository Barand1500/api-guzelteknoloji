import gsap from "gsap";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow, TahsilatResource } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
import "./binList.css";

type Props = {
  token: string;
  resource: TahsilatResource;
  storageKey: string;
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
  searchPlaceholder?: string;
  exportFileName?: string;
};

/** Kart tipi / tür / marka — MySQL */
export default function NamedMetaListPage({
  token,
  resource,
  storageKey,
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
  searchPlaceholder,
  exportFileName,
}: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, resource);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

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
    setName("");
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setName(str(row, "name"));
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  async function onSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(`${fieldLabel} gerekli.`);
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        str(r, "name").toLocaleLowerCase("tr-TR") === trimmed.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu ad zaten var.");
      return;
    }
    const nextRow: TahsilatAdminRow = {
      id: editId || `new-${Date.now()}`,
      active: true,
      data: { name: trimmed },
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

  const tableColumns: TahsilatTableColumn<TahsilatAdminRow>[] = [
    { id: "name", label: columnLabel, accessor: (r) => str(r, "name") },
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

  const exportBase = exportFileName || resource;

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
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading || saving}>
          <Plus size={18} />
          {addLabel}
        </button>
      </div>

      <p className="bin-hint">
        Merkez DB — AnyPay anahtar açıkken <code>/v1/tahsilat/{resource}</code> ile çeker.
      </p>
      {loading ? <p className="bin-hint">Yükleniyor…</p> : null}
      {dbError ? (
        <p className="bin-hint" style={{ color: "#be123c" }} role="alert">
          {dbError}
        </p>
      ) : null}

      <TahsilatDataTable
        rows={rows}
        columns={tableColumns}
        getRowId={(r) => r.id}
        storageKey={storageKey}
        searchPlaceholder={searchPlaceholder || `${columnLabel} ara…`}
        loading={loading}
        emptyTitle="Henüz kayıt yok"
        emptyHint="İlk kaydı ekleyin veya Excel'den içe aktarın."
        exportFileName={exportBase}
        excelImport={{
          title: `${columnLabel} Excel içe aktar`,
          templateFileName: `${exportBase}-sablon.xlsx`,
          columns: [
            { key: "name", label: fieldLabel, aliases: ["ad", "isim", columnLabel.toLowerCase()], required: true },
          ],
          validateRow: (cells) => (!cells.name.trim() ? `${fieldLabel} gerekli` : null),
          mapRow: (cells, index) => ({
            id: `import-${Date.now()}-${index}`,
            active: true,
            data: { name: cells.name.trim() },
          }),
          onConfirm: async (imported) => {
            const existing = new Set(rows.map((r) => str(r, "name").toLocaleLowerCase("tr-TR")));
            const fresh = imported.filter(
              (r) => !existing.has(str(r, "name").toLocaleLowerCase("tr-TR")),
            );
            if (!fresh.length) {
              throw new Error("İçe aktarılacak yeni kayıt yok (hepsi zaten kayıtlı).");
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
              <button type="button" className="primary" onClick={() => void onSave()} disabled={busy}>
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
            aria-labelledby="meta-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="meta-del-title">Kayıt silinsin mi?</h2>
                <p>Bu kayıt veritabanından kaldırılacak.</p>
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
