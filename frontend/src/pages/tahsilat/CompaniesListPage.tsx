import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  Database,
  FolderOpen,
  Globe2,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  licenseBadge,
  loadCompanies,
  newCompanyId,
  saveCompanies,
  type CompanyRow,
} from "./companiesStore";
import "./binList.css";

type FormState = {
  name: string;
  active: boolean;
  domain: string;
  domainActive: boolean;
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbActive: boolean;
  frontendPath: string;
  licenseEndsAt: string;
};

const emptyForm = (): FormState => ({
  name: "",
  active: true,
  domain: "",
  domainActive: true,
  dbHost: "",
  dbPort: "3306",
  dbName: "",
  dbUser: "",
  dbPassword: "",
  dbActive: true,
  frontendPath: "",
  licenseEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
});

function rowToForm(row: CompanyRow): FormState {
  return {
    name: row.name,
    active: row.active,
    domain: row.domain,
    domainActive: row.domainActive,
    dbHost: row.dbHost,
    dbPort: row.dbPort,
    dbName: row.dbName,
    dbUser: row.dbUser,
    dbPassword: row.dbPassword,
    dbActive: row.dbActive,
    frontendPath: row.frontendPath,
    licenseEndsAt: row.licenseEndsAt.slice(0, 10),
  };
}

