import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListPlus, MapPinned, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { fetchTahsilatResource, type TahsilatAdminRow } from "./tahsilatApi";
import { str, useTahsilatDb } from "./useTahsilatDb";
import "./binList.css";

type FormState = { province: string; name: string; active: boolean };
type BulkForm = { province: string; namesText: string; active: boolean };
const emptyForm: FormState = { province: "", name: "", active: true };
const emptyBulk: BulkForm = { province: "", namesText: "", active: true };

function parseBulkNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,;]+/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

type Props = { token: string };

/** İlçeler — MySQL /v1/tahsilat/districts */
export default function DistrictsListPage({ token }: Props) {
  const { rows, loading, saveRow, removeRow, persistBulk } = useTahsilatDb(token, "districts");
  const [provinces, setProvinces] = useState<TahsilatAdminRow[]>([]);
  const [query, setQuery] = useState("");
  const [filterProvince, setFilterProvince] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [bulk, setBulk] = useState<BulkForm>(emptyBulk);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchTahsilatResource(token, "provinces")
      .then((data) => setProvinces(data.rows.filter((r) => r.active !== false)))
      .catch(() => setProvinces([]));
  }, [token]);

  const anyModal = modalOpen || bulkOpen || Boolean(deleteId);

  useEffect(() => {
    if (!anyModal) return;
    if (modalRef.current) {
      gsap.fromTo(
        modalRef.current,
        { autoAlpha: 0, y: 14, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.26, ease: "power2.out" },
      );
    }
  }, [anyModal, modalOpen, bulkOpen, deleteId]);

  useEffect(() => {
    if (!anyModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalOpen(false);
        setBulkOpen(false);
        setDeleteId(null);
        setEditId(null);
        setError("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyModal]);

  const provinceNames = useMemo(
    () =>
      provinces
        .map((p) => str(p, "name"))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "tr")),
    [provinces],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((r) => !filterProvince || str(r, "province") === filterProvince)
      .filter((r) => {
        if (!q) return true;
        return `${str(r, "name")} ${str(r, "province")}`.toLocaleLowerCase("tr-TR").includes(q);
      })
      .sort((a, b) => {
        const pa = str(a, "province").localeCompare(str(b, "province"), "tr");
        if (pa !== 0) return pa;
        return str(a, "name").localeCompare(str(b, "name"), "tr");
      });
  }, [rows, query, filterProvince]);

  function provinceIdByName(name: string) {
    const hit = provinces.find(
      (p) => str(p, "name").toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    return hit?.id || "";
  }

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyForm, province: filterProvince || provinceNames[0] || "" });
    setError("");
    setModalOpen(true);
  }

  function openBulk() {
    setBulk({ ...emptyBulk, province: filterProvince || provinceNames[0] || "" });
    setError("");
    setBulkOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setForm({
      province: str(row, "province"),
      name: str(row, "name"),
      active: row.active !== false,
    });
    setError("");
    setModalOpen(true);
  }

  async function saveSingle() {
    const name = form.name.trim();
    if (!form.province) {
      setError("İl seçin.");
      return;
    }
    if (!name) {
      setError("İlçe adı gerekli.");
      return;
    }
    const nextRow: TahsilatAdminRow = {
      id: editId || `new-${Date.now()}`,
      active: form.active,
      data: {
        name,
        province: form.province,
        provinceId: Number(provinceIdByName(form.province)) || 0,
      },
    };
    setBusy(true);
    try {
      await saveRow(nextRow);
      setModalOpen(false);
      setEditId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt yazılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function saveBulk() {
    if (!bulk.province) {
      setError("İl seçin.");
      return;
    }
    const names = parseBulkNames(bulk.namesText);
    if (!names.length) {
      setError("En az bir ilçe adı girin.");
      return;
    }
    const existing = new Set(
      rows
        .filter((r) => str(r, "province") === bulk.province)
        .map((r) => str(r, "name").toLocaleLowerCase("tr-TR")),
    );
    const pid = Number(provinceIdByName(bulk.province)) || 0;
    const added: TahsilatAdminRow[] = [];
    for (const name of names) {
      const key = name.toLocaleLowerCase("tr-TR");
      if (existing.has(key)) continue;
      existing.add(key);
      added.push({
        id: `new-${Date.now()}-${added.length}`,
        active: bulk.active,
        data: { name, province: bulk.province, provinceId: pid },
      });
    }
    if (!added.length) {
      setError("Eklenecek yeni ilçe yok.");
      return;
    }
    setBusy(true);
    try {
      await persistBulk(added);
      setBulkOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toplu kayıt yazılamadı.");
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
          <span className="bin-page-eyebrow">COĞRAFİ VERİLER</span>
          <h1>
            <MapPinned
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            İlçeler
          </h1>
          <p>Tanımlı ilçeleri görüntüleyin ve yönetin (merkez DB)</p>
        </div>
        <div className="bin-head-actions">
          <button type="button" className="bin-add secondary" onClick={openBulk} disabled={loading}>
            <ListPlus size={18} />
            Toplu Ekle
          </button>
          <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
            <Plus size={18} />
            Yeni İlçe
          </button>
        </div>
      </div>

      <p className="bin-hint">
        MySQL — AnyPay <code>/v1/tahsilat/districts</code>
      </p>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <div className="bin-toolbar-left">
            <label className="bin-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="İlçe veya il ara…"
              />
            </label>
            <select
              className="bin-filter-select"
              value={filterProvince}
              onChange={(e) => setFilterProvince(e.target.value)}
            >
              <option value="">İle Göre Filtrele</option>
              {provinceNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>
        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>İl</th>
                  <th>İlçe Adı</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{str(row, "province")}</td>
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
              <strong>{loading ? "Yükleniyor…" : "Kayıt yok"}</strong>
            </div>
          )}
        </div>
      </section>

      {modalOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true">
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "İlçe Düzenle" : "Yeni İlçe"}</h2>
                <p>İlçe bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label>
                  İl <em>*</em>
                </label>
                <select
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {provinceNames.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bin-field">
                <label>
                  İlçe Adı <em>*</em>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Bu ilçe aktif olarak listelensin.</p>
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
              <button type="button" className="primary" onClick={() => void saveSingle()} disabled={busy}>
                Kaydet
              </button>
              <button type="button" className="ghost" onClick={() => setModalOpen(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true">
            <div className="bin-modal-head">
              <div>
                <h2>Toplu İlçe Ekle</h2>
                <p>Bir ile birden fazla ilçe ekleyin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={() => setBulkOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label>
                  İl <em>*</em>
                </label>
                <select
                  value={bulk.province}
                  onChange={(e) => setBulk((f) => ({ ...f, province: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {provinceNames.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bin-field">
                <label>
                  İlçe adları <em>*</em>
                </label>
                <textarea
                  className="vpos-textarea"
                  rows={8}
                  value={bulk.namesText}
                  onChange={(e) => setBulk((f) => ({ ...f, namesText: e.target.value }))}
                  placeholder={"Aladağ\nCeyhan\nÇukurova"}
                />
              </div>
              {error ? <span className="bin-modal-error">{error}</span> : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={() => void saveBulk()} disabled={busy}>
                Toplu Kaydet
              </button>
              <button type="button" className="ghost" onClick={() => setBulkOpen(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div className="bin-modal-overlay" role="presentation">
          <div ref={modalRef} className="bin-modal" role="dialog" aria-modal="true">
            <div className="bin-modal-head">
              <div>
                <h2>İlçe silinsin mi?</h2>
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
