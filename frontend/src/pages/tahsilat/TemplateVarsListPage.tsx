import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import {
  channelLabel,
  parseVariableKeys,
  type TemplateChannel,
} from "./templateVarsStore";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
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

type Props = { token: string };

function varsOf(row: TahsilatAdminRow): string[] {
  return parseVariableKeys(str(row, "variables"));
}

/** Sistem → Şablon Değişkenleri — MySQL */
export default function TemplateVarsListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, "template-vars");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
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

  const tableRows = useMemo(
    () =>
      rows.slice().sort((a, b) => {
        const n = str(a, "name").localeCompare(str(b, "name"), "tr");
        if (n !== 0) return n;
        return str(a, "type").localeCompare(str(b, "type"));
      }),
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
    setForm({
      name: str(row, "name"),
      type: (str(row, "type") as TemplateChannel) || "",
      variablesText: varsOf(row).join(", "),
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
        str(r, "type") === form.type &&
        str(r, "name").toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu ad ve tip kombinasyonu zaten var.");
      return;
    }
    setBusy(true);
    try {
      await saveRow({
        id: editId || `new-${Date.now()}`,
        active: form.active,
        data: {
          name,
          type: form.type,
          variables: variables.join(","),
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
    { id: "name", label: "Ad", accessor: (r) => str(r, "name") },
    {
      id: "type",
      label: "Tip",
      accessor: (r) => channelLabel((str(r, "type") as TemplateChannel) || "email"),
      render: (row) => {
        const type = (str(row, "type") as TemplateChannel) || "email";
        return <span className={`tpl-type ${type}`}>{channelLabel(type)}</span>;
      },
    },
    {
      id: "variables",
      label: "Değişkenler",
      accessor: (r) => varsOf(r).join(", "),
      render: (row) => (
        <div className="tpl-vars">
          {varsOf(row).map((v) => (
            <code key={v} className="tpl-var">
              {`{{${v}}}`}
            </code>
          ))}
        </div>
      ),
    },
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
          <span className="bin-page-eyebrow">SİSTEM</span>
          <h1>
            <Braces
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Şablon Değişkenleri
          </h1>
          <p>E-posta ve SMS şablon değişkenlerini yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
          <Plus size={18} />
          Yeni Değişken Grubu
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
        storageKey="tahsilat-template-vars"
        searchPlaceholder="Grup veya değişken ara…"
        loading={loading}
        emptyTitle="Henüz değişken grubu yok"
        emptyHint="İlk grubu ekleyin veya Excel'den içe aktarın."
        exportFileName="sablon-degiskenleri"
        excelImport={{
          title: "Şablon değişkeni Excel içe aktar",
          templateFileName: "sablon-degiskenleri-sablon.xlsx",
          columns: [
            { key: "name", label: "Ad", required: true },
            { key: "type", label: "Tip", aliases: ["kanal"], required: true },
            { key: "variables", label: "Değişkenler", aliases: ["variables"], required: true },
          ],
          validateRow: (cells) => {
            if (!cells.name.trim()) return "Ad gerekli";
            const type = cells.type.trim().toLowerCase();
            if (type !== "email" && type !== "sms") return "Tip email veya sms olmalı";
            if (!parseVariableKeys(cells.variables).length) return "En az bir değişken girin";
            return null;
          },
          mapRow: (cells, index) => {
            const type = cells.type.trim().toLowerCase() as TemplateChannel;
            const variables = parseVariableKeys(cells.variables);
            return {
              id: `import-${Date.now()}-${index}`,
              active: true,
              data: { name: cells.name.trim(), type, variables: variables.join(",") },
            };
          },
          onConfirm: async (imported) => {
            const existing = new Set(
              rows.map((r) =>
                `${str(r, "type")}|${str(r, "name")}`.toLocaleLowerCase("tr-TR"),
              ),
            );
            const fresh = imported.filter(
              (r) =>
                !existing.has(`${str(r, "type")}|${str(r, "name")}`.toLocaleLowerCase("tr-TR")),
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
            style={{ width: "min(480px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "Değişken Grubu Düzenle" : "Yeni Değişken Grubu"}</h2>
                <p>Şablon değişken grubu bilgilerini girin.</p>
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
                <label>
                  Tip <em>*</em>
                </label>
                <select
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
                <label>
                  Değişkenler <em>*</em>
                </label>
                <textarea
                  className="vpos-textarea"
                  rows={5}
                  value={form.variablesText}
                  onChange={(e) => setForm((f) => ({ ...f, variablesText: e.target.value }))}
                  placeholder="musteri_adi,tutar,tarih"
                />
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
                <h2>Grup silinsin mi?</h2>
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
