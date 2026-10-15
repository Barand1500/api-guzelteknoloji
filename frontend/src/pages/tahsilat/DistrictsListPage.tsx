import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListPlus, MapPinned, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  loadDistricts,
  loadProvinces,
  newGeoId,
  provinceNameById,
  saveDistricts,
  type DistrictRow,
  type ProvinceRow,
} from "./geoStore";
import "./binList.css";

type FormState = { provinceId: string; name: string; active: boolean };
type BulkForm = { provinceId: string; namesText: string; active: boolean };

const emptyForm: FormState = { provinceId: "", name: "", active: true };
const emptyBulk: BulkForm = { provinceId: "", namesText: "", active: true };

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

/** İlçeler — il filtresi + tekil / toplu ekleme */
export default function DistrictsListPage() {
  const [provinces] = useState<ProvinceRow[]>(() => loadProvinces().filter((p) => p.active));
  const [rows, setRows] = useState<DistrictRow[]>(loadDistricts);
  const [query, setQuery] = useState("");
  const [filterProvinceId, setFilterProvinceId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [bulk, setBulk] = useState<BulkForm>(emptyBulk);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveDistricts(rows);
  }, [rows]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((r) => !filterProvinceId || r.provinceId === filterProvinceId)
      .filter((r) => {
        if (!q) return true;
        const province = provinceNameById(r.provinceId);
        return `${r.name} ${province}`.toLocaleLowerCase("tr-TR").includes(q);
      })
      .sort((a, b) => {
        const pa = provinceNameById(a.provinceId).localeCompare(provinceNameById(b.provinceId), "tr");
        if (pa !== 0) return pa;
        return a.name.localeCompare(b.name, "tr");
      });
  }, [rows, query, filterProvinceId]);

  function openCreate() {
    setEditId(null);
    setForm({
      ...emptyForm,
      provinceId: filterProvinceId || provinces[0]?.id || "",
    });
    setError("");
    setModalOpen(true);
  }

  function openBulk() {
    setBulk({
      ...emptyBulk,
      provinceId: filterProvinceId || provinces[0]?.id || "",
    });
    setError("");
    setBulkOpen(true);
  }

  function openEdit(row: DistrictRow) {
    setEditId(row.id);
    setForm({ provinceId: row.provinceId, name: row.name, active: row.active });
    setError("");
    setModalOpen(true);
  }

  function closeSingle() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function closeBulk() {
    setBulkOpen(false);
    setError("");
  }

  function saveSingle() {
    const name = form.name.trim();
    if (!form.provinceId) {
      setError("İl seçin.");
      return;
    }
    if (!name) {
      setError("İlçe adı gerekli.");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        r.provinceId === form.provinceId &&
        r.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) {
      setError("Bu ilçede aynı ad zaten var.");
      return;
    }
    const next: DistrictRow = {
      id: editId || newGeoId("dist"),
      name,
      provinceId: form.provinceId,
      active: form.active,
    };
    setRows((prev) =>
      editId ? prev.map((r) => (r.id === editId ? next : r)) : [next, ...prev],
    );
    closeSingle();
  }

  function saveBulk() {
    if (!bulk.provinceId) {
      setError("İl seçin.");
      return;
    }
    const names = parseBulkNames(bulk.namesText);
    if (!names.length) {
      setError("En az bir ilçe adı girin (satır satır veya virgülle).");
      return;
    }
    const existing = new Set(
      rows
        .filter((r) => r.provinceId === bulk.provinceId)
        .map((r) => r.name.toLocaleLowerCase("tr-TR")),
    );
    const added: DistrictRow[] = [];
    let skipped = 0;
    for (const name of names) {
      const key = name.toLocaleLowerCase("tr-TR");
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      existing.add(key);
      added.push({
        id: newGeoId("dist"),
        name,
        provinceId: bulk.provinceId,
        active: bulk.active,
      });
    }
    if (!added.length) {
      setError("Eklenecek yeni ilçe yok (hepsi zaten kayıtlı).");
      return;
    }
    setRows((prev) => [...added, ...prev]);
    closeBulk();
    if (skipped > 0) {
      /* sessizce atlandı; istenirse toast eklenebilir */
    }
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
          <span className="bin-page-eyebrow">COĞRAFİ VERİLER</span>
          <h1>
            <MapPinned
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            İlçeler
          </h1>
          <p>Tanımlı ilçeleri görüntüleyin ve yönetin</p>
        </div>
        <div className="bin-head-actions">
          <button type="button" className="bin-add secondary" onClick={openBulk}>
            <ListPlus size={18} />
            Toplu Ekle
          </button>
          <button type="button" className="bin-add" onClick={openCreate}>
            <Plus size={18} />
            Yeni İlçe
          </button>
        </div>
      </div>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <div className="bin-toolbar-left">
            <label className="bin-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="İlçe veya il ara…"
                aria-label="İlçe ara"
              />
            </label>
            <select
              className="bin-filter-select"
              value={filterProvinceId}
              onChange={(e) => setFilterProvinceId(e.target.value)}
              aria-label="İle göre filtrele"
            >
              <option value="">İle Göre Filtrele</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
                    <td>{provinceNameById(row.provinceId)}</td>
                    <td>{row.name}</td>
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
              <strong>{query || filterProvinceId ? "Eşleşen kayıt yok" : "Henüz ilçe yok"}</strong>
              <span>
                {query || filterProvinceId
                  ? "Filtreyi veya aramayı değiştirin."
                  : "Tekil veya toplu ekleme ile başlayın."}
              </span>
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
            aria-labelledby="dist-modal-title"
            style={{ width: "min(460px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="dist-modal-title">{editId ? "İlçe Düzenle" : "Yeni İlçe"}</h2>
                <p>İlçe bilgilerini girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeSingle} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="dist-il">
                  İl <em>*</em>
                </label>
                <select
                  id="dist-il"
                  value={form.provinceId}
                  onChange={(e) => setForm((f) => ({ ...f, provinceId: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {provinces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bin-field">
                <label htmlFor="dist-name">
                  İlçe Adı <em>*</em>
                </label>
                <input
                  id="dist-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="İlçe Adı"
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
              <button type="button" className="primary" onClick={saveSingle}>
                {editId ? "Güncelle" : "Kaydet"}
              </button>
              <button type="button" className="ghost" onClick={closeSingle}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div
            ref={modalRef}
            className="bin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dist-bulk-title"
            style={{ width: "min(520px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="dist-bulk-title">Toplu İlçe Ekle</h2>
                <p>Bir ile birden fazla ilçe ekleyin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeBulk} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body">
              <div className="bin-field">
                <label htmlFor="bulk-il">
                  İl <em>*</em>
                </label>
                <select
                  id="bulk-il"
                  value={bulk.provinceId}
                  onChange={(e) => setBulk((f) => ({ ...f, provinceId: e.target.value }))}
                >
                  <option value="">Seçiniz</option>
                  {provinces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bin-field">
                <label htmlFor="bulk-names">
                  İlçe adları <em>*</em>
                </label>
                <textarea
                  id="bulk-names"
                  className="vpos-textarea"
                  rows={8}
                  value={bulk.namesText}
                  onChange={(e) => setBulk((f) => ({ ...f, namesText: e.target.value }))}
                  placeholder={"Her satıra bir ilçe\nveya virgülle ayırın\n\nÖrn:\nAladağ\nCeyhan\nÇukurova"}
                  autoFocus
                />
                <small className="bank-logo-hint">
                  Satır satır veya virgül / noktalı virgül ile ayırın. Aynı ildeki tekrarlar atlanır.
                </small>
              </div>
              <div className="vpos-active-row">
                <div>
                  <strong>Aktif</strong>
                  <p>Eklenen tüm ilçeler aktif olsun.</p>
                </div>
                <button
                  type="button"
                  className={`vpos-switch ${bulk.active ? "on" : ""}`}
                  role="switch"
                  aria-checked={bulk.active}
                  aria-label="Aktif"
                  onClick={() => setBulk((f) => ({ ...f, active: !f.active }))}
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
              <button type="button" className="primary" onClick={saveBulk}>
                Toplu Kaydet
              </button>
              <button type="button" className="ghost" onClick={closeBulk}>
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
            aria-labelledby="dist-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="dist-del-title">İlçe silinsin mi?</h2>
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
