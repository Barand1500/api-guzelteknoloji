import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CreditCard, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { fetchTahsilatResource, type TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import "./binList.css";

type FormState = { name: string; bank: string; variables: string; active: boolean };
const emptyForm: FormState = { name: "", bank: "", variables: "", active: true };

type Props = { token: string };

/** Ana Sanal Poslar — MySQL */
export default function VirtualPosListPage({ token }: Props) {
  const { rows, loading, saveRow, removeRow } = useTahsilatDb(token, "virtual-pos");
  const [bankNames, setBankNames] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTahsilatResource(token, "banks")
      .then((data) => {
        if (cancelled) return;
        const names = (data.rows || [])
          .map((r) => str(r, "name"))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "tr"));
        setBankNames(names);
      })
      .catch(() => {
        if (!cancelled) setBankNames([]);
      });
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

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) =>
      `${str(r, "name")} ${str(r, "bank")} ${str(r, "variables")}`
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [rows, query]);

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
      bank: str(row, "bank"),
      variables: str(row, "variables"),
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
    const bank = form.bank.trim();
    if (!bank) {
      setError("Banka seçin.");
      return;
    }
    if (!name) {
      setError("Sanal pos adı gerekli.");
      return;
    }
    setBusy(true);
    try {
      await saveRow({
        id: editId || `new-${Date.now()}`,
        active: form.active,
        data: { name, bank, variables: form.variables.trim() },
      });
      closeModal();
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
            Ana Sanal Poslar
          </h1>
          <p>Sanal pos tanımlarını görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
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
                    <td>{str(row, "name")}</td>
                    <td>{str(row, "bank")}</td>
                    <td>
                      <span className={`vpos-status ${row.active !== false ? "on" : "off"}`}>
                        {row.active !== false ? <Check size={14} strokeWidth={2.4} /> : null}
                        {row.active !== false ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td>
                      <div className="bin-actions">
                        <button type="button" className="bin-icon-btn" onClick={() => openEdit(row)}>
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="bin-icon-btn danger"
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
              <strong>{loading ? "Yükleniyor…" : query ? "Eşleşen kayıt yok" : "Henüz sanal pos yok"}</strong>
            </div>
          )}
        </div>
      </section>

      {modalOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true" style={{ width: "min(520px, 100%)" }}>
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "Sanal Pos Düzenle" : "Yeni Sanal Pos"}</h2>
                <p>Sanal pos bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label>
                  Banka <em>*</em>
                </label>
                <select value={form.bank} onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}>
                  <option value="">Seçiniz</option>
                  {bankNames.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
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
                <label>Değişkenler</label>
                <textarea
                  className="vpos-textarea"
                  rows={4}
                  value={form.variables}
                  onChange={(e) => setForm((f) => ({ ...f, variables: e.target.value }))}
                />
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
                <h2>Sanal pos silinsin mi?</h2>
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
