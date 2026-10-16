import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { Building2, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
import "./binList.css";

type FormState = { name: string; code: string; city: string; district: string; active: boolean };
const emptyForm: FormState = { name: "", code: "", city: "", district: "", active: true };

type Props = { token: string };

function rowCity(row: TahsilatAdminRow) {
  return str(row, "city") || str(row, "province");
}

/** Vergi Daireleri — MySQL (AnyPay: name / city / district) */
export default function TaxOfficesListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, "tax-offices");
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
      code: str(row, "code"),
      city: rowCity(row),
      district: str(row, "district"),
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
    const city = form.city.trim();
    const district = form.district.trim();
    const code = form.code.trim();
    if (!name) {
      setError("Vergi dairesi adı gerekli.");
      return;
    }
    if (!city) {
      setError("İl gerekli.");
      return;
    }
    if (!district) {
      setError("İlçe gerekli.");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        str(r, "name").toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu vergi dairesi zaten var.");
      return;
    }
    setBusy(true);
    try {
      await saveRow({
        id: editId || `new-${Date.now()}`,
        active: form.active,
        // province = city: eski AnyPay mapping / province kolonlu satırlar
        data: { name, code, city, district, province: city },
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
    { id: "name", label: "Vergi Dairesi", accessor: (r) => str(r, "name") },
    { id: "city", label: "İl", accessor: (r) => rowCity(r) || "—" },
    { id: "district", label: "İlçe", accessor: (r) => str(r, "district") || "—" },
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
            <Building2
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Vergi Daireleri
          </h1>
          <p>Vergi dairelerini görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
          <Plus size={18} />
          Yeni Vergi Dairesi
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
        storageKey="tahsilat-tax-offices"
        searchPlaceholder="Vergi dairesi, il veya ilçe ara…"
        loading={loading}
        emptyTitle="Henüz vergi dairesi yok"
        emptyHint="İlk kaydı ekleyin veya Excel'den içe aktarın."
        exportFileName="vergi-daireleri"
        excelImport={{
          title: "Vergi dairesi Excel içe aktar",
          templateFileName: "vergi-daireleri-sablon.xlsx",
          columns: [
            { key: "name", label: "Vergi Dairesi", required: true },
            { key: "city", label: "İl", aliases: ["il", "province"], required: true },
            { key: "district", label: "İlçe", required: true },
            { key: "code", label: "Kod" },
          ],
          validateRow: (cells) => {
            if (!cells.name.trim()) return "Vergi dairesi adı gerekli";
            if (!cells.city.trim()) return "İl gerekli";
            if (!cells.district.trim()) return "İlçe gerekli";
            return null;
          },
          mapRow: (cells, index) => {
            const city = cells.city.trim();
            return {
              id: `import-${Date.now()}-${index}`,
              active: true,
              data: {
                name: cells.name.trim(),
                code: cells.code.trim(),
                city,
                district: cells.district.trim(),
                province: city,
              },
            };
          },
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
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true" style={{ width: "min(480px, 100%)" }}>
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "Vergi Dairesi Düzenle" : "Yeni Vergi Dairesi"}</h2>
                <p>Ad, il ve ilçe AnyPay ile aynı alanlardır.</p>
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
              <div className="bin-field">
                <label>Kod</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="Opsiyonel"
                />
              </div>
              <div className="bin-field">
                <label>
                  İl <em>*</em>
                </label>
                <input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="bin-field">
                <label>
                  İlçe <em>*</em>
                </label>
                <input
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
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
                <h2>Vergi dairesi silinsin mi?</h2>
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
