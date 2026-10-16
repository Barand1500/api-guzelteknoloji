import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Puzzle, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { slugifyCode } from "./modulesStore";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
import "./binList.css";

type FormState = {
  name: string;
  code: string;
  icon: string;
  sortOrder: number;
  parentId: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  code: "",
  icon: "",
  sortOrder: 0,
  parentId: "",
  active: true,
};

type Props = { token: string };

function parentNameOf(row: TahsilatAdminRow, rows: TahsilatAdminRow[]) {
  const pid = str(row, "parentId");
  if (!pid) return "";
  const parent = rows.find((r) => r.id === pid);
  return parent ? str(parent, "name") : str(row, "parentName");
}

/** Sistem → Modüller — MySQL */
export default function ModulesListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, "modules");
  const [filterParentId, setFilterParentId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

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

  const parentOptions = useMemo(
    () =>
      rows
        .filter((r) => r.id !== editId)
        .slice()
        .sort((a, b) => str(a, "name").localeCompare(str(b, "name"), "tr")),
    [rows, editId],
  );

  const filterParents = useMemo(() => {
    const ids = new Set(rows.map((r) => str(r, "parentId")).filter(Boolean));
    return rows
      .filter((r) => ids.has(r.id) || rows.some((c) => str(c, "parentId") === r.id))
      .sort((a, b) => str(a, "name").localeCompare(str(b, "name"), "tr"));
  }, [rows]);

  const tableRows = useMemo(
    () =>
      rows
        .filter((r) => {
          const parentId = str(r, "parentId");
          if (!filterParentId) return true;
          if (filterParentId === "__root__") return !parentId;
          return parentId === filterParentId;
        })
        .sort((a, b) => {
          const ao = Number(a.data.sortOrder) || 0;
          const bo = Number(b.data.sortOrder) || 0;
          if (ao !== bo) return ao - bo;
          return str(a, "name").localeCompare(str(b, "name"), "tr");
        }),
    [rows, filterParentId],
  );

  function openCreate() {
    setEditId(null);
    setForm({
      ...emptyForm,
      parentId: filterParentId && filterParentId !== "__root__" ? filterParentId : "",
      sortOrder: rows.length
        ? Math.max(...rows.map((r) => Number(r.data.sortOrder) || 0)) + 1
        : 0,
    });
    setCodeTouched(false);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setForm({
      name: str(row, "name"),
      code: str(row, "code"),
      icon: str(row, "icon"),
      sortOrder: Number(row.data.sortOrder) || 0,
      parentId: str(row, "parentId"),
      active: row.active !== false,
    });
    setCodeTouched(true);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function onNameChange(value: string) {
    setForm((f) => ({
      ...f,
      name: value,
      code: !editId && !codeTouched ? slugifyCode(value) : f.code,
    }));
  }

  async function onSave() {
    const name = form.name.trim();
    const code = form.code.trim();
    if (!name) {
      setError("Ad gerekli.");
      return;
    }
    if (!code) {
      setError("Kod gerekli.");
      return;
    }
    const parentId = form.parentId || "";
    if (parentId === editId) {
      setError("Modül kendi üstü olamaz.");
      return;
    }
    if (parentId && !rows.some((r) => r.id === parentId)) {
      setError("Üst modül bulunamadı.");
      return;
    }
    const dupCode = rows.some(
      (r) =>
        r.id !== editId &&
        str(r, "code").toLocaleLowerCase("tr-TR") === code.toLocaleLowerCase("tr-TR"),
    );
    if (dupCode) {
      setError("Bu kod zaten var.");
      return;
    }
    const parent = rows.find((r) => r.id === parentId);
    setBusy(true);
    try {
      await saveRow({
        id: editId || `new-${Date.now()}`,
        active: form.active,
        data: {
          name,
          code,
          icon: form.icon.trim(),
          sortOrder: Number.isFinite(form.sortOrder) ? form.sortOrder : 0,
          parentId,
          parentName: parent ? str(parent, "name") : "",
        },
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
    { id: "parent", label: "Üst Modül", accessor: (r) => parentNameOf(r, rows) || "—" },
    { id: "name", label: "Ad", accessor: (r) => str(r, "name") },
    { id: "code", label: "Kod", mono: true, accessor: (r) => str(r, "code") },
    { id: "icon", label: "İkon", accessor: (r) => str(r, "icon") || "—" },
    { id: "sortOrder", label: "Sıra", accessor: (r) => String(Number(r.data.sortOrder) || 0) },
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
          <button
            type="button"
            className="bin-icon-btn danger"
            onClick={() => {
              setError("");
              setDeleteId(row.id);
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  async function confirmDelete() {
    if (!deleteId) return;
    const hasChildren = rows.some((r) => str(r, "parentId") === deleteId);
    if (hasChildren) {
      setError("Alt modülleri olan kayıt silinemez. Önce altları silin veya taşıyın.");
      return;
    }
    setBusy(true);
    try {
      await removeRow(deleteId);
      setDeleteId(null);
      setError("");
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
          <span className="bin-page-eyebrow">SİSTEM</span>
          <h1>
            <Puzzle
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Modüller
          </h1>
          <p>Sistem modüllerini görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
          <Plus size={18} />
          Yeni Modül
        </button>
      </div>

      {dbError ? (
        <p className="bin-hint" style={{ color: "#be123c" }} role="alert">
          {dbError}
        </p>
      ) : null}

      <TahsilatDataTable
        rows={tableRows}
        columns={tableColumns}
        getRowId={(r) => r.id}
        storageKey="tahsilat-modules"
        searchPlaceholder="Modül ara…"
        loading={loading}
        emptyTitle="Henüz modül yok"
        emptyHint="İlk modülü ekleyin veya Excel'den içe aktarın."
        exportFileName="moduller"
        toolbarStart={
          <select
            className="bin-filter-select"
            value={filterParentId}
            onChange={(e) => setFilterParentId(e.target.value)}
            aria-label="Üst modüle göre filtrele"
          >
            <option value="">Üst Modüle Göre Filtrele</option>
            <option value="__root__">Üst seviye (üst yok)</option>
            {filterParents.map((p) => (
              <option key={p.id} value={p.id}>
                {str(p, "name")}
              </option>
            ))}
          </select>
        }
        excelImport={{
          title: "Modül Excel içe aktar",
          templateFileName: "moduller-sablon.xlsx",
          columns: [
            { key: "name", label: "Ad", required: true },
            { key: "code", label: "Kod", required: true },
            { key: "icon", label: "İkon" },
            { key: "sortOrder", label: "Sıra", aliases: ["sıra no"] },
          ],
          validateRow: (cells) => {
            if (!cells.name.trim()) return "Ad gerekli";
            if (!cells.code.trim()) return "Kod gerekli";
            return null;
          },
          mapRow: (cells, index) => ({
            id: `import-${Date.now()}-${index}`,
            active: true,
            data: {
              name: cells.name.trim(),
              code: slugifyCode(cells.code.trim() || cells.name),
              icon: cells.icon.trim(),
              sortOrder: Number(cells.sortOrder.replace(/\D/g, "")) || 0,
              parentId: "",
              parentName: "",
            },
          }),
          onConfirm: async (imported) => {
            const existing = new Set(rows.map((r) => str(r, "code").toLocaleLowerCase("tr-TR")));
            const fresh = imported.filter(
              (r) => !existing.has(str(r, "code").toLocaleLowerCase("tr-TR")),
            );
            if (!fresh.length) {
              throw new Error("İçe aktarılacak yeni modül yok (hepsi zaten kayıtlı).");
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
            style={{ width: "min(480px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "Modül Düzenle" : "Yeni Modül"}</h2>
                <p>Modül bilgilerini girin.</p>
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
                <input value={form.name} onChange={(e) => onNameChange(e.target.value)} autoFocus />
              </div>
              <div className="bin-field">
                <label>
                  Kod <em>*</em>
                </label>
                <input
                  value={form.code}
                  onChange={(e) => {
                    setCodeTouched(true);
                    setForm((f) => ({ ...f, code: e.target.value }));
                  }}
                />
              </div>
              <div className="bin-field-row">
                <div className="bin-field">
                  <label>İkon</label>
                  <input
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  />
                </div>
                <div className="bin-field">
                  <label>Sıra</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="bin-field">
                <label>Üst Modül</label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {str(p, "name")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Modülü aktif veya pasif yapın</p>
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
          <div
            ref={modalRef}
            className="bin-modal"
            role="dialog"
            aria-modal="true"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2>Modül silinsin mi?</h2>
                <p>Veritabanından kaldırılacak.</p>
              </div>
              <button
                type="button"
                className="bin-modal-close"
                onClick={() => {
                  setDeleteId(null);
                  setError("");
                }}
              >
                <X size={18} />
              </button>
            </div>
            {error ? (
              <div className="bin-modal-body">
                <span className="bin-modal-error">{error}</span>
              </div>
            ) : null}
            <div className="bin-modal-foot">
              <button
                type="button"
                className="primary"
                onClick={() => void confirmDelete()}
                disabled={busy}
              >
                Sil
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDeleteId(null);
                  setError("");
                }}
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
