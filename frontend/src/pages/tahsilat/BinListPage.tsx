import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { CreditCard, Pencil, Plus, Trash2, X } from "lucide-react";
import { fetchTahsilatResource, field, type TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
import "./binList.css";

type FormState = {
  bin: string;
  bank: string;
  type: string;
  brand: string;
  kind: string;
};

const emptyForm: FormState = { bin: "", bank: "", type: "", brand: "", kind: "" };

type Props = { token: string };

/** BIN Listesi — MySQL (AnyPay /v1/tahsilat/bins) */
export default function BinListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    persistBulk,
  } = useTahsilatDb(token, "bins");
  const [bankOptions, setBankOptions] = useState<string[]>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [kindOptions, setKindOptions] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [banks, types, brands, kinds] = await Promise.all([
          fetchTahsilatResource(token, "banks"),
          fetchTahsilatResource(token, "card-types"),
          fetchTahsilatResource(token, "card-brands"),
          fetchTahsilatResource(token, "card-kinds"),
        ]);
        if (cancelled) return;
        setBankOptions(
          banks.rows
            .filter((r) => r.active !== false)
            .map((r) => field(r, "name"))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "tr")),
        );
        setTypeOptions(types.rows.map((r) => field(r, "name")).filter(Boolean));
        setBrandOptions(brands.rows.map((r) => field(r, "name")).filter(Boolean));
        setKindOptions(kinds.rows.map((r) => field(r, "name")).filter(Boolean));
      } catch {
        /* dropdown boş kalabilir */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, modalOpen]);

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
      bin: str(row, "bin"),
      bank: str(row, "bank"),
      type: str(row, "type"),
      brand: str(row, "brand"),
      kind: str(row, "kind"),
    });
    setError("");
    setModalOpen(true);
  }

  const tableColumns: TahsilatTableColumn<TahsilatAdminRow>[] = [
    { id: "bin", label: "BIN", mono: true, accessor: (r) => str(r, "bin") },
    { id: "bank", label: "Banka", accessor: (r) => str(r, "bank") },
    { id: "type", label: "Kart Tipi", accessor: (r) => str(r, "type") },
    { id: "brand", label: "Kart Markası", accessor: (r) => str(r, "brand") },
    { id: "kind", label: "Kart Türü", accessor: (r) => str(r, "kind") },
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

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  async function save() {
    const bin = form.bin.replace(/\D/g, "").slice(0, 8);
    if (bin.length < 4) {
      setError("BIN numarası en az 4 hane olmalı.");
      return;
    }
    if (!form.bank || !form.type || !form.brand || !form.kind) {
      setError("Tüm alanları doldurun.");
      return;
    }
    const dup = rows.some((r) => str(r, "bin") === bin && r.id !== editId);
    if (dup) {
      setError("Bu BIN zaten kayıtlı.");
      return;
    }
    const nextRow: TahsilatAdminRow = {
      id: editId || `new-${Date.now()}`,
      active: true,
      data: {
        bin,
        bank: form.bank,
        type: form.type,
        brand: form.brand,
        kind: form.kind,
      },
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

  return (
    <div className="bin-page">
      <div className="bin-page-head">
        <div className="bin-page-head-copy">
          <span className="bin-page-eyebrow">ÖDEME ALTYAPISI</span>
          <h1>
            <CreditCard
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            BIN Listesi
          </h1>
          <p>Kart BIN numaralarını görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading || saving}>
          <Plus size={18} />
          Yeni BIN
        </button>
      </div>

      <p className="bin-hint">
        Veriler MySQL’de tutulur. AnyPay anahtarı açıkken{" "}
        <code>/v1/tahsilat/bins</code> üzerinden çeker.
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
        storageKey="tahsilat-bins"
        searchPlaceholder="BIN, banka veya marka ara…"
        loading={loading}
        emptyTitle="Henüz BIN yok"
        emptyHint="İlk BIN kaydını ekleyin veya Excel’den içe aktarın."
        exportFileName="bin-listesi"
        excelImport={{
          title: "BIN Excel içe aktar",
          templateFileName: "bin-sablon.xlsx",
          columns: [
            { key: "bin", label: "BIN", aliases: ["bin no", "bin numarası"], required: true },
            { key: "bank", label: "Banka", aliases: ["banka adı"], required: true },
            { key: "type", label: "Kart Tipi", aliases: ["tip", "kart tipi"], required: true },
            {
              key: "brand",
              label: "Kart Markası",
              aliases: ["marka", "kart markası"],
              required: true,
            },
            { key: "kind", label: "Kart Türü", aliases: ["tür", "kart türü"], required: true },
          ],
          validateRow: (cells) => {
            const bin = cells.bin.replace(/\D/g, "");
            if (bin.length < 4) return "BIN en az 4 hane olmalı";
            return null;
          },
          mapRow: (cells, index) => {
            const bin = cells.bin.replace(/\D/g, "").slice(0, 8);
            return {
              id: `import-${Date.now()}-${index}`,
              active: true,
              data: {
                bin,
                bank: cells.bank.trim(),
                type: cells.type.trim(),
                brand: cells.brand.trim(),
                kind: cells.kind.trim(),
              },
            };
          },
          onConfirm: async (imported) => {
            // Mevcut BIN’lerle çakışanları atla — üzerine yazma
            const existing = new Set(rows.map((r) => str(r, "bin")));
            const fresh = imported.filter((r) => !existing.has(str(r, "bin")));
            if (!fresh.length) {
              throw new Error("İçe aktarılacak yeni BIN yok (hepsi zaten kayıtlı).");
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
            aria-labelledby="bin-modal-title"
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="bin-modal-title">{editId ? "BIN Düzenle" : "Yeni BIN"}</h2>
                <p>BIN numarası ve kart bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="bin-num">
                  BIN Numarası <em>*</em>
                </label>
                <input
                  id="bin-num"
                  inputMode="numeric"
                  value={form.bin}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bin: e.target.value.replace(/\D/g, "").slice(0, 8) }))
                  }
                  placeholder="Örn. 526955"
                  autoFocus
                />
              </div>
              <div className="bin-field">
                <label htmlFor="bin-bank">
                  Banka <em>*</em>
                </label>
                <select
                  id="bin-bank"
                  value={form.bank}
                  onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {bankOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bin-field-row">
                <div className="bin-field">
                  <label htmlFor="bin-type">
                    Kart Tipi <em>*</em>
                  </label>
                  <select
                    id="bin-type"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="">Seçiniz</option>
                    {typeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bin-field">
                  <label htmlFor="bin-brand">
                    Kart Markası <em>*</em>
                  </label>
                  <select
                    id="bin-brand"
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  >
                    <option value="">Seçiniz</option>
                    {brandOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bin-field">
                <label htmlFor="bin-kind">
                  Kart Türü <em>*</em>
                </label>
                <select
                  id="bin-kind"
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {kindOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
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
            aria-labelledby="bin-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="bin-del-title">BIN silinsin mi?</h2>
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
