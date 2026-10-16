import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { Calendar, Pencil, Plus, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
import "./binList.css";

type FormState = {
  version: string;
  releasedAt: string;
  added: string;
  fixed: string;
  removed: string;
  active: boolean;
};

const emptyForm: FormState = {
  version: "",
  releasedAt: new Date().toISOString().slice(0, 10),
  added: "",
  fixed: "",
  removed: "",
  active: true,
};

type Props = { token: string };

/** Sürümler — MySQL (AnyPay sürüm geçmişi kaynağı) */
export default function VersionsListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, "versions");
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

  function versionSummary(row: TahsilatAdminRow) {
    const bits = [
      str(row, "added") ? `+${str(row, "added").split(/\n/).filter(Boolean).length}` : "",
      str(row, "fixed") ? `~${str(row, "fixed").split(/\n/).filter(Boolean).length}` : "",
      str(row, "removed") ? `-${str(row, "removed").split(/\n/).filter(Boolean).length}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return bits || "—";
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setForm({
      version: str(row, "version"),
      releasedAt: str(row, "releasedAt") || emptyForm.releasedAt,
      added: str(row, "added"),
      fixed: str(row, "fixed"),
      removed: str(row, "removed"),
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
    const version = form.version.trim();
    if (!version) {
      setError("Sürüm numarası gerekli.");
      return;
    }
    setBusy(true);
    try {
      await saveRow({
        id: editId || `new-${Date.now()}`,
        active: form.active,
        data: {
          version,
          releasedAt: form.releasedAt.trim(),
          added: form.added,
          fixed: form.fixed,
          removed: form.removed,
        },
      });
      closeModal();
      setDbError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt yazılamadı.");
    } finally {
      setBusy(false);
    }
  }

  const tableColumns: TahsilatTableColumn<TahsilatAdminRow>[] = [
    { id: "version", label: "Sürüm", mono: true, accessor: (r) => str(r, "version") || "—" },
    { id: "releasedAt", label: "Tarih", accessor: (r) => str(r, "releasedAt") || "—" },
    { id: "summary", label: "Özet", accessor: (r) => versionSummary(r) },
    {
      id: "actions",
      label: "İşlemler",
      hideable: false,
      filterable: false,
      align: "right",
      accessor: () => "",
      render: (row) => (
        <div className="bin-actions">
          <button type="button" className="bin-icon-btn" title="Düzenle" onClick={() => openEdit(row)}>
            <Pencil size={16} />
          </button>
          <button type="button" className="bin-icon-btn danger" title="Sil" onClick={() => setDeleteId(row.id)}>
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  async function onDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await removeRow(deleteId);
      setDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bin-page">
      <header className="bin-hero">
        <div>
          <p className="bin-eyebrow">SİSTEM</p>
          <h1>
            <Calendar size={26} strokeWidth={2} /> Sürümler
          </h1>
          <p className="bin-sub">AnyPay sürüm geçmişinin ortak kaynağı</p>
        </div>
        <button type="button" className="bin-btn-primary" onClick={openCreate}>
          <Plus size={18} /> Yeni Sürüm
        </button>
      </header>

      {dbError ? (
        <p className="bin-hint" style={{ color: "#be123c" }} role="alert">
          {dbError}
        </p>
      ) : null}

      <TahsilatDataTable
        rows={rows}
        columns={tableColumns}
        getRowId={(r) => r.id}
        storageKey="tahsilat-versions"
        searchPlaceholder="Sürüm veya not ara…"
        loading={loading}
        emptyTitle="Henüz sürüm yok"
        emptyHint="Yeni Sürüm ile ekleyin veya Excel'den içe aktarın."
        exportFileName="surumler"
        excelImport={{
          title: "Sürüm Excel içe aktar",
          templateFileName: "surumler-sablon.xlsx",
          columns: [
            { key: "version", label: "Sürüm", required: true },
            { key: "releasedAt", label: "Tarih", aliases: ["yayın tarihi"] },
            { key: "added", label: "Eklenen" },
            { key: "fixed", label: "Düzeltilen" },
            { key: "removed", label: "Çıkarılan" },
          ],
          validateRow: (cells) => (!cells.version.trim() ? "Sürüm numarası gerekli" : null),
          mapRow: (cells, index) => ({
            id: `import-${Date.now()}-${index}`,
            active: true,
            data: {
              version: cells.version.trim(),
              releasedAt: cells.releasedAt.trim() || new Date().toISOString().slice(0, 10),
              added: cells.added,
              fixed: cells.fixed,
              removed: cells.removed,
            },
          }),
          onConfirm: async (imported) => {
            const existing = new Set(rows.map((r) => str(r, "version").toLocaleLowerCase("tr-TR")));
            const fresh = imported.filter(
              (r) => !existing.has(str(r, "version").toLocaleLowerCase("tr-TR")),
            );
            if (!fresh.length) {
              throw new Error("İçe aktarılacak yeni sürüm yok (hepsi zaten kayıtlı).");
            }
            await persistBulk(fresh);
            setDbError("");
          },
        }}
      />

      {modalOpen ? (
        <div className="bin-modal-overlay">
          <div className="bin-modal" ref={modalRef}>
            <div className="bin-modal-head">
              <h2>{editId ? "Sürüm Düzenle" : "Yeni Sürüm"}</h2>
              <button type="button" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <label>
                Sürüm
                <input
                  value={form.version}
                  onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="1.2.0"
                />
              </label>
              <label>
                Tarih
                <input
                  type="date"
                  value={form.releasedAt}
                  onChange={(e) => setForm((f) => ({ ...f, releasedAt: e.target.value }))}
                />
              </label>
              <label>
                Eklenen (satır satır)
                <textarea
                  rows={3}
                  value={form.added}
                  onChange={(e) => setForm((f) => ({ ...f, added: e.target.value }))}
                />
              </label>
              <label>
                Düzeltilen
                <textarea
                  rows={3}
                  value={form.fixed}
                  onChange={(e) => setForm((f) => ({ ...f, fixed: e.target.value }))}
                />
              </label>
              <label>
                Çıkarılan
                <textarea
                  rows={3}
                  value={form.removed}
                  onChange={(e) => setForm((f) => ({ ...f, removed: e.target.value }))}
                />
              </label>
              {error ? <p className="bin-error">{error}</p> : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="bin-btn-ghost" onClick={closeModal}>
                Vazgeç
              </button>
              <button type="button" className="bin-btn-primary" disabled={busy} onClick={() => void onSave()}>
                <Check size={16} /> {busy ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div className="bin-modal-overlay">
          <div className="bin-modal bin-modal-sm" ref={modalRef}>
            <div className="bin-modal-head">
              <h2>Sürüm silinsin mi?</h2>
              <button type="button" onClick={() => setDeleteId(null)} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <p>Bu kayıt kalıcı olarak silinir.</p>
              {error ? <p className="bin-error">{error}</p> : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="bin-btn-ghost" onClick={() => setDeleteId(null)}>
                Vazgeç
              </button>
              <button type="button" className="bin-btn-danger" disabled={busy} onClick={() => void onDelete()}>
                Sil
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