/** Firmalar */
export default function CompaniesListPage() {
  const [rows, setRows] = useState<CompanyRow[]>(loadCompanies);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveCompanies(rows);
  }, [rows]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((r) => {
        if (!q) return true;
        return `${r.name} ${r.domain} ${r.dbName}`.toLocaleLowerCase("tr-TR").includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [rows, query]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: CompanyRow) {
    setEditId(row.id);
    setForm(rowToForm(row));
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError("");
  }

  function onSave() {
    const name = form.name.trim();
    const domain = form.domain.trim().toLocaleLowerCase("tr-TR");
    if (!name) {
      setError("Firma adı gerekli.");
      return;
    }
    if (!domain) {
      setError("Domain gerekli.");
      return;
    }
    if (!form.dbHost.trim() || !form.dbPort.trim() || !form.dbName.trim() || !form.dbUser.trim()) {
      setError("Veritabanı alanlarını doldurun.");
      return;
    }
    if (!editId && !form.dbPassword.trim()) {
      setError("Şifre gerekli.");
      return;
    }
    const dup = rows.some(
      (r) =>
        r.id !== editId &&
        (r.domain.toLocaleLowerCase("tr-TR") === domain ||
          r.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR")),
    );
    if (dup) {
      setError("Bu firma adı veya domain zaten var.");
      return;
    }
    const licenseEndsAt = form.licenseEndsAt
      ? new Date(`${form.licenseEndsAt}T23:59:59`).toISOString()
      : new Date().toISOString();
    const next: CompanyRow = {
      id: editId || newCompanyId(),
      name,
      active: form.active,
      domain,
      domainActive: form.domainActive,
      dbHost: form.dbHost.trim(),
      dbPort: form.dbPort.trim(),
      dbName: form.dbName.trim(),
      dbUser: form.dbUser.trim(),
      dbPassword: form.dbPassword,
      dbActive: form.dbActive,
      frontendPath: form.frontendPath.trim(),
      licenseEndsAt,
    };
    if (editId && !form.dbPassword.trim()) {
      const prev = rows.find((r) => r.id === editId);
      next.dbPassword = prev?.dbPassword || "";
    }
    setRows((prev) => (editId ? prev.map((r) => (r.id === editId ? next : r)) : [next, ...prev]));
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
          <span className="bin-page-eyebrow">TAHSİLAT</span>
          <h1>
            <Building2
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Firmalar
          </h1>
          <p>Kayıtlı firmaları, domain ve veritabanı bilgilerini yönetin</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate}>
          <Plus size={18} />
          Yeni Firma
        </button>
      </div>

      <section className="bin-panel">
        <div className="bin-toolbar">
          <div className="bin-toolbar-left">
            <label className="bin-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Firma veya domain ara…"
                aria-label="Firma ara"
              />
            </label>
          </div>
          <span className="bin-count">{filtered.length} kayıt</span>
        </div>

        <div className="bin-table-wrap">
          {filtered.length ? (
            <table className="bin-table">
              <thead>
                <tr>
                  <th>Firma Adı</th>
                  <th>Domain</th>
                  <th>Lisans</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const lic = licenseBadge(row.licenseEndsAt);
                  return (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.domain}</td>
                      <td>
                        <span className={`firm-lic tone-${lic.tone}`}>{lic.label}</span>
                      </td>
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
                            className="bin-icon-btn success"
                            title="Detay"
                            aria-label="Detay"
                            onClick={() => openEdit(row)}
                          >
                            <List size={16} />
                          </button>
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
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="bin-empty">
              <strong>{query ? "Eşleşen kayıt yok" : "Henüz firma yok"}</strong>
              <span>{query ? "Aramayı değiştirin." : "Yeni Firma ile başlayın."}</span>
            </div>
          )}
        </div>
      </section>

      {modalOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div
            ref={modalRef}
            className="bin-modal firm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="firm-modal-title"
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="firm-modal-title">{editId ? "Firma Düzenle" : "Yeni Firma"}</h2>
                <p>Firma, domain ve veritabanı bilgilerini birlikte girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="bin-modal-body firm-modal-body">
              <section className="firm-section">
                <header>
                  <span className="firm-section-icon">
                    <Building2 size={18} />
                  </span>
                  <h3>Firma Bilgileri</h3>
                </header>
                <div className="bin-field">
                  <label htmlFor="firm-name">
                    Firma Adı <em>*</em>
                  </label>
                  <input
                    id="firm-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Firma Adı"
                    autoFocus
                  />
                </div>
                <div className="bin-field">
                  <label htmlFor="firm-lic">Lisans Bitiş</label>
                  <input
                    id="firm-lic"
                    type="date"
                    value={form.licenseEndsAt}
                    onChange={(e) => setForm((f) => ({ ...f, licenseEndsAt: e.target.value }))}
                  />
                </div>
                <div className="vpos-active-row">
                  <div>
                    <strong>Firma Aktif</strong>
                    <p>Firma sistemde aktif olarak görünsün.</p>
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
              </section>

              <section className="firm-section">
                <header>
                  <span className="firm-section-icon">
                    <Globe2 size={18} />
                  </span>
                  <h3>Domain Ayarları</h3>
                </header>
                <div className="bin-field">
                  <label htmlFor="firm-domain">
                    Domain <em>*</em>
                  </label>
                  <input
                    id="firm-domain"
                    value={form.domain}
                    onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                    placeholder="demo.anypay.com.tr"
                  />
                </div>
                <div className="vpos-active-row">
                  <div>
                    <strong>Domain Aktif</strong>
                    <p>Bu domain üzerinden gelen istekler yönlendirilsin.</p>
                  </div>
                  <button
                    type="button"
                    className={`vpos-switch ${form.domainActive ? "on" : ""}`}
                    role="switch"
                    aria-checked={form.domainActive}
                    onClick={() => setForm((f) => ({ ...f, domainActive: !f.domainActive }))}
                  >
                    <span />
                  </button>
                </div>
              </section>

              <section className="firm-section">
                <header>
                  <span className="firm-section-icon">
                    <Database size={18} />
                  </span>
                  <h3>Veritabanı Bağlantısı</h3>
                </header>
                <div className="bin-field-row">
                  <div className="bin-field">
                    <label htmlFor="firm-host">
                      Host <em>*</em>
                    </label>
                    <input
                      id="firm-host"
                      value={form.dbHost}
                      onChange={(e) => setForm((f) => ({ ...f, dbHost: e.target.value }))}
                      placeholder="127.0.0.1"
                    />
                  </div>
                  <div className="bin-field">
                    <label htmlFor="firm-port">
                      Port <em>*</em>
                    </label>
                    <input
                      id="firm-port"
                      value={form.dbPort}
                      onChange={(e) => setForm((f) => ({ ...f, dbPort: e.target.value }))}
                      placeholder="3306"
                    />
                  </div>
                </div>
                <div className="bin-field-row">
                  <div className="bin-field">
                    <label htmlFor="firm-dbname">
                      Veritabanı Adı <em>*</em>
                    </label>
                    <input
                      id="firm-dbname"
                      value={form.dbName}
                      onChange={(e) => setForm((f) => ({ ...f, dbName: e.target.value }))}
                    />
                  </div>
                  <div className="bin-field">
                    <label htmlFor="firm-dbuser">
                      Kullanıcı Adı <em>*</em>
                    </label>
                    <input
                      id="firm-dbuser"
                      value={form.dbUser}
                      onChange={(e) => setForm((f) => ({ ...f, dbUser: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="bin-field">
                  <label htmlFor="firm-dbpass">
                    Şifre {!editId ? <em>*</em> : null}
                  </label>
                  <input
                    id="firm-dbpass"
                    type="password"
                    value={form.dbPassword}
                    onChange={(e) => setForm((f) => ({ ...f, dbPassword: e.target.value }))}
                    placeholder={editId ? "Değiştirmek için yazın" : "••••••••"}
                    autoComplete="new-password"
                  />
                </div>
                <div className="vpos-active-row">
                  <div>
                    <strong>Veritabanı Bağlantısı Aktif</strong>
                    <p>Bu veritabanı bağlantısı aktif olarak kullanılsın.</p>
                  </div>
                  <button
                    type="button"
                    className={`vpos-switch ${form.dbActive ? "on" : ""}`}
                    role="switch"
                    aria-checked={form.dbActive}
                    onClick={() => setForm((f) => ({ ...f, dbActive: !f.dbActive }))}
                  >
                    <span />
                  </button>
                </div>
              </section>

              <section className="firm-section">
                <header>
                  <span className="firm-section-icon">
                    <FolderOpen size={18} />
                  </span>
                  <h3>Sunucu Dizini</h3>
                </header>
                <div className="bin-field">
                  <label htmlFor="firm-path">Frontend Dizin Yolu</label>
                  <input
                    id="firm-path"
                    value={form.frontendPath}
                    onChange={(e) => setForm((f) => ({ ...f, frontendPath: e.target.value }))}
                    placeholder="/home/.../htdocs/..."
                  />
                  <small className="bank-logo-hint">
                    Sürüm dağıtımında ZIP bu dizine çıkartılır. Boş bırakılırsa bu firmaya dağıtım
                    yapılmaz.
                  </small>
                </div>
              </section>

              {error ? (
                <span className="bin-modal-error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
            <div className="bin-modal-foot">
              <button type="button" className="primary" onClick={onSave}>
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
            aria-labelledby="firm-del-title"
            style={{ width: "min(400px, 100%)" }}
          >
            <div className="bin-modal-head">
              <div>
                <h2 id="firm-del-title">Firma silinsin mi?</h2>
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
