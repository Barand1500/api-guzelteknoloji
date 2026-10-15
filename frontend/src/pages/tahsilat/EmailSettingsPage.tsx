import { useEffect, useState } from "react";
import { Mail, Save, Send } from "lucide-react";
import "./binList.css";

type EmailSettings = {
  host: string;
  port: string;
  address: string;
  password: string;
  ssl: boolean;
  tls: boolean;
};

const STORAGE_KEY = "gtk_tahsilat_email_settings_v1";

const DEFAULTS: EmailSettings = {
  host: "smtp.gmail.com",
  port: "465",
  address: "sitebildirim@gmail.com",
  password: "",
  ssl: true,
  tls: true,
};

function loadSettings(): EmailSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && typeof raw === "object") {
      return {
        host: String(raw.host ?? DEFAULTS.host),
        port: String(raw.port ?? DEFAULTS.port),
        address: String(raw.address ?? DEFAULTS.address),
        password: String(raw.password ?? ""),
        ssl: raw.ssl !== false,
        tls: raw.tls !== false,
      };
    }
  } catch {
    /* varsayılan */
  }
  return { ...DEFAULTS };
}

/** Sistem → E-Posta Ayarları */
export default function EmailSettingsPage() {
  const [form, setForm] = useState<EmailSettings>(loadSettings);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState("");

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

  function onSave() {
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
    const next = { ...form, host, port, address };
    setForm(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setError("");
    setSavedFlash(true);
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
    /* UI iskeleti — gerçek SMTP gönderimi API sonrası */
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
          <p>Sistem e-posta gönderim ayarlarını buradan yönetin</p>
        </div>
        <button type="button" className="bin-add primary-solid" onClick={onSave}>
          <Save size={18} />
          Kaydet
        </button>
      </div>

      <section className="bin-panel mail-panel">
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
              aria-label="SSL"
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
              aria-label="TLS"
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
