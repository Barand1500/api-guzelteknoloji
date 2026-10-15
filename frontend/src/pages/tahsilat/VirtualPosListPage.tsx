import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CreditCard, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { listBankNames } from "./banksStore";
import "./binList.css";

export type VirtualPosRow = {
  id: string;
  name: string;
  bank: string;
  variables: string;
  active: boolean;
};

type FormState = {
  name: string;
  bank: string;
  variables: string;
  active: boolean;
};

const STORAGE_KEY = "gtk_tahsilat_virtual_pos_v1";
const emptyForm: FormState = { name: "", bank: "", variables: "", active: true };

const SAMPLE: VirtualPosRow[] = [
  { id: "vp1", name: "AKBANK SANAL POS", bank: "AKBANK T.A.Ş.", variables: "Güvenli İşyeri Numarası, Terminal Safe ID, Güvenlik Anahtarı", active: true },
  { id: "vp2", name: "ALTERNATİF BANK SANAL POS", bank: "ALTERNATİF BANK A.Ş.", variables: "", active: true },
  { id: "vp3", name: "ANADOLU BANK SANAL POS", bank: "ANADOLUBANK A.Ş.", variables: "", active: true },
  { id: "vp4", name: "DENİZBANK SANAL POS", bank: "DENİZBANK A.Ş.", variables: "", active: true },
  { id: "vp5", name: "FIBA BANK SANAL POS", bank: "FIBABANKA A.Ş.", variables: "", active: true },
  { id: "vp6", name: "GARANTİ SANAL POS", bank: "T. GARANTİ BANKASI A.Ş.", variables: "", active: true },
];

function loadRows(): VirtualPosRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw as VirtualPosRow[];
  } catch {
    /* örnek */
  }
  return SAMPLE.map((r) => ({ ...r }));
}

function uid() {
  return `vpos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Ana Sanal Poslar — banka Bankalar listesinden */
export default function VirtualPosListPage() {
  const [rows, setRows] = useState<VirtualPosRow[]>(loadRows);
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
      `${r.name} ${r.bank} ${r.variables}`.toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [rows, query]);

  const bankOptions = useMemo(() => listBankNames(), [modalOpen]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: VirtualPosRow) {
    setEditId(row.id);
    setForm({
      name: row.name,
      bank: row.bank,
      variables: row.variables,
      active: row.active,
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
    const name = form.name.trim();
    const bank = form.bank.trim();
    if (!bank) {
      setError("Banka seçin.");
      return;
    }
    if (!name) {
      setError("Sanal pos adı gerekli.");
      return;
    }
    const next: VirtualPosRow = {
      id: editId || uid(),
      name,
      bank,
      variables: form.variables.trim(),
      active: form.active,
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
            <CreditCard
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Ana Sanal Poslar
          </h1>
          <p>Sanal pos tanımlarını görüntüleyin ve yönetin</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          Yeni Sanal Pos
        </button>
      </div>

      <p className="bin-hint">
        Banka alanı Bankalar listesinden gelir. Değişkenler alanı adaptör yapılandırması için
        (JSON veya serbest metin).
      </p>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <label className="bin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sanal pos veya banka ara…"
              aria-label="Sanal pos ara"
            />
          </label>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>Sanal Pos</th>
                  <th>Banka</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.bank}</td>
                    <td>
                      <span className={`vpos-status ${row.active ? "on" : "off"}`}>
                        {row.active ? <Check size={14} strokeWidth={2.4} /> : null}
                        {row.active ? "Aktif" : "Pasif"}
                      </span>
                    </td>
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
              <strong>{query ? "Eşleşen kayıt yok" : "Henüz sanal pos yok"}</strong>
              <span>{query ? "Aramayı değiştirin." : "İlk sanal posu ekleyin."}</span>
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
            aria-labelledby="vpos-modal-title"
            style={{ width: "min(520px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="vpos-modal-title">{editId ? "Sanal Pos Düzenle" : "Yeni Sanal Pos"}</h2>
                <p>Sanal pos bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="vpos-bank">
                  Banka <em>*</em>
                </label>
                <select
                  id="vpos-bank"
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
              <div className="bin-field">
                <label htmlFor="vpos-name">
                  Ad <em>*</em>
                </label>
                <input
                  id="vpos-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ad"
                  autoFocus
                />
              </div>
              <div className="bin-field">
                <label htmlFor="vpos-vars">Değişkenler</label>
                <textarea
                  id="vpos-vars"
                  className="vpos-textarea"
                  rows={4}
                  value={form.variables}
                  onChange={(e) => setForm((f) => ({ ...f, variables: e.target.value }))}
                  placeholder="Değişkenler"
                />
                <small className="bank-logo-hint">
                  Sanal pos adaptörü için yapılandırma değişkenleri (JSON veya serbest metin)
                </small>
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Bu sanal pos aktif olarak kullanılsın.</p>
                </div>
                <button
                  type="button"
                  className={`vpos-switch ${form.active ? "on" : ""}`}
                  role="switch"
                  aria-checked={form.active}
                  aria-label="Aktif"
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                >
                  <span />
                </button>
              </div>
              {error ? (
                <span className="bin-modal-error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={save}>
                {editId ? "Güncelle" : "Kaydet"}
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
            aria-labelledby="vpos-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="vpos-del-title">Sanal pos silinsin mi?</h2>
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
