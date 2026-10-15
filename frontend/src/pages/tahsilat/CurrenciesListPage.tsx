import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Coins, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import "./binList.css";

type FormState = { name: string; shortName: string; symbol: string; active: boolean };
const emptyForm: FormState = { name: "", shortName: "", symbol: "", active: true };

type Props = { token: string };

/** Para Birimleri — MySQL */
export default function CurrenciesListPage({ token }: Props) {
  const { rows, loading, saveRow, removeRow } = useTahsilatDb(token, "currencies");
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) =>
      `${str(r, "name")} ${str(r, "shortName")} ${str(r, "symbol")}`
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

      <section className="bin-panel">
        <div className="bin-toolbar">
          <label className="bin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ad, kısa ad veya sembol ara…"
              aria-label="Para birimi ara"
            />
          </label>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>Kısa Ad</th>
                  <th>Sembol</th>
                  <th>Ad</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="bin-mono">{str(row, "shortName")}</td>
                    <td style={{ fontSize: 18 }}>{str(row, "symbol")}</td>
                    <td>{str(row, "name")}</td>
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
              <strong>{loading ? "Yükleniyor…" : query ? "Eşleşen kayıt yok" : "Henüz para birimi yok"}</strong>
            </div>
          )}
        </div>
      </section>

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
