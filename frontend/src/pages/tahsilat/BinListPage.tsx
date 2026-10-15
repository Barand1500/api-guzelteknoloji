import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { listBankNames } from "./banksStore";
import {
  listCardBrandNames,
  listCardKindNames,
  listCardTypeNames,
} from "./cardMetaStore";
import "./binList.css";

export type BinRow = {
  id: string;
  bin: string;
  bank: string;
  type: string;
  brand: string;
  kind: string;
};

type FormState = {
  bin: string;
  bank: string;
  type: string;
  brand: string;
  kind: string;
};

const STORAGE_KEY = "gtk_tahsilat_bins_v1";
const emptyForm: FormState = { bin: "", bank: "", type: "", brand: "", kind: "" };

const SAMPLE: BinRow[] = [
  {
    id: "s1",
    bin: "10067",
    bank: "YAPI VE KREDİ BANKASI A.Ş.",
    type: "Banka Kartı",
    brand: "Özel Logolu",
    kind: "Bireysel Kart",
  },
  {
    id: "s2",
    bin: "112233",
    bank: "T. GARANTİ BANKASI A.Ş.",
    type: "Banka Kartı",
    brand: "Diners",
    kind: "Bireysel Kart",
  },
  {
    id: "s3",
    bin: "113032",
    bank: "TÜRK EKONOMİ BANKASI A.Ş.",
    type: "Banka Kartı",
    brand: "Amex",
    kind: "Bireysel Kart",
  },
];

function loadRows(): BinRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw as BinRow[];
  } catch {
    /* örnekle başla */
  }
  return SAMPLE.map((r) => ({ ...r }));
}

function uid() {
  return `bin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** BIN Listesi — şimdilik yerel; banka/tip/marka/tür Kart Yönetimi’ne bağlanacak */
export default function BinListPage() {
  const [rows, setRows] = useState<BinRow[]>(loadRows);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

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
      `${r.bin} ${r.bank} ${r.type} ${r.brand} ${r.kind}`.toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [rows, query]);

  const bankOptions = useMemo(() => listBankNames(), [modalOpen]);
  const typeOptions = useMemo(() => listCardTypeNames(), [modalOpen]);
  const brandOptions = useMemo(() => listCardBrandNames(), [modalOpen]);
  const kindOptions = useMemo(() => listCardKindNames(), [modalOpen]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: BinRow) {
    setEditId(row.id);
    setForm({
      bin: row.bin,
      bank: row.bank,
      type: row.type,
      brand: row.brand,
      kind: row.kind,
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function save() {
    const bin = form.bin.replace(/\D/g, "").slice(0, 8);
    if (bin.length < 4) {
      setError("BIN numarası en az 4 hane olmalı.");
      return;
    }
    if (!form.bank || !form.type || !form.brand || !form.kind) {
      setError("Tüm alanları doldurun.");
      return;
    }
    const dup = rows.some((r) => r.bin === bin && r.id !== editId);
    if (dup) {
      setError("Bu BIN zaten kayıtlı.");
      return;
    }
    const next: BinRow = {
      id: editId || uid(),
      bin,
      bank: form.bank,
      type: form.type,
      brand: form.brand,
      kind: form.kind,
    };
    setRows((prev) =>
      editId ? prev.map((r) => (r.id === editId ? next : r)) : [next, ...prev],
    );
    closeModal();
  }

  function confirmDelete() {
    if (!deleteId) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteId));
    setDeleteId(null);
  }

  return (
    <div className="bin-page">
      <div className="bin-page-head">
        <div className="bin-page-head-copy">
          <span className="bin-page-eyebrow">ÖDEME ALTYAPISI</span>
          <h1>
            <CreditCard size={26} strokeWidth={2} style={{ display: "inline", marginRight: 10, verticalAlign: -4 }} />
            BIN Listesi
          </h1>
          <p>Kart BIN numaralarını görüntüleyin ve yönetin</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          Yeni BIN
        </button>
      </div>

      <p className="bin-hint">
        Banka, kart tipi, marka ve tür seçimleri Bankalar + Kart Yönetimi listelerinden gelir.
      </p>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <label className="bin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="BIN, banka veya marka ara…"
              aria-label="BIN ara"
            />
          </label>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>BIN</th>
                  <th>Banka</th>
                  <th>Kart Tipi</th>
                  <th>Kart Markası</th>
                  <th>Kart Türü</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="bin-mono">{row.bin}</td>
                    <td>{row.bank}</td>
                    <td>{row.type}</td>
                    <td>{row.brand}</td>
                    <td>{row.kind}</td>
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
              <strong>{query ? "Eşleşen kayıt yok" : "Henüz BIN yok"}</strong>
              <span>{query ? "Aramayı değiştirin." : "İlk BIN kaydını ekleyin."}</span>
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
              <button type="button" className="primary" onClick={save}>
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
            aria-labelledby="bin-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="bin-del-title">BIN silinsin mi?</h2>
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
