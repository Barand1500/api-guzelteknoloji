import { useEffect, useState } from "react";
import { Mail, Save, Send } from "lucide-react";
import { useTahsilatDb } from "./useTahsilatDb";
import "./binList.css";

type EmailForm = {
  host: string;
  port: string;
  address: string;
  password: string;
  ssl: boolean;
  tls: boolean;
};

const DEFAULTS: EmailForm = {
  host: "smtp.gmail.com",
  port: "465",
  address: "",
  password: "",
  ssl: true,
  tls: true,
};

type Props = { token: string };

function flag(v: string | number | boolean | null | undefined) {
  if (v === true || v === 1 || v === "1" || v === "true") return true;
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  return true;
}

/** Sistem → E-Posta Ayarları — MySQL (tek satır) */
export default function EmailSettingsPage({ token }: Props) {
  const { rows, loading, saveRow } = useTahsilatDb(token, "email-settings");
  const [form, setForm] = useState<EmailForm>(DEFAULTS);
  const [rowId, setRowId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const row = rows[0];
    if (!row) {
      setRowId(null);
      setForm(DEFAULTS);
      return;
    }
    setRowId(row.id);
    setForm({
      host: String(row.data.host ?? DEFAULTS.host),
      port: String(row.data.port ?? DEFAULTS.port),
      address: String(row.data.address ?? ""),
      password: String(row.data.password ?? ""),
      ssl: flag(row.data.ssl),
      tls: flag(row.data.tls),
    });
  }, [rows]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = window.setTimeout(() => setSavedFlash(false), 2200);
    return () => window.clearTimeout(t);
  }, [savedFlash]);

  useEffect(() => {
    if (!testMsg) return;
    const t = window.setTimeout(() => setTestMsg(null), 4000);
    return () => window.clearTimeout(t);
  }, [testMsg]);

  async function onSave() {
    const host = form.host.trim();
    const port = form.port.trim();
    const address = form.address.trim();
    if (!host) {
      setError("E-posta sunucusu gerekli.");
      return;
    }
    if (!port || !/^\d+$/.test(port)) {
      setError("Geçerli bir port girin.");
      return;
    }
    if (!address || !address.includes("@")) {
      setError("Geçerli bir e-posta adresi girin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveRow({
        id: rowId || `new-${Date.now()}`,
        active: true,
        data: {
          host,
          port,
          address,
          password: form.password,
          ssl: form.ssl ? "1" : "0",
          tls: form.tls ? "1" : "0",
        },
      });
      setSavedFlash(true);
    } catch {
      setError("Ayarlar veritabanına yazılamadı.");
    } finally {
      setBusy(false);
    }
  }

  function onTestSend() {
    const to = testTo.trim();
    if (!to || !to.includes("@")) {
      setTestMsg({ ok: false, text: "Geçerli bir alıcı e-posta girin." });
      return;
    }
    if (!form.host.trim() || !form.address.trim()) {
      setTestMsg({ ok: false, text: "Önce sunucu ayarlarını kaydedin." });
      return;
    }
    setTestMsg({
      ok: true,
      text: `Sınama kaydı alındı → ${to} (gönderim API bağlanınca aktif olur).`,
    });
  }

  return (
    <div className="bin-page">
      <div className="bin-page-head">
        <div className="bin-page-head-copy">
          <span className="bin-page-eyebrow">SİSTEM</span>
          <h1>
            <Mail
              size={26}
              strokeWidth={2}
              style={{ display: "inline", marginRight: 10, verticalAlign: -4 }}
            />
            E-Posta Ayarları
          </h1>
          <p>Sistem e-posta gönderim ayarlarını buradan yönetin (merkez DB)</p>
        </div>
        <button
          type="button"
          className="bin-add primary-solid"
          onClick={() => void onSave()}
          disabled={busy || loading}
        >
          <Save size={18} />
          Kaydet
        </button>
      </div>

      <section className="bin-panel mail-panel">
        {loading ? <p className="bin-hint">Yükleniyor…</p> : null}
        <div className="mail-grid">
          <div className="bin-field">
            <label htmlFor="mail-host">E-Posta Sunucusu</label>
            <input
              id="mail-host"
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              placeholder="smtp.ornek.com"
              autoComplete="off"
            />
          </div>
          <div className="bin-field">
            <label htmlFor="mail-port">E-Posta Sunucu Portu</label>
            <input
              id="mail-port"
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              placeholder="465"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <div className="bin-field">
            <label htmlFor="mail-address">E-Posta Adresi</label>
            <input
              id="mail-address"
              type="email"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="bildirim@ornek.com"
              autoComplete="off"
            />
          </div>
          <div className="bin-field">
            <label htmlFor="mail-pass">E-Posta Şifresi</label>
            <input
              id="mail-pass"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="mail-toggles">
          <div className="vpos-active-row">
            <div>
              <strong>SSL Kullanımı</strong>
              <p>Bağlantıda SSL kullanılsın.</p>
            </div>
            <button
              type="button"
              className={`vpos-switch ${form.ssl ? "on" : ""}`}
              role="switch"
              aria-checked={form.ssl}
              onClick={() => setForm((f) => ({ ...f, ssl: !f.ssl }))}
            >
              <span />
            </button>
          </div>
          <div className="vpos-active-row">
            <div>
              <strong>TLS Kullanımı</strong>
              <p>Bağlantıda TLS kullanılsın.</p>
            </div>
            <button
              type="button"
              className={`vpos-switch ${form.tls ? "on" : ""}`}
              role="switch"
              aria-checked={form.tls}
              onClick={() => setForm((f) => ({ ...f, tls: !f.tls }))}
            >
              <span />
            </button>
          </div>
        </div>

        {error ? (
          <span className="bin-modal-error" role="alert">
            {error}
          </span>
        ) : null}
        {savedFlash ? (
          <span className="mail-flash ok" role="status">
            Ayarlar kaydedildi.
          </span>
        ) : null}
      </section>

      <section className="bin-panel mail-panel">
        <div className="mail-section-head">
          <Send size={22} strokeWidth={2} />
          <div>
            <h2>Sınama Gönderimi</h2>
            <p>Ayarları test etmek için örnek bir e-posta gönderin.</p>
          </div>
        </div>
        <div className="mail-test-row">
          <div className="bin-field mail-test-field">
            <label htmlFor="mail-test-to">Alıcı E-Posta</label>
            <input
              id="mail-test-to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="ornek@firma.com"
              autoComplete="off"
            />
          </div>
          <button type="button" className="bin-add primary-solid mail-send-btn" onClick={onTestSend}>
            <Send size={18} />
            Gönder
          </button>
        </div>
        {testMsg ? (
          <span className={`mail-flash ${testMsg.ok ? "ok" : "err"}`} role="status">
            {testMsg.text}
          </span>
        ) : null}
      </section>
    </div>
  );
}
