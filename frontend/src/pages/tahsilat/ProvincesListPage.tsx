import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
import "./binList.css";

type FormState = { name: string; plateCode: string; active: boolean };
const emptyForm: FormState = { name: "", plateCode: "", active: true };

type Props = { token: string };

/** İller — MySQL /v1/tahsilat/provinces */
export default function ProvincesListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, "provinces");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
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

  const tableRows = useMemo(
    () => rows.slice().sort((a, b) => str(a, "name").localeCompare(str(b, "name"), "tr")),
    [rows],
  );

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setForm({ name: str(row, "name"), plateCode: str(row, "plateCode"), active: row.active !== false });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  async function onSave() {
    const name = form.name.trim();
    if (!name) {
      setError("İl adı gerekli.");
      return;
    }
    const nextRow: TahsilatAdminRow = {
      id: editId || `new-${Date.now()}`,
      active: form.active,
      data: { name, plateCode: form.plateCode.trim() },
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
    { id: "name", label: "İl Adı", accessor: (r) => str(r, "name") },
    { id: "plateCode", label: "Plaka", mono: true, accessor: (r) => str(r, "plateCode") || "—" },
    {
      id: "status",
      label: "Durum",
      accessor: (r) => (r.active !== false ? "Aktif" : "Pasif"),
      render: (row) => (
        <span className={`vpos-status ${row.active !== false ? "on" : "off"}`}>
          {row.active !== false ? <Check size={14} strokeWidth={2.4} /> : null}
          {row.active !== false ? "Aktif" : "Pasif"}
        </span>
      ),
    },
    {
      id: "actions",
      label: "İşlemler",
      hideable: false,
      filterable: false,
      align: "right",
      accessor: () => "",
      render: (row) => (
        <div className="bin-actions">
          <button type="button" className="bin-icon-btn" onClick={() => openEdit(row)}>
            <Pencil size={16} />
          </button>
          <button type="button" className="bin-icon-btn danger" onClick={() => setDeleteId(row.id)}>
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
          <span className="bin-page-eyebrow">COĞRAFİ VERİLER</span>
          <h1>
            <MapPin
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            İller
          </h1>
          <p>Tanımlı illeri görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
          <Plus size={18} />
          Yeni İl
        </button>
      </div>

      <p className="bin-hint">
        MySQL — AnyPay <code>/v1/tahsilat/provinces</code>
      </p>

      {dbError ? (
        <p className="bin-hint" style={{ color: "#be123c" }} role="alert">
          {dbError}
        </p>
      ) : null}

      <TahsilatDataTable
        rows={tableRows}
        columns={tableColumns}
        getRowId={(r) => r.id}
        storageKey="tahsilat-provinces"
        searchPlaceholder="İl veya plaka ara…"
        loading={loading}
        emptyTitle="Henüz il yok"
        emptyHint="İlk ili ekleyin veya Excel'den içe aktarın."
        exportFileName="iller"
        excelImport={{
          title: "İl Excel içe aktar",
          templateFileName: "iller-sablon.xlsx",
          columns: [
            { key: "name", label: "İl Adı", aliases: ["il"], required: true },
            { key: "plateCode", label: "Plaka", aliases: ["plaka kodu"] },
          ],
          validateRow: (cells) => (!cells.name.trim() ? "İl adı gerekli" : null),
          mapRow: (cells, index) => ({
            id: `import-${Date.now()}-${index}`,
            active: true,
            data: { name: cells.name.trim(), plateCode: cells.plateCode.replace(/\D/g, "").slice(0, 2) },
          }),
          onConfirm: async (imported) => {
            const existing = new Set(rows.map((r) => str(r, "name").toLocaleLowerCase("tr-TR")));
            const fresh = imported.filter(
              (r) => !existing.has(str(r, "name").toLocaleLowerCase("tr-TR")),
            );
            if (!fresh.length) {
              throw new Error("İçe aktarılacak yeni il yok (hepsi zaten kayıtlı).");
            }
            await persistBulk(fresh);
            setDbError("");
          },
        }}
      />

      {modalOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true">
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "İl Düzenle" : "Yeni İl"}</h2>
                <p>İl bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label>
                  İl Adı <em>*</em>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="bin-field">
                <label>Plaka</label>
                <input
                  value={form.plateCode}
                  onChange={(e) => setForm((f) => ({ ...f, plateCode: e.target.value }))}
                />
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Bu il listelensin.</p>
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
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true">
            <div className="bin-modal-head">
              <div>
                <h2>İl silinsin mi?</h2>
                <p>Veritabanından kaldırılacak.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={() => setDeleteId(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={() => void confirmDelete()} disabled={busy}>
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
