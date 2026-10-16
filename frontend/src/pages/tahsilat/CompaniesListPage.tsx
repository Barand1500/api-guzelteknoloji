import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  Database,
  Eye,
  EyeOff,
  FolderOpen,
  Globe2,
  KeyRound,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { issueCompanyApiKey, type TahsilatAdminRow } from "./tahsilatApi";
import { licenseBadge } from "./companiesStore";
import { str, useTahsilatDb } from "./useTahsilatDb";
import { TahsilatDataTable, type TahsilatTableColumn } from "./widgets/TahsilatDataTable";
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

function flag(v: string | number | boolean | null | undefined) {
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  return true;
}

function rowToForm(row: TahsilatAdminRow): FormState {
  return {
    name: str(row, "name"),
    active: row.active !== false,
    domain: str(row, "domain"),
    domainActive: flag(row.data.domainActive),
    dbHost: str(row, "dbHost"),
    dbPort: str(row, "dbPort") || "3306",
    dbName: str(row, "dbName"),
    dbUser: str(row, "dbUser"),
    dbPassword: str(row, "dbPassword"),
    dbActive: flag(row.data.dbActive),
    frontendPath: str(row, "frontendPath"),
    licenseEndsAt: str(row, "licenseEndsAt").slice(0, 10),
  };
}

type Props = { token: string };

