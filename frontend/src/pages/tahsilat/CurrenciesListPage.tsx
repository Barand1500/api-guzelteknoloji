import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { Check, Coins, Pencil, Plus, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
import "./binList.css";

type FormState = { name: string; shortName: string; symbol: string; active: boolean };
const emptyForm: FormState = { name: "", shortName: "", symbol: "", active: true };

type Props = { token: string };

/** Para Birimleri — MySQL */
export default function CurrenciesListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, "currencies");
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
      symbol: str(row, "symbol"),
      active: row.active !== false,
    });
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
    const shortName = form.shortName.trim().toUpperCase();
    const symbol = form.symbol.trim();
    if (!name) {
      setError("Ad gerekli.");
      return;
    }
    if (!shortName) {
      setError("Kısa ad gerekli.");
      return;
    }
    if (!symbol) {
      setError("Sembol gerekli.");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        str(r, "shortName").toLocaleLowerCase("tr-TR") === shortName.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu kısa ad zaten var.");
      return;
    }
    setBusy(true);
    try {
      await saveRow({
        id: editId || `new-${Date.now()}`,
        active: form.active,
        data: { name, shortName, symbol },
      });
      closeModal();
      setDbError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt veritabanına yazılamadı.");
    } finally {
      setBusy(false);
    }
  }

  const tableColumns: TahsilatTableColumn<TahsilatAdminRow>[] = [
    { id: "shortName", label: "Kısa Ad", mono: true, accessor: (r) => str(r, "shortName") },
    { id: "symbol", label: "Sembol", accessor: (r) => str(r, "symbol") },
    { id: "name", label: "Ad", accessor: (r) => str(r, "name") },
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
          <span className="bin-page-eyebrow">GENEL TANIMLAR</span>
          <h1>
            <Coins
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Para Birimleri
          </h1>
          <p>Para birimlerini görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
          <Plus size={18} />
          Yeni Para Birimi
        </button>
      </div>

      {dbError ? (
        <p className="bin-hint" style={{ color: "#be123c" }} role="alert">
          {dbError}
        </p>
      ) : null}

      <TahsilatDataTable
        rows={rows}
        columns={tableColumns}
        getRowId={(r) => r.id}
        storageKey="tahsilat-currencies"
        searchPlaceholder="Ad, kısa ad veya sembol ara…"
        loading={loading}
        emptyTitle="Henüz para birimi yok"
        emptyHint="İlk para birimini ekleyin veya Excel'den içe aktarın."
        exportFileName="para-birimleri"
        excelImport={{
          title: "Para birimi Excel içe aktar",
          templateFileName: "para-birimleri-sablon.xlsx",
          columns: [
            { key: "name", label: "Ad", required: true },
            { key: "shortName", label: "Kısa Ad", aliases: ["kod"], required: true },
            { key: "symbol", label: "Sembol", required: true },
          ],
          validateRow: (cells) => {
            if (!cells.name.trim()) return "Ad gerekli";
            if (!cells.shortName.trim()) return "Kısa ad gerekli";
            if (!cells.symbol.trim()) return "Sembol gerekli";
            return null;
          },
          mapRow: (cells, index) => ({
            id: `import-${Date.now()}-${index}`,
            active: true,
            data: {
              name: cells.name.trim(),
              shortName: cells.shortName.trim().toUpperCase(),
              symbol: cells.symbol.trim(),
            },
          }),
          onConfirm: async (imported) => {
            const existing = new Set(rows.map((r) => str(r, "shortName").toLocaleLowerCase("tr-TR")));
            const fresh = imported.filter(
              (r) => !existing.has(str(r, "shortName").toLocaleLowerCase("tr-TR")),
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
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true" style={{ width: "min(480px, 100%)" }}>
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "Para Birimi Düzenle" : "Yeni Para Birimi"}</h2>
                <p>Para birimi bilgilerini girin.</p>
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
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="bin-field-row">
                <div className="bin-field">
                  <label>
                    Kısa Ad <em>*</em>
                  </label>
                  <input
                    value={form.shortName}
                    onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                  />
                </div>
                <div className="bin-field">
                  <label>
                    Sembol <em>*</em>
                  </label>
                  <input
                    value={form.symbol}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                  />
                </div>
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Bu para birimi aktif olarak kullanılsın.</p>
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
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true" style={{ width: "min(400px, 100%)" }}>
            <div className="bin-modal-head">
              <div>
                <h2>Para birimi silinsin mi?</h2>
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