/** Firmalar — MySQL (+ firma API Key → AnyPay) */
export default function CompaniesListPage({ token }: Props) {
  const {
    rows,
    loading,
    saving,
    error: dbError,
    setError: setDbError,
    saveRow,
    removeRow,
    setRows,
    reload,
    persistBulk,
  } = useTahsilatDb(token, "companies");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keyBusyId, setKeyBusyId] = useState<string | null>(null);
  const [showDbPassword, setShowDbPassword] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const editingRow = editId ? rows.find((r) => r.id === editId) : null;
  const editingApiKey = editingRow ? str(editingRow, "apiKey") : "";

  async function copyKey(key: string, id: string) {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Kopyalama başarısız.");
    }
  }

  async function onIssueKey(companyId: string, rotate: boolean) {
    setKeyBusyId(companyId);
    setError("");
    try {
      const data = await issueCompanyApiKey(token, companyId, rotate);
      if (data.rows) setRows(data.rows);
      else await reload();
    } catch {
      setError(rotate ? "Anahtar yenilenemedi." : "Anahtar oluşturulamadı.");
    } finally {
      setKeyBusyId(null);
    }
  }

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
    () => rows.slice().sort((a, b) => str(a, "name").localeCompare(str(b, "name"), "tr")),
    [rows],
  );

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setShowDbPassword(false);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: TahsilatAdminRow) {
    setEditId(row.id);
    setForm(rowToForm(row));
    setShowDbPassword(false);
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
        (str(r, "domain").toLocaleLowerCase("tr-TR") === domain ||
          str(r, "name").toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR")),
    );
    if (dup) {
      setError("Bu firma adı veya domain zaten var.");
      return;
    }
    let dbPassword = form.dbPassword;
    if (editId && !form.dbPassword.trim()) {
      dbPassword = str(rows.find((r) => r.id === editId)!, "dbPassword");
    }
    const licenseEndsAt = form.licenseEndsAt
      ? new Date(`${form.licenseEndsAt}T23:59:59`).toISOString()
      : new Date().toISOString();
    setBusy(true);
    try {
      await saveRow({
        id: editId || `new-${Date.now()}`,
        active: form.active,
        data: {
          name,
          domain,
          domainActive: form.domainActive ? "1" : "0",
          dbHost: form.dbHost.trim(),
          dbPort: form.dbPort.trim(),
          dbName: form.dbName.trim(),
          dbUser: form.dbUser.trim(),
          dbPassword,
          dbActive: form.dbActive ? "1" : "0",
          frontendPath: form.frontendPath.trim(),
          licenseEndsAt,
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
    { id: "name", label: "Firma Adı", accessor: (r) => str(r, "name") },
    { id: "domain", label: "Domain", mono: true, accessor: (r) => str(r, "domain") },
    {
      id: "apiKey",
      label: "API Key",
      filterable: false,
      accessor: (r) => str(r, "apiKey"),
      render: (row) => {
        const apiKey = str(row, "apiKey");
        if (apiKey) {
          return (
            <div className="firm-key-cell">
              <code className="firm-key-code" title={apiKey}>
                {apiKey.slice(0, 12)}…
              </code>
              <button
                type="button"
                className="bin-icon-btn"
                title="Kopyala"
                aria-label="API Key kopyala"
                onClick={() => void copyKey(apiKey, row.id)}
              >
                {copiedId === row.id ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          );
        }
        return (
          <button
            type="button"
            className="firm-key-create"
            disabled={keyBusyId === row.id}
            onClick={() => void onIssueKey(row.id, true)}
          >
            <KeyRound size={14} />
            Anahtar oluştur
          </button>
        );
      },
    },
    {
      id: "license",
      label: "Lisans",
      accessor: (r) => licenseBadge(str(r, "licenseEndsAt")).label,
      render: (row) => {
        const lic = licenseBadge(str(row, "licenseEndsAt"));
        return <span className={`firm-lic tone-${lic.tone}`}>{lic.label}</span>;
      },
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
          <button type="button" className="bin-icon-btn success" onClick={() => openEdit(row)}>
            <List size={16} />
          </button>
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
          <span className="bin-page-eyebrow">TAHSİLAT</span>
          <h1>
            <Building2
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            Firmalar
          </h1>
          <p>Firma kaydı oluşunca API Key üretilir — AnyPay’e bu anahtarı yapıştırın</p>
        </div>
        <button type="button" className="bin-add" onClick={openCreate} disabled={loading}>
          <Plus size={18} />
          Yeni Firma
        </button>
      </div>

      <p className="bin-hint">
        AnyPay → API Ayarları → «Güzel Teknoloji merkezi API» alanına aşağıdaki <strong>API Key</strong>’i
        kopyalayın. Yol: <code>https://api.guzelteknoloji.com/v1/tahsilat</code>
      </p>

      {dbError ? (
        <p className="bin-hint" style={{ color: "#be123c" }} role="alert">
          {dbError}
        </p>
      ) : null}

      <TahsilatDataTable
        rows={tableRows}
        columns={tableColumns}
        getRowId={(r) => r.id}
        storageKey="tahsilat-companies"
        searchPlaceholder="Firma veya domain ara…"
        loading={loading}
        emptyTitle="Henüz firma yok"
        emptyHint="Yeni Firma ile ekleyin. Excel yalnızca ad, domain ve lisans tarihi içerir (DB bilgisi yok)."
        exportFileName="firmalar"
        excelImport={{
          title: "Firma Excel içe aktar (güvenli alanlar)",
          templateFileName: "firmalar-sablon.xlsx",
          columns: [
            { key: "name", label: "Firma Adı", required: true },
            { key: "domain", label: "Domain", required: true },
            { key: "licenseEndsAt", label: "Lisans Bitiş", aliases: ["lisans", "license"] },
          ],
          validateRow: (cells) => {
            if (!cells.name.trim()) return "Firma adı gerekli";
            if (!cells.domain.trim()) return "Domain gerekli";
            return null;
          },
          mapRow: (cells, index) => {
            const domain = cells.domain.trim().toLocaleLowerCase("tr-TR");
            const licenseRaw = cells.licenseEndsAt.trim();
            const licenseEndsAt = licenseRaw
              ? new Date(`${licenseRaw.slice(0, 10)}T23:59:59`).toISOString()
              : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
            return {
              id: `import-${Date.now()}-${index}`,
              active: true,
              data: {
                name: cells.name.trim(),
                domain,
                domainActive: "1",
                dbActive: "1",
                dbHost: "",
                dbPort: "3306",
                dbName: "",
                dbUser: "",
                dbPassword: "",
                frontendPath: "",
                licenseEndsAt,
              },
            };
          },
          onConfirm: async (imported) => {
            const existing = new Set(rows.map((r) => str(r, "domain").toLocaleLowerCase("tr-TR")));
            const fresh = imported.filter(
              (r) => !existing.has(str(r, "domain").toLocaleLowerCase("tr-TR")),
            );
            if (!fresh.length) {
              throw new Error("İçe aktarılacak yeni firma yok (domain zaten kayıtlı).");
            }
            await persistBulk(fresh);
            setDbError("");
          },
        }}
      />

      {modalOpen ? (
        <div className="bin-modal-overlay" role="presentation">
          <div ref={modalRef} className="bin-modal firm-modal" role="dialog" aria-modal="true">
            <div className="bin-modal-head">
              <div>
                <h2>{editId ? "Firma Düzenle" : "Yeni Firma"}</h2>
                <p>Firma, domain ve veritabanı bilgilerini birlikte girin.</p>
              </div>
              <button type="button" className="bin-modal-close" onClick={closeModal}>
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
                  <label>
                    Firma Adı <em>*</em>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="bin-field">
                  <label>Lisans Bitiş</label>
                  <input
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
                  <label>
                    Domain <em>*</em>
                  </label>
                  <input
                    value={form.domain}
                    onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
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
                    <label>
                      Host <em>*</em>
                    </label>
                    <input
                      value={form.dbHost}
                      onChange={(e) => setForm((f) => ({ ...f, dbHost: e.target.value }))}
                    />
                  </div>
                  <div className="bin-field">
                    <label>
                      Port <em>*</em>
                    </label>
                    <input
                      value={form.dbPort}
                      onChange={(e) => setForm((f) => ({ ...f, dbPort: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="bin-field-row">
                  <div className="bin-field">
                    <label>
                      Veritabanı Adı <em>*</em>
                    </label>
                    <input
                      value={form.dbName}
                      onChange={(e) => setForm((f) => ({ ...f, dbName: e.target.value }))}
                    />
                  </div>
                  <div className="bin-field">
                    <label>
                      Kullanıcı Adı <em>*</em>
                    </label>
                    <input
                      value={form.dbUser}
                      onChange={(e) => setForm((f) => ({ ...f, dbUser: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="bin-field">
                  <label>
                    Şifre {!editId ? <em>*</em> : null}
                  </label>
                  <div className="firm-password-field">
                    <input
                      type={showDbPassword ? "text" : "password"}
                      value={form.dbPassword}
                      onChange={(e) => setForm((f) => ({ ...f, dbPassword: e.target.value }))}
                      placeholder={editId ? "Değiştirmek için yazın" : "••••••••"}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="firm-password-toggle"
                      aria-label={showDbPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                      title={showDbPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                      aria-pressed={showDbPassword}
                      onClick={() => setShowDbPassword((visible) => !visible)}
                    >
                      {showDbPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
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
                  <label>Frontend Dizin Yolu</label>
                  <input
                    value={form.frontendPath}
                    onChange={(e) => setForm((f) => ({ ...f, frontendPath: e.target.value }))}
                  />
                </div>
              </section>

              {editId ? (
                <section className="firm-section">
                  <header>
                    <span className="firm-section-icon">
                      <KeyRound size={18} />
                    </span>
                    <h3>Merkezi API Key</h3>
                  </header>
                  <p className="bank-logo-hint" style={{ marginBottom: 10 }}>
                    Bu anahtarı AnyPay → API Ayarları → Güzel Teknoloji merkezi API alanına yapıştırın.
                  </p>
                  {editingApiKey ? (
                    <div className="firm-key-box">
                      <code>{editingApiKey}</code>
                      <div className="firm-key-actions">
                        <button
                          type="button"
                          className="bin-icon-btn"
                          title="Kopyala"
                          onClick={() => void copyKey(editingApiKey, editId)}
                        >
                          {copiedId === editId ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                        <button
                          type="button"
                          className="bin-icon-btn"
                          title="Yenile"
                          disabled={keyBusyId === editId}
                          onClick={() => void onIssueKey(editId, true)}
                        >
                          <RefreshCw size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="firm-key-create"
                      disabled={keyBusyId === editId}
                      onClick={() => void onIssueKey(editId, true)}
                    >
                      <KeyRound size={14} />
                      API Key oluştur
                    </button>
                  )}
                </section>
              ) : (
                <p className="bank-logo-hint">
                  Kaydettikten sonra bu firma için otomatik API Key üretilir.
                </p>
              )}

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
                <h2>Firma silinsin mi?</h2>
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
